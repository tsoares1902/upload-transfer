import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';

import type { UploadTransportInterface } from '../../interfaces/UploadTransportInterface.js';
import type { UploadInputDTO } from '../../types/UploadInputDTO.js';
import type { UploadOutputDTO } from '../../types/UploadOutputDTO.js';

import { UploadAbortException } from '../../exceptions/UploadAbortException.js';
import { UploadHttpException } from '../../exceptions/UploadHttpException.js';
import { UploadNetworkException } from '../../exceptions/UploadNetworkException.js';
import { UploadTimeoutException } from '../../exceptions/UploadTimeoutException.js';

export class NodeTransportAdapter implements UploadTransportInterface {
  /**
   * Envia um arquivo por HTTP utilizando os módulos nativos do Node.js.
   *
   * @param {UploadInputDTO} input Dados da transferência e opções de controle.
   * @returns {Promise<UploadOutputDTO>} Resultado HTTP da transferência.
   */
  async upload(input: UploadInputDTO): Promise<UploadOutputDTO> {
    if (input.signal?.aborted) {
      throw new UploadAbortException();
    }

    let url: URL;

    try {
      url = new URL(input.url);
    } catch (error) {
      throw new UploadNetworkException('Invalid upload URL.', { cause: error });
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new UploadNetworkException('Unsupported upload URL protocol.');
    }

    const fileSize = input.file.size;
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;

    return new Promise<UploadOutputDTO>((resolve, reject) => {
      let settled = false;
      let request: ClientRequest | undefined;
      let response: IncomingMessage | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
      let stopWrite: (() => void) | undefined;
      let loaded = 0;
      let bodyEnded = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;

      /**
       * Libera os recursos associados à transferência.
       *
       * @returns {void} Não retorna valor.
       */
      const cleanup = (): void => {
        input.signal?.removeEventListener('abort', abort);

        if (timeout !== undefined) {
          clearTimeout(timeout);
        }

        if (reader) {
          void reader.cancel().catch(() => undefined);
          reader.releaseLock();
          reader = undefined;
        }

        stopWrite?.();
        stopWrite = undefined;
      };

      /**
       * Finaliza a operação uma única vez.
       *
       * @param {() => void} callback Ação de resolução ou rejeição.
       * @returns {void} Não retorna valor.
       */
      const settle = (callback: () => void): void => {
        if (settled) return;

        settled = true;
        cleanup();
        callback();
      };

      /**
       * Rejeita a transferência e encerra seus streams HTTP.
       *
       * @param {Error} error Falha original da transferência.
       * @returns {void} Não retorna valor.
       */
      const fail = (error: Error): void => {
        settle(() => {
          response?.destroy();
          request?.destroy();
          reject(error);
        });
      };

      /**
       * Cancela a requisição quando solicitado pelo consumidor.
       *
       * @returns {void} Não retorna valor.
       */
      const abort = (): void => {
        fail(new UploadAbortException());
      };

      /**
       * Encerra a transferência quando o tempo limite é atingido.
       *
       * @returns {void} Não retorna valor.
       */
      const onTimeout = (): void => {
        fail(new UploadTimeoutException());
      };

      /**
       * Converte falhas da requisição em erro de rede.
       *
       * @param {Error} error Causa informada pelo transporte.
       * @returns {void} Não retorna valor.
       */
      const onRequestError = (error: Error): void => {
        fail(new UploadNetworkException('Network error during upload.', { cause: error }));
      };

      /**
       * Consome a resposta e valida a conclusão integral do envio.
       *
       * @param {IncomingMessage} incoming Resposta HTTP recebida.
       * @returns {void} Não retorna valor.
       */
      const onResponse = (incoming: IncomingMessage): void => {
        response = incoming;

        /**
         * Valida o status HTTP e a conclusão da requisição.
         *
         * @returns {void} Não retorna valor.
         */
        const onEnd = (): void => {
          const status = incoming.statusCode ?? 0;

          if (status < 200 || status >= 300) {
            fail(new UploadHttpException(status));
          } else if (!bodyEnded || loaded !== fileSize || !request?.writableFinished) {
            fail(
              new UploadNetworkException('Successful response received before upload completed.'),
            );
          } else {
            settle(() => resolve({ status }));
          }
        };

        /**
         * Preserva a causa de uma falha no corpo da resposta.
         *
         * @param {Error} error Causa informada pelo stream.
         * @returns {void} Não retorna valor.
         */
        const onError = (error: Error): void => {
          fail(new UploadNetworkException('Response stream failed.', { cause: error }));
        };

        /**
         * Rejeita uma resposta interrompida.
         *
         * @returns {void} Não retorna valor.
         */
        const onAborted = (): void => {
          fail(new UploadNetworkException('Response was interrupted.'));
        };

        incoming.on('end', onEnd);
        incoming.on('error', onError);
        incoming.on('aborted', onAborted);
        incoming.once('close', () => {
          incoming.removeListener('end', onEnd);
          incoming.removeListener('error', onError);
          incoming.removeListener('aborted', onAborted);
        });

        if (settled) {
          incoming.destroy();
        } else if ((incoming.statusCode ?? 0) < 200 || (incoming.statusCode ?? 0) >= 300) {
          fail(new UploadHttpException(incoming.statusCode ?? 0));
        } else {
          incoming.resume();
        }
      };

      try {
        const options: RequestOptions = {
          method: input.method,
          headers: input.headers,
        };

        request = transport(url, options, onResponse);
        request.on('error', onRequestError);
        request.once('close', () => {
          request?.removeListener('error', onRequestError);
          request?.removeListener('response', onResponse);
          if (!settled) {
            fail(new UploadNetworkException('Request closed before upload completed.'));
          }
        });

        input.signal?.addEventListener('abort', abort, { once: true });

        if (input.signal?.aborted) {
          abort();
          return;
        }

        if (input.timeoutMs !== undefined) {
          timeout = setTimeout(onTimeout, input.timeoutMs);
        }

        void (async () => {
          try {
            reader = input.file.stream().getReader();

            if (settled) {
              cleanup();
              return;
            }

            try {
              while (!settled && reader) {
                const { done, value } = await reader.read();

                if (done || settled) break;

                const chunk = Buffer.from(value);

                await new Promise<void>((resolveWrite, rejectWrite) => {
                  stopWrite = () => rejectWrite(new UploadNetworkException('Upload stopped.'));
                  try {
                    request!.write(chunk, (error?: Error | null) => {
                      stopWrite = undefined;
                      if (error) {
                        rejectWrite(error);
                      } else {
                        resolveWrite();
                      }
                    });
                  } catch (error) {
                    stopWrite = undefined;
                    rejectWrite(error);
                  }
                });

                if (settled) break;

                loaded += chunk.byteLength;

                input.onProgress?.({
                  loaded,
                  lengthComputable: true,
                  total: fileSize,
                  percentage: fileSize > 0 ? (loaded / fileSize) * 100 : 100,
                });
              }

              if (!settled) {
                if (loaded !== fileSize) {
                  throw new UploadNetworkException('Upload stream size does not match file size.');
                }
                bodyEnded = true;
                reader?.releaseLock();
                reader = undefined;
                request?.end();
              }
            } finally {
              if (settled) {
                reader?.releaseLock();
                reader = undefined;
              }
            }
          } catch (error) {
            if (!settled) {
              fail(new UploadNetworkException('Failed to stream upload.', { cause: error }));
            }
          }
        })();
      } catch (error) {
        fail(new UploadNetworkException('Failed to start upload.', { cause: error }));
      }
    });
  }
}

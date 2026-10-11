import type { UploadTransportInterface } from '../../interfaces/UploadTransportInterface.js';
import type { UploadInputDTO } from '../../types/UploadInputDTO.js';
import type { UploadOutputDTO } from '../../types/UploadOutputDTO.js';

import { UploadAbortException } from '../../exceptions/UploadAbortException.js';
import { UploadHttpException } from '../../exceptions/UploadHttpException.js';
import { UploadNetworkException } from '../../exceptions/UploadNetworkException.js';
import { UploadTimeoutException } from '../../exceptions/UploadTimeoutException.js';

export class XhrTransportAdapter implements UploadTransportInterface {
  /**
   * Envia um arquivo por HTTP utilizando XMLHttpRequest.
   *
   * @param {UploadInputDTO} input Dados da transferência e opções de controle.
   * @returns {Promise<UploadOutputDTO>} Resultado HTTP da transferência.
   */
  upload(input: UploadInputDTO): Promise<UploadOutputDTO> {
    return new Promise<UploadOutputDTO>((resolve, reject) => {
      if (input.signal?.aborted) {
        reject(new UploadAbortException());
        return;
      }

      const xhr = new XMLHttpRequest();
      let settled = false;

      /**
       * Finaliza a operação uma única vez e libera os listeners.
       *
       * @param {() => void} callback Ação de resolução ou rejeição.
       * @returns {void} Conclui sem retornar um valor.
       */
      const settle = (callback: () => void): void => {
        if (settled) return;

        settled = true;
        input.signal?.removeEventListener('abort', abort);
        callback();
      };

      /**
       * Cancela a transferência quando solicitado pelo consumidor.
       *
       * @returns {void} Conclui sem retornar um valor.
       */
      const abort = (): void => {
        xhr.abort();
        settle(() => reject(new UploadAbortException()));
      };

      xhr.onload = () => {
        settle(() => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ status: xhr.status });
          } else {
            reject(new UploadHttpException(xhr.status));
          }
        });
      };

      xhr.onerror = () => {
        settle(() => reject(new UploadNetworkException()));
      };

      xhr.ontimeout = () => {
        settle(() => reject(new UploadTimeoutException()));
      };

      xhr.onabort = () => {
        settle(() => reject(new UploadAbortException()));
      };

      if (input.onProgress) {
        xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
          const lengthComputable = event.lengthComputable;

          input.onProgress?.({
            loaded: event.loaded,
            lengthComputable,
            ...(lengthComputable
              ? {
                  total: event.total,
                  percentage: event.total > 0 ? (event.loaded / event.total) * 100 : 100,
                }
              : {}),
          });
        };
      }

      try {
        xhr.open(input.method, input.url);

        for (const [name, value] of Object.entries(input.headers)) {
          xhr.setRequestHeader(name, value);
        }

        if (input.timeoutMs !== undefined) {
          xhr.timeout = input.timeoutMs;
        }

        input.signal?.addEventListener('abort', abort, { once: true });

        if (input.signal?.aborted) {
          abort();
          return;
        }

        xhr.send(input.file);
      } catch (error) {
        settle(() =>
          reject(new UploadNetworkException('Failed to start upload.', { cause: error })),
        );
      }
    });
  }
}

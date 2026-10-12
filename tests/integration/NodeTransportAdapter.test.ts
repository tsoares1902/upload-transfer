import { ClientRequest, createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { finished } from 'node:stream/promises';
import { getEventListeners } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NodeTransportAdapter } from '../../src/adapters/transports/NodeTransportAdapter.js';
import { UploadAbortException } from '../../src/exceptions/UploadAbortException.js';
import { UploadNetworkException } from '../../src/exceptions/UploadNetworkException.js';
import { UploadTimeoutException } from '../../src/exceptions/UploadTimeoutException.js';

import type { UploadInputDTO } from '../../src/types/UploadInputDTO.js';
import type { UploadProgressDTO } from '../../src/types/UploadProgressDTO.js';

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

describe('NodeTransportAdapter HTTP integration', () => {
  let server: Server;
  let baseUrl: string;
  let adapter: NodeTransportAdapter;

  /**
   * Cria um servidor HTTP local com comportamento configurável.
   *
   * @param {RequestHandler} handler Manipulador das requisições HTTP.
   * @returns {Promise<void>} Conclusão da inicialização do servidor.
   */
  const startServer = async (handler: RequestHandler): Promise<void> => {
    server = createServer((request, response) => {
      void Promise.resolve(handler(request, response)).catch((error: unknown) => {
        response.destroy(error instanceof Error ? error : undefined);
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  };

  /**
   * Cria os dados de entrada de uma transferência.
   *
   * @param {Partial<UploadInputDTO>} overrides Propriedades a sobrescrever.
   * @returns {UploadInputDTO} Dados completos da transferência.
   */
  const createInput = (overrides: Partial<UploadInputDTO> = {}): UploadInputDTO => ({
    file: new Blob(['upload-transfer']),
    url: `${baseUrl}/upload`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    ...overrides,
  });

  /**
   * Aguarda um intervalo para simular operações lentas.
   *
   * @param {number} milliseconds Tempo de espera em milissegundos.
   * @returns {Promise<void>} Conclusão da espera.
   */
  const delay = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });

  /**
   * Cria um Blob com leitura controlada em múltiplos blocos.
   *
   * @param {Uint8Array<ArrayBuffer>} bytes Conteúdo binário original.
   * @param {number} chunkSize Tamanho máximo de cada bloco.
   * @param {number} delayMs Intervalo entre blocos.
   * @returns {Blob} Blob com stream de leitura controlado.
   */
  const createSlowBlob = (
    bytes: Uint8Array<ArrayBuffer>,
    chunkSize: number,
    delayMs: number,
  ): Blob => {
    const blob = new Blob([bytes]);

    blob.stream = (): ReadableStream<Uint8Array<ArrayBuffer>> => {
      let offset = 0;

      return new ReadableStream<Uint8Array<ArrayBuffer>>({
        async pull(controller) {
          if (offset >= bytes.byteLength) {
            controller.close();
            return;
          }

          await delay(delayMs);

          const end = Math.min(offset + chunkSize, bytes.byteLength);
          controller.enqueue(bytes.slice(offset, end));
          offset = end;
        },
      });
    };

    return blob;
  };

  beforeEach(() => {
    adapter = new NodeTransportAdapter();
  });

  afterEach(async () => {
    if (!server?.listening) {
      return;
    }

    server.closeAllConnections();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

  it('uploads a large binary file without changing its bytes', async () => {
    const original = Buffer.alloc(4 * 1024 * 1024);

    for (let index = 0; index < original.length; index++) {
      original[index] = index % 256;
    }

    const received: Buffer[] = [];

    await startServer(async (request, response) => {
      for await (const chunk of request) {
        received.push(Buffer.from(chunk));
      }

      response.writeHead(201);
      response.end();
    });

    const result = await adapter.upload(
      createInput({
        file: new Blob([original]),
      }),
    );

    expect(result.status).toBe(201);
    expect(Buffer.concat(received).equals(original)).toBe(true);
  });

  it('preserves the signed URL path, query and supplied headers', async () => {
    let receivedUrl: string | undefined;
    let receivedMethod: string | undefined;
    let receivedHeader: string | string[] | undefined;

    await startServer(async (request, response) => {
      receivedUrl = request.url;
      receivedMethod = request.method;
      receivedHeader = request.headers['x-upload-token'];

      request.resume();
      await finished(request);

      response.writeHead(204);
      response.end();
    });

    const result = await adapter.upload(
      createInput({
        url: `${baseUrl}/bucket/object%20name.bin?signature=abc%2F123&expires=600`,
        method: 'PUT',
        headers: {
          'X-Upload-Token': 'token-123',
        },
      }),
    );

    expect(result.status).toBe(204);
    expect(receivedMethod).toBe('PUT');
    expect(receivedUrl).toBe('/bucket/object%20name.bin?signature=abc%2F123&expires=600');
    expect(receivedHeader).toBe('token-123');
  });

  it('reports cumulative progress during a streamed upload', async () => {
    const original = new Uint8Array(256 * 1024);
    original.fill(42);

    const file = createSlowBlob(original, 32 * 1024, 5);
    const progress: UploadProgressDTO[] = [];
    let receivedBytes = 0;

    await startServer(async (request, response) => {
      for await (const chunk of request) {
        receivedBytes += Buffer.byteLength(chunk);
      }

      response.writeHead(200);
      response.end();
    });

    await adapter.upload(
      createInput({
        file,
        onProgress: (event) => {
          progress.push(event);
        },
      }),
    );

    expect(progress.length).toBeGreaterThan(1);
    expect(progress.at(-1)?.loaded).toBe(file.size);
    expect(progress.at(-1)?.percentage).toBe(100);
    expect(receivedBytes).toBe(file.size);

    for (let index = 1; index < progress.length; index++) {
      expect(progress[index]!.loaded).toBeGreaterThanOrEqual(progress[index - 1]!.loaded);
    }
  });

  it('aborts while the file is still being streamed', async () => {
    const controller = new AbortController();
    const original = new Uint8Array(1024 * 1024);
    const file = createSlowBlob(original, 16 * 1024, 10);

    let lastLoaded = 0;

    await startServer((request) => {
      request.resume();
    });

    await expect(
      adapter.upload(
        createInput({
          file,
          signal: controller.signal,
          onProgress: (progress) => {
            lastLoaded = progress.loaded;

            if (progress.loaded >= 64 * 1024) {
              controller.abort();
            }
          },
        }),
      ),
    ).rejects.toBeInstanceOf(UploadAbortException);

    expect(lastLoaded).toBeLessThan(file.size);
  });

  it('times out while streaming a slow file', async () => {
    const original = new Uint8Array(1024 * 1024);
    const file = createSlowBlob(original, 16 * 1024, 50);

    await startServer((request) => {
      request.resume();
    });

    await expect(
      adapter.upload(
        createInput({
          file,
          timeoutMs: 80,
        }),
      ),
    ).rejects.toBeInstanceOf(UploadTimeoutException);
  });

  it('handles an HTTP error returned before the upload finishes', async () => {
    const original = new Uint8Array(1024 * 1024);
    const file = createSlowBlob(original, 16 * 1024, 10);

    await startServer((_request, response) => {
      response.writeHead(403);
      response.end();
    });

    await expect(adapter.upload(createInput({ file }))).rejects.toMatchObject({
      name: 'UploadHttpException',
      status: 403,
    });
  });

  it('handles a connection destroyed during the upload', async () => {
    const original = new Uint8Array(1024 * 1024);
    const file = createSlowBlob(original, 16 * 1024, 10);

    await startServer((request) => {
      request.socket.destroy();
    });

    await expect(adapter.upload(createInput({ file }))).rejects.toBeInstanceOf(
      UploadNetworkException,
    );
  });

  it('rejects an HTTP 503 response after receiving the full body', async () => {
    await startServer(async (request, response) => {
      request.resume();
      await finished(request);

      response.writeHead(503);
      response.end();
    });

    await expect(adapter.upload(createInput())).rejects.toMatchObject({
      name: 'UploadHttpException',
      status: 503,
    });
  });

  it('handles an empty file upload successfully', async () => {
    let receivedBytes = 0;

    await startServer(async (request, response) => {
      for await (const chunk of request) {
        receivedBytes += Buffer.byteLength(chunk);
      }

      response.writeHead(200);
      response.end();
    });

    const result = await adapter.upload(
      createInput({
        file: new Blob([]),
      }),
    );

    expect(result.status).toBe(200);
    expect(receivedBytes).toBe(0);
  });

  it.each(['abort', 'timeout', 'network', 'http', 'early-success'])(
    'cancels and unlocks a pending read after %s',
    async (action) => {
      const controller = new AbortController();
      let cancelled = 0;
      let pulls = 0;
      let notifyRead: () => void = () => undefined;
      let notifyRequest: (request: IncomingMessage, response: ServerResponse) => void = () =>
        undefined;
      const pendingRead = new Promise<void>((resolve) => {
        notifyRead = resolve;
      });
      const incoming = new Promise<{ request: IncomingMessage; response: ServerResponse }>(
        (resolve) => {
          notifyRequest = (request, response) => resolve({ request, response });
        },
      );
      const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
        {
          pull(value) {
            pulls++;
            if (pulls === 1) value.enqueue(new Uint8Array(16));
            else notifyRead();
          },
          cancel() {
            cancelled++;
          },
        },
        { highWaterMark: 0 },
      );
      const file = new Blob([new Uint8Array(1024)]);
      file.stream = () => stream;
      await startServer((request, response) => {
        request.resume();
        notifyRequest(request, response);
      });
      const progress: UploadProgressDTO[] = [];
      const result = adapter
        .upload(
          createInput({
            file,
            signal: controller.signal,
            ...(action === 'timeout' ? { timeoutMs: 100 } : {}),
            onProgress: (event) => progress.push(event),
          }),
        )
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      await pendingRead;
      const { request, response } = await incoming;
      const disconnected = new Promise<void>((resolve) => request.socket.once('close', resolve));
      if (action === 'abort') controller.abort();
      if (action === 'network') request.socket.destroy();
      if (action === 'http' || action === 'early-success') {
        response.writeHead(action === 'http' ? 403 : 201);
        response.end();
      }
      const error = await result;
      if (action === 'abort') expect(error).toBeInstanceOf(UploadAbortException);
      else if (action === 'timeout') expect(error).toBeInstanceOf(UploadTimeoutException);
      else if (action === 'http')
        expect(error).toMatchObject({ name: 'UploadHttpException', status: 403 });
      else expect(error).toBeInstanceOf(UploadNetworkException);
      expect(cancelled).toBe(1);
      expect(stream.locked).toBe(false);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      await disconnected;
      const count = progress.length;
      await delay(10);
      expect(progress).toHaveLength(count);
      expect(progress.at(-1)?.loaded).toBeLessThan(file.size);
    },
  );

  it.each(['reject', 'pending'])('preserves abort when reader cancellation is %s', async (mode) => {
    const controller = new AbortController();
    let notifyRead: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      notifyRead = resolve;
    });
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull() {
          notifyRead();
        },
        cancel() {
          if (mode === 'reject') return Promise.reject(new Error('Cancellation failed.'));
          return new Promise<void>(() => undefined);
        },
      },
      { highWaterMark: 0 },
    );
    const file = new Blob([new Uint8Array(1024)]);
    file.stream = () => stream;
    await startServer((request) => {
      request.resume();
    });
    const upload = adapter.upload(createInput({ file, signal: controller.signal }));
    const rejection = expect(upload).rejects.toBeInstanceOf(UploadAbortException);
    await reading;
    controller.abort();
    await rejection;
    expect(stream.locked).toBe(false);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('preserves the original Blob read failure', async () => {
    const cause = new Error('Blob read failed.');
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        controller.error(cause);
      },
    });
    const file = new Blob([new Uint8Array(1024)]);
    file.stream = () => stream;
    await startServer((request) => {
      request.resume();
    });
    await expect(adapter.upload(createInput({ file }))).rejects.toMatchObject({
      name: 'UploadNetworkException',
      cause,
    });
    expect(stream.locked).toBe(false);
  });

  it('rejects a truncated successful response', async () => {
    await startServer(async (request, response) => {
      request.resume();
      await finished(request);
      response.writeHead(200, { 'Content-Length': '10' });
      response.write('abc');
      setImmediate(() => response.destroy());
    });
    await expect(adapter.upload(createInput())).rejects.toBeInstanceOf(UploadNetworkException);
  });

  it('cancels the source when a progress callback fails', async () => {
    const cause = new Error('Progress failed.');
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull(controller) {
          controller.enqueue(new Uint8Array(16));
        },
        cancel() {
          cancelled++;
        },
      },
      { highWaterMark: 0 },
    );
    const file = new Blob([new Uint8Array(1024)]);
    file.stream = () => stream;
    await startServer((request) => {
      request.resume();
    });
    await expect(
      adapter.upload(
        createInput({
          file,
          onProgress() {
            throw cause;
          },
        }),
      ),
    ).rejects.toMatchObject({ name: 'UploadNetworkException', cause });
    expect(cancelled).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it('rejects a source that ends before the declared file size', async () => {
    const file = new Blob([new Uint8Array(1024)]);
    file.stream = () =>
      new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.enqueue(new Uint8Array(16));
          controller.close();
        },
      });
    await startServer(async (request, response) => {
      request.resume();
      await finished(request);
      response.writeHead(201);
      response.end();
    });
    await expect(adapter.upload(createInput({ file }))).rejects.toBeInstanceOf(
      UploadNetworkException,
    );
  });

  it('cancels the reader when abort occurs during stream acquisition', async () => {
    const controller = new AbortController();
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        cancel() {
          cancelled++;
        },
      },
      { highWaterMark: 0 },
    );
    const file = new Blob([new Uint8Array(1024)]);
    file.stream = () => {
      controller.abort();
      return stream;
    };
    await startServer((request) => {
      request.resume();
    });
    await expect(
      adapter.upload(createInput({ file, signal: controller.signal })),
    ).rejects.toBeInstanceOf(UploadAbortException);
    expect(cancelled).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it.each(['abort', 'timeout'])('stops a backpressured write after %s', async (action) => {
    const controller = new AbortController();
    const file = new Blob([new Uint8Array(16 * 1024 * 1024)]);
    const source = file.stream.bind(file);
    let stream: ReadableStream<Uint8Array<ArrayBuffer>> | undefined;
    file.stream = () => {
      stream = source();
      return stream;
    };
    let notifyRequest: (request: IncomingMessage) => void = () => undefined;
    const incoming = new Promise<IncomingMessage>((resolve) => {
      notifyRequest = resolve;
    });
    await startServer((request) => {
      request.pause();
      notifyRequest(request);
    });
    const progress: UploadProgressDTO[] = [];
    const result = adapter
      .upload(
        createInput({
          file,
          signal: controller.signal,
          ...(action === 'timeout' ? { timeoutMs: 100 } : {}),
          onProgress: (event) => progress.push(event),
        }),
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    const request = await incoming;
    const disconnected = new Promise<void>((resolve) => request.socket.once('close', resolve));
    if (action === 'abort') controller.abort();
    expect(await result).toBeInstanceOf(
      action === 'abort' ? UploadAbortException : UploadTimeoutException,
    );
    expect(stream?.locked).toBe(false);
    expect(progress).toEqual([]);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    request.on('error', () => undefined);
    request.resume();
    await disconnected;
  });

  it.each(['throw', 'callback'])('preserves a write failure reported through %s', async (mode) => {
    const cause = new Error('Write failed.');
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull(controller) {
          controller.enqueue(new Uint8Array(16));
        },
        cancel() {
          cancelled++;
        },
      },
      { highWaterMark: 0 },
    );
    const file = new Blob([new Uint8Array(1024)]);
    file.stream = () => stream;
    await startServer((request) => {
      request.resume();
    });
    const write = vi
      .spyOn(ClientRequest.prototype, 'write')
      .mockImplementation((_chunk, callback?: unknown) => {
        if (mode === 'throw') throw cause;
        if (typeof callback === 'function') callback(cause);
        return false;
      });
    try {
      await expect(adapter.upload(createInput({ file }))).rejects.toMatchObject({
        name: 'UploadNetworkException',
        cause,
      });
      expect(cancelled).toBe(1);
      expect(stream.locked).toBe(false);
    } finally {
      write.mockRestore();
    }
  });
});

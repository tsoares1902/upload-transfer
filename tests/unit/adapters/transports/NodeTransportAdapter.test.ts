import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { finished } from 'node:stream/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NodeTransportAdapter } from '../../../../src/adapters/transports/NodeTransportAdapter.js';
import { UploadAbortException } from '../../../../src/exceptions/UploadAbortException.js';
import { UploadHttpException } from '../../../../src/exceptions/UploadHttpException.js';
import { UploadNetworkException } from '../../../../src/exceptions/UploadNetworkException.js';
import { UploadTimeoutException } from '../../../../src/exceptions/UploadTimeoutException.js';

import type { UploadInputDTO } from '../../../../src/types/UploadInputDTO.js';
import type { UploadProgressDTO } from '../../../../src/types/UploadProgressDTO.js';

describe('NodeTransportAdapter', () => {
  let server: Server;
  let baseUrl: string;
  let adapter: NodeTransportAdapter;

  /**
   * Cria os dados de entrada para uma transferência HTTP.
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

  beforeEach(async () => {
    adapter = new NodeTransportAdapter();

    server = createServer(async (request, response) => {
      request.resume();
      await finished(request);

      response.writeHead(200);
      response.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
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

  it('should upload a Blob successfully', async () => {
    const result = await adapter.upload(createInput());

    expect(result).toEqual({ status: 200 });
  });

  it('should preserve the HTTP method', async () => {
    let receivedMethod: string | undefined;

    server.removeAllListeners('request');

    server.on('request', async (request, response) => {
      receivedMethod = request.method;

      request.resume();
      await finished(request);

      response.writeHead(200);
      response.end();
    });

    await adapter.upload(createInput({ method: 'POST' }));

    expect(receivedMethod).toBe('POST');
  });

  it('should preserve custom headers', async () => {
    let receivedHeader: string | string[] | undefined;

    server.removeAllListeners('request');

    server.on('request', async (request, response) => {
      receivedHeader = request.headers['x-upload-test'];

      request.resume();
      await finished(request);

      response.writeHead(200);
      response.end();
    });

    await adapter.upload(
      createInput({
        headers: {
          'X-Upload-Test': 'preserved',
        },
      }),
    );

    expect(receivedHeader).toBe('preserved');
  });

  it('should preserve the original file bytes', async () => {
    const original = Uint8Array.from([0, 1, 2, 127, 128, 255]);
    const received: Buffer[] = [];

    server.removeAllListeners('request');

    server.on('request', async (request, response) => {
      for await (const chunk of request) {
        received.push(Buffer.from(chunk));
      }

      response.writeHead(200);
      response.end();
    });

    await adapter.upload(
      createInput({
        file: new Blob([original]),
      }),
    );

    expect(Buffer.concat(received)).toEqual(Buffer.from(original));
  });

  it.each([200, 201, 204])('should accept HTTP status %i', async (status) => {
    server.removeAllListeners('request');

    server.on('request', async (request, response) => {
      request.resume();
      await finished(request);

      response.writeHead(status);
      response.end();
    });

    const result = await adapter.upload(createInput());

    expect(result.status).toBe(status);
  });

  it.each([400, 401, 403, 404, 409, 429, 500, 503])(
    'should reject HTTP status %i',
    async (status) => {
      server.removeAllListeners('request');

      server.on('request', async (request, response) => {
        request.resume();
        await finished(request);

        response.writeHead(status);
        response.end();
      });

      await expect(adapter.upload(createInput())).rejects.toMatchObject({
        name: 'UploadHttpException',
        status,
      });
    },
  );

  it('should report upload progress', async () => {
    const progress: UploadProgressDTO[] = [];
    const file = new Blob(['0123456789']);

    await adapter.upload(
      createInput({
        file,
        onProgress: (event) => {
          progress.push(event);
        },
      }),
    );

    expect(progress.length).toBeGreaterThan(0);

    expect(progress.at(-1)).toEqual({
      loaded: file.size,
      total: file.size,
      percentage: 100,
      lengthComputable: true,
    });
  });

  it('should report progress for an empty Blob', async () => {
    const progress: UploadProgressDTO[] = [];

    await adapter.upload(
      createInput({
        file: new Blob([]),
        onProgress: (event) => {
          progress.push(event);
        },
      }),
    );

    expect(progress).toEqual([]);
  });

  it('should reject an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(adapter.upload(createInput({ signal: controller.signal }))).rejects.toBeInstanceOf(
      UploadAbortException,
    );
  });

  it('should reject an invalid URL', async () => {
    await expect(adapter.upload(createInput({ url: 'invalid-url' }))).rejects.toBeInstanceOf(
      UploadNetworkException,
    );
  });

  it('should reject unsupported protocols', async () => {
    await expect(
      adapter.upload(createInput({ url: 'ftp://localhost/upload' })),
    ).rejects.toBeInstanceOf(UploadNetworkException);
  });

  it('should reject when the server closes the connection', async () => {
    server.removeAllListeners('request');

    server.on('request', (request) => {
      request.socket.destroy();
    });

    await expect(adapter.upload(createInput())).rejects.toBeInstanceOf(UploadNetworkException);
  });

  it('should reject when the upload times out', async () => {
    server.removeAllListeners('request');

    server.on('request', async (request) => {
      request.resume();
      await finished(request);
    });

    await expect(adapter.upload(createInput({ timeoutMs: 50 }))).rejects.toBeInstanceOf(
      UploadTimeoutException,
    );
  });

  it('should cancel an upload using AbortSignal', async () => {
    const controller = new AbortController();

    server.removeAllListeners('request');

    server.on('request', async (request) => {
      request.resume();
      await finished(request);

      controller.abort();
    });

    await expect(adapter.upload(createInput({ signal: controller.signal }))).rejects.toBeInstanceOf(
      UploadAbortException,
    );
  });

  it('should preserve the HTTP error status', async () => {
    server.removeAllListeners('request');

    server.on('request', async (request, response) => {
      request.resume();
      await finished(request);

      response.writeHead(422);
      response.end();
    });

    try {
      await adapter.upload(createInput());
      expect.fail('Expected UploadHttpException.');
    } catch (error) {
      expect(error).toBeInstanceOf(UploadHttpException);
      expect((error as UploadHttpException).status).toBe(422);
    }
  });
});

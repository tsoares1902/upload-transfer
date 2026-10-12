import { describe, expect, it, vi } from 'vitest';

import { SeaweedFSAdapter } from '../../../../src/adapters/providers/SeaweedFSAdapter.js';
import { UploadHttpException } from '../../../../src/exceptions/UploadHttpException.js';

import type { UploadTransportInterface } from '../../../../src/interfaces/UploadTransportInterface.js';
import type { UploadInputDTO } from '../../../../src/types/UploadInputDTO.js';
import type { UploadOutputDTO } from '../../../../src/types/UploadOutputDTO.js';

describe('SeaweedFSAdapter', () => {
  /**
   * Cria uma entrada de upload para os testes.
   *
   * @returns {UploadInputDTO} Dados de uma transferência HTTP.
   */
  const createInput = (): UploadInputDTO => ({
    file: new Blob(['seaweedfs-upload']),
    url: 'https://storage.example.com/bucket/file.txt?signature=abc%2F123',
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain',
      'X-Amz-Meta-Origin': 'comissoes',
    },
  });

  /**
   * Cria um transporte HTTP simulado.
   *
   * @returns {UploadTransportInterface} Transporte com método de upload simulado.
   */
  const createTransport = (): UploadTransportInterface => ({
    upload: vi.fn<UploadTransportInterface['upload']>(),
  });

  it('delegates the upload to the injected transport', async () => {
    const transport = createTransport();
    const result: UploadOutputDTO = { status: 200 };

    vi.mocked(transport.upload).mockResolvedValue(result);

    const adapter = new SeaweedFSAdapter(transport);
    const input = createInput();

    await expect(adapter.upload(input)).resolves.toEqual(result);
    expect(transport.upload).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('preserves the original input object without modifying it', async () => {
    const transport = createTransport();

    vi.mocked(transport.upload).mockResolvedValue({ status: 204 });

    const adapter = new SeaweedFSAdapter(transport);
    const input = createInput();
    const originalHeaders = { ...input.headers };

    await adapter.upload(input);

    expect(transport.upload).toHaveBeenCalledWith(input);
    expect(input.url).toBe('https://storage.example.com/bucket/file.txt?signature=abc%2F123');
    expect(input.method).toBe('PUT');
    expect(input.headers).toEqual(originalHeaders);
  });

  it('preserves the file reference passed to the transport', async () => {
    const transport = createTransport();

    vi.mocked(transport.upload).mockResolvedValue({ status: 200 });

    const adapter = new SeaweedFSAdapter(transport);
    const input = createInput();

    await adapter.upload(input);

    const passedInput = vi.mocked(transport.upload).mock.calls[0]?.[0];

    expect(passedInput?.file).toBe(input.file);
  });

  it('forwards progress callback, signal and timeout without changes', async () => {
    const transport = createTransport();

    vi.mocked(transport.upload).mockResolvedValue({ status: 200 });

    const adapter = new SeaweedFSAdapter(transport);
    const controller = new AbortController();
    const onProgress = vi.fn();

    const input: UploadInputDTO = {
      ...createInput(),
      onProgress,
      signal: controller.signal,
      timeoutMs: 15_000,
    };

    await adapter.upload(input);

    const passedInput = vi.mocked(transport.upload).mock.calls[0]?.[0];

    expect(passedInput?.onProgress).toBe(onProgress);
    expect(passedInput?.signal).toBe(controller.signal);
    expect(passedInput?.timeoutMs).toBe(15_000);
  });

  it('returns the exact result provided by the transport', async () => {
    const transport = createTransport();
    const result: UploadOutputDTO = { status: 201 };

    vi.mocked(transport.upload).mockResolvedValue(result);

    const adapter = new SeaweedFSAdapter(transport);

    const output = await adapter.upload(createInput());

    expect(output).toBe(result);
  });

  it('propagates HTTP errors without replacing them', async () => {
    const transport = createTransport();
    const error = new UploadHttpException(403);

    vi.mocked(transport.upload).mockRejectedValue(error);

    const adapter = new SeaweedFSAdapter(transport);

    await expect(adapter.upload(createInput())).rejects.toBe(error);
  });

  it('propagates unexpected transport errors without replacing them', async () => {
    const transport = createTransport();
    const error = new Error('Unexpected transport failure');

    vi.mocked(transport.upload).mockRejectedValue(error);

    const adapter = new SeaweedFSAdapter(transport);

    await expect(adapter.upload(createInput())).rejects.toBe(error);
  });

  it('does not invoke the transport more than once', async () => {
    const transport = createTransport();

    vi.mocked(transport.upload).mockResolvedValue({ status: 200 });

    const adapter = new SeaweedFSAdapter(transport);

    await adapter.upload(createInput());

    expect(transport.upload).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { UploadFileUseCase } from '../../../src/use-cases/UploadFileUseCase.js';
import { UploadAbortException } from '../../../src/exceptions/UploadAbortException.js';
import { UploadHttpException } from '../../../src/exceptions/UploadHttpException.js';
import { UploadNetworkException } from '../../../src/exceptions/UploadNetworkException.js';
import { UploadTimeoutException } from '../../../src/exceptions/UploadTimeoutException.js';

import type { UploadProviderInterface } from '../../../src/interfaces/UploadProviderInterface.js';
import type { UploadInputDTO } from '../../../src/types/UploadInputDTO.js';
import type { UploadOutputDTO } from '../../../src/types/UploadOutputDTO.js';

/**
 * Cria uma entrada de upload para os testes.
 *
 * @returns {UploadInputDTO} Dados da transferência HTTP.
 */
const createInput = (): UploadInputDTO => ({
  file: new Blob(['upload-transfer']),
  url: 'https://storage.example.com/bucket/file.txt?signature=abc%2F123',
  method: 'PUT',
  headers: {
    'Content-Type': 'text/plain',
    'X-Amz-Meta-Origin': 'comissoes',
  },
});

/**
 * Cria um provider simulado.
 *
 * @returns {UploadProviderInterface} Provider com upload simulado.
 */
const createProvider = (): UploadProviderInterface => ({
  upload: vi.fn<UploadProviderInterface['upload']>(),
});

describe('UploadFileUseCase', () => {
  it('delegates the upload to the injected provider', async () => {
    const provider = createProvider();
    const input = createInput();
    const result: UploadOutputDTO = { status: 200 };

    vi.mocked(provider.upload).mockResolvedValue(result);

    const useCase = new UploadFileUseCase(provider);

    await expect(useCase.execute(input)).resolves.toBe(result);
    expect(provider.upload).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('preserves the original input reference', async () => {
    const provider = createProvider();
    const input = createInput();

    vi.mocked(provider.upload).mockResolvedValue({ status: 200 });

    const useCase = new UploadFileUseCase(provider);

    await useCase.execute(input);

    expect(vi.mocked(provider.upload).mock.calls[0]?.[0]).toBe(input);
  });

  it('preserves the signed URL, HTTP method and headers', async () => {
    const provider = createProvider();
    const input = createInput();

    vi.mocked(provider.upload).mockResolvedValue({ status: 200 });

    const useCase = new UploadFileUseCase(provider);

    await useCase.execute(input);

    const passedInput = vi.mocked(provider.upload).mock.calls[0]?.[0];

    expect(passedInput?.url).toBe(input.url);
    expect(passedInput?.method).toBe(input.method);
    expect(passedInput?.headers).toBe(input.headers);
  });

  it('forwards progress callback, abort signal and timeout', async () => {
    const provider = createProvider();
    const controller = new AbortController();
    const onProgress = vi.fn();

    vi.mocked(provider.upload).mockResolvedValue({ status: 200 });

    const input: UploadInputDTO = {
      ...createInput(),
      onProgress,
      signal: controller.signal,
      timeoutMs: 15_000,
    };

    const useCase = new UploadFileUseCase(provider);

    await useCase.execute(input);

    const passedInput = vi.mocked(provider.upload).mock.calls[0]?.[0];

    expect(passedInput?.onProgress).toBe(onProgress);
    expect(passedInput?.signal).toBe(controller.signal);
    expect(passedInput?.timeoutMs).toBe(15_000);
  });

  it('does not invoke the provider more than once', async () => {
    const provider = createProvider();

    vi.mocked(provider.upload).mockResolvedValue({ status: 200 });

    const useCase = new UploadFileUseCase(provider);

    await useCase.execute(createInput());

    expect(provider.upload).toHaveBeenCalledTimes(1);
  });

  it('returns the exact result provided by the provider', async () => {
    const provider = createProvider();
    const result: UploadOutputDTO = { status: 204 };

    vi.mocked(provider.upload).mockResolvedValue(result);

    const useCase = new UploadFileUseCase(provider);

    const output = await useCase.execute(createInput());

    expect(output).toBe(result);
  });

  it.each([
    ['HTTP', new UploadHttpException(403)],
    ['network', new UploadNetworkException()],
    ['abort', new UploadAbortException()],
    ['timeout', new UploadTimeoutException()],
  ])('propagates %s exceptions without replacing them', async (_name, error) => {
    const provider = createProvider();

    vi.mocked(provider.upload).mockRejectedValue(error);

    const useCase = new UploadFileUseCase(provider);

    await expect(useCase.execute(createInput())).rejects.toBe(error);
  });

  it('propagates unexpected errors without replacing them', async () => {
    const provider = createProvider();
    const error = new Error('Unexpected provider failure');

    vi.mocked(provider.upload).mockRejectedValue(error);

    const useCase = new UploadFileUseCase(provider);

    await expect(useCase.execute(createInput())).rejects.toBe(error);
  });
});

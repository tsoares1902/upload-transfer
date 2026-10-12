import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { XhrTransportAdapter } from '../../../../src/adapters/transports/XhrTransportAdapter.js';
import { UploadHttpException } from '../../../../src/exceptions/UploadHttpException.js';
import { UploadAbortException } from '../../../../src/exceptions/UploadAbortException.js';
import { UploadNetworkException } from '../../../../src/exceptions/UploadNetworkException.js';
import { UploadTimeoutException } from '../../../../src/exceptions/UploadTimeoutException.js';
import type { UploadInputDTO } from '../../../../src/types/UploadInputDTO.js';
import { MockXMLHttpRequest } from '../../../helpers/MockXMLHttpRequest.js';

const adapter = new XhrTransportAdapter();
let input: UploadInputDTO;

/**
 * Obtém o XHR criado pelo adapter.
 *
 * @returns {MockXMLHttpRequest} Requisição ativa.
 */
function request(): MockXMLHttpRequest {
  const xhr = MockXMLHttpRequest.instances.at(-1);
  if (!xhr) throw new Error('XHR not created');
  return xhr;
}

beforeEach(() => {
  MockXMLHttpRequest.instances = [];
  MockXMLHttpRequest.failures = {};
  vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
  input = {
    file: new Blob(['original']),
    method: 'PATCH',
    url: 'http://localhost/upload?token=test',
    headers: { 'X-Test': 'value', Authorization: 'test' },
  };
});
afterEach(() => vi.unstubAllGlobals());

describe('XhrTransportAdapter', () => {
  it('preserves method, URL, Blob and exactly the supplied headers', async () => {
    const result = adapter.upload(input);
    const xhr = request();
    expect(xhr.open.mock.calls).toEqual([[input.method, input.url]]);
    expect(xhr.send).toHaveBeenCalledExactlyOnceWith(input.file);
    expect(xhr.setRequestHeader.mock.calls).toEqual(Object.entries(input.headers));
    xhr.respond(200);
    await expect(result).resolves.toEqual({ status: 200 });
  });
  it.each([undefined, 0, 1234])('configures timeout %s', async (timeoutMs) => {
    const result = adapter.upload({ ...input, ...(timeoutMs === undefined ? {} : { timeoutMs }) });
    expect(request().timeout).toBe(timeoutMs ?? 0);
    request().respond(200);
    await result;
  });
  it.each([200, 201, 204])('resolves HTTP %s', async (status) => {
    const result = adapter.upload(input);
    request().respond(status);
    await expect(result).resolves.toEqual({ status });
  });
  it.each([0, 400, 401, 403, 404, 409, 429, 500, 503])(
    'rejects HTTP %s preserving status',
    async (status) => {
      const result = adapter.upload(input);
      request().respond(status);
      await expect(result).rejects.toBeInstanceOf(UploadHttpException);
      await expect(result).rejects.toMatchObject({ status });
    },
  );
  it.each([
    [0, 100, 0],
    [50, 100, 50],
    [100, 100, 100],
    [1, 4, 25],
    [0, 0, 100],
  ])('reports progress %s/%s as %s percent without settling', async (loaded, total, percentage) => {
    const onProgress = vi.fn();
    const settled = vi.fn();
    const result = adapter.upload({ ...input, onProgress });
    void result.then(settled);
    request().upload.onprogress?.({ loaded: loaded!, total: total!, lengthComputable: true });
    expect(onProgress).toHaveBeenCalledExactlyOnceWith({
      loaded,
      total,
      percentage,
      lengthComputable: true,
    });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    request().respond(201);
    await result;
  });
  it('omits total and percentage for unknown length', async () => {
    const onProgress = vi.fn();
    const result = adapter.upload({ ...input, onProgress });
    request().upload.onprogress?.({ loaded: 7, total: 0, lengthComputable: false });
    expect(onProgress).toHaveBeenCalledExactlyOnceWith({ loaded: 7, lengthComputable: false });
    request().respond(200);
    await result;
  });
  it('rejects a failed HTTP response even after 100 percent progress', async () => {
    const result = adapter.upload({ ...input, onProgress: vi.fn() });
    request().upload.onprogress?.({ loaded: 100, total: 100, lengthComputable: true });
    request().respond(500);
    await expect(result).rejects.toMatchObject({ status: 500 });
  });
  it('handles cancellation between listener registration and send', async () => {
    const controller = new AbortController();
    const originalAdd = controller.signal.addEventListener.bind(controller.signal);
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation((...args) => {
      originalAdd(...args);
      controller.abort();
    });
    await expect(adapter.upload({ ...input, signal: controller.signal })).rejects.toBeInstanceOf(
      UploadAbortException,
    );
    expect(request().send).not.toHaveBeenCalled();
    expect(request().abort).toHaveBeenCalled();
  });
  it('works without a progress callback or headers', async () => {
    const result = adapter.upload({ ...input, headers: {} });
    expect(request().upload.onprogress).toBeNull();
    expect(request().setRequestHeader).not.toHaveBeenCalled();
    request().respond(204);
    await result;
  });
  it('rejects an already aborted signal without creating XHR', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.upload({ ...input, signal: controller.signal })).rejects.toBeInstanceOf(
      UploadAbortException,
    );
    expect(MockXMLHttpRequest.instances).toHaveLength(0);
  });
  it('aborts XHR during upload and ignores subsequent events', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const result = adapter.upload({ ...input, signal: controller.signal });
    controller.abort();
    request().respond(200);
    request().onerror?.();
    request().ontimeout?.();
    await expect(result).rejects.toBeInstanceOf(UploadAbortException);
    expect(request().abort).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it.each(['load', 'error', 'timeout', 'abort'] as const)(
    'removes signal listener after %s and settles only once',
    async (event) => {
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const result = adapter.upload({ ...input, signal: controller.signal });
      const observed = result.then(
        (value) => value,
        (error) => error,
      );
      if (event === 'load') request().respond(204);
      else request()[`on${event}`]?.();
      const first = await observed;
      controller.abort();
      request().respond(500);
      request().onabort?.();
      expect(await observed).toBe(first);
      expect(request().abort).not.toHaveBeenCalled();
      expect(remove).toHaveBeenCalledExactlyOnceWith('abort', add.mock.calls[0]?.[1]);
      if (event === 'load') expect(first).toEqual({ status: 204 });
      else
        expect(first).toBeInstanceOf(
          {
            error: UploadNetworkException,
            timeout: UploadTimeoutException,
            abort: UploadAbortException,
          }[event],
        );
    },
  );
  it.each(['open', 'setRequestHeader', 'send'] as const)(
    'wraps synchronous %s failures and preserves cause',
    async (operation) => {
      const cause = new Error(operation);
      MockXMLHttpRequest.failures[operation] = cause;
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const result = adapter.upload({ ...input, signal: controller.signal });
      await expect(result).rejects.toBeInstanceOf(UploadNetworkException);
      await expect(result).rejects.toMatchObject({ cause });
      controller.abort();
      expect(request().abort).not.toHaveBeenCalled();
      expect(remove).toHaveBeenCalledTimes(1);
    },
  );
});

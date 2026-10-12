import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import type { Server, IncomingHttpHeaders } from 'node:http';
import { readFile } from 'node:fs/promises';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import type { XhrTransportAdapter } from '../../src/adapters/transports/XhrTransportAdapter.js';
import type { UploadProgressDTO } from '../../src/types/UploadProgressDTO.js';

declare global {
  interface Window {
    adapter: XhrTransportAdapter;
    controller: AbortController;
    result: Promise<{ status: number } | { name: string }>;
    progress: UploadProgressDTO[];
  }
}

let server: Server;
let origin: string;
let received: { bytes: Buffer; method: string | undefined; headers: IncomingHttpHeaders };
let acknowledge: () => void;
let arrived: Promise<void>;

test.beforeAll(async () => {
  const html = await readFile(new URL('./fixtures/upload.html', import.meta.url));
  const modules = new Map<string, string>();
  for (const path of [
    'adapters/transports/XhrTransportAdapter',
    'exceptions/UploadException',
    'exceptions/UploadAbortException',
    'exceptions/UploadHttpException',
    'exceptions/UploadNetworkException',
    'exceptions/UploadTimeoutException',
  ]) {
    const source = await readFile(new URL(`../../src/${path}.ts`, import.meta.url), 'utf8');
    modules.set(
      `/src/${path}.js`,
      transpileModule(source, {
        compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
      }).outputText,
    );
  }
  server = createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
      return;
    }
    const module = modules.get(req.url ?? '');
    if (module !== undefined) {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(module);
      return;
    }
    if (!/^\/(200|201|204|400|503|hold|network)$/.test(req.url ?? '')) {
      res.writeHead(404);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received = { bytes: Buffer.concat(chunks), method: req.method, headers: req.headers };
      acknowledge();
      if (req.url === '/network') {
        req.socket.destroy();
      } else if (req.url !== '/hold') {
        res.writeHead(Number(req.url?.slice(1)) || 201);
        res.end();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing TCP server address');
  origin = `http://127.0.0.1:${address.port}`;
});

test.beforeEach(async ({ page }) => {
  arrived = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  await page.goto(origin);
  await page.waitForFunction(() => Boolean(window.adapter));
});

test.afterEach(() => {
  server.closeAllConnections();
});

test.afterAll(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('uploads original bytes with method, headers and observable progress', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.progress = [];
    const result = await window.adapter.upload({
      file: new Blob([new Uint8Array([0, 1, 127, 128, 255])]),
      method: 'PATCH',
      url: '/201',
      headers: { 'X-Upload-Test': 'exact-value' },
      onProgress: (event) => window.progress.push(event),
    });
    return { result, progress: window.progress };
  });
  expect(result.result).toEqual({ status: 201 });
  expect([...received.bytes]).toEqual([0, 1, 127, 128, 255]);
  expect(received.method).toBe('PATCH');
  expect(received.headers['x-upload-test']).toBe('exact-value');
  expect(result.progress.length).toBeGreaterThan(0);
  expect(result.progress.at(-1)).toMatchObject({
    loaded: 5,
    total: 5,
    percentage: 100,
    lengthComputable: true,
  });
});

for (const status of [200, 204, 400, 503]) {
  test(`handles real HTTP ${status}`, async ({ page }) => {
    const result = await page.evaluate(async (status) => {
      try {
        return await window.adapter.upload({
          file: new Blob(['HTTP']),
          method: 'PUT',
          url: `/${status}`,
          headers: {},
        });
      } catch (error) {
        return { name: (error as Error).name, status: (error as { status: number }).status };
      }
    }, status);
    expect(result).toEqual(status < 300 ? { status } : { name: 'UploadHttpException', status });
  });
}

test('cancels a real pending request after the server receives it', async ({ page }) => {
  await page.evaluate(() => {
    window.controller = new AbortController();
    window.result = window.adapter
      .upload({
        file: new Blob(['abort']),
        method: 'PUT',
        url: '/hold',
        headers: {},
        signal: window.controller.signal,
      })
      .catch((error) => ({ name: (error as Error).name }));
  });
  await arrived;
  await page.evaluate(() => window.controller.abort());
  expect(await page.evaluate(() => window.result)).toEqual({ name: 'UploadAbortException' });
});

test('times out while the server deliberately withholds the response', async ({ page }) => {
  await page.evaluate(() => {
    window.result = window.adapter
      .upload({
        file: new Blob(['timeout']),
        method: 'PUT',
        url: '/hold',
        headers: {},
        timeoutMs: 1500,
      })
      .catch((error) => ({ name: (error as Error).name }));
  });
  await arrived;
  expect(received.bytes.toString()).toBe('timeout');
  expect(await page.evaluate(() => window.result)).toEqual({ name: 'UploadTimeoutException' });
});

test('reports a controlled socket failure', async ({ page }) => {
  const result = await page.evaluate(async () => {
    try {
      return await window.adapter.upload({
        file: new Blob(['network']),
        method: 'PUT',
        url: '/network',
        headers: {},
      });
    } catch (error) {
      return { name: (error as Error).name };
    }
  });
  expect(result).toEqual({ name: 'UploadNetworkException' });
});

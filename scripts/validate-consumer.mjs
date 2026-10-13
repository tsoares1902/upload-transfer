import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'upload-transfer-consumer-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * Executa um comando no consumidor isolado.
 *
 * @param {string} command Executável.
 * @param {string[]} args Argumentos.
 * @returns {string} Saída do comando.
 */
function run(command, args) {
  return execFileSync(command, args, { cwd: temporary, encoding: 'utf8' }).trim();
}

try {
  const dry = Object.values(
    JSON.parse(
      execFileSync(npm, ['pack', '--dry-run', '--json'], {
        cwd: root,
        encoding: 'utf8',
      }),
    ),
  )[0];
  const files = dry.files.map((file) => file.path);
  for (const required of [
    'package.json',
    'dist/browser.mjs',
    'dist/node.mjs',
    'dist/browser.d.mts',
    'dist/node.d.mts',
    'dist/browser.mjs.map',
    'dist/node.mjs.map',
  ]) {
    assert(files.includes(required), `Missing packed file: ${required}`);
  }
  assert(
    files.every(
      (file) => file.startsWith('dist/') || ['README.md', 'package.json', 'LICENSE'].includes(file),
    ),
  );
  console.info('npm pack --dry-run:', files.join(', '));

  const packed = Object.values(
    JSON.parse(
      execFileSync(npm, ['pack', '--json', '--pack-destination', temporary], {
        cwd: root,
        encoding: 'utf8',
      }),
    ),
  )[0];
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  console.info(
    run(npm, [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(temporary, packed.filename),
    ]),
  );
  const manifest = JSON.parse(
    readFileSync(join(temporary, 'node_modules/@spa/upload-transfer/package.json'), 'utf8'),
  );
  assert.equal(manifest.private, true);
  assert.equal(manifest.engines.node, '>=22');
  assert.equal(manifest.exports['.'].browser.types, './dist/browser.d.mts');
  assert.equal(manifest.exports['.'].node.types, './dist/node.d.mts');

  const consumer = `import * as api from '@spa/upload-transfer';
import type { UploadInputDTO, UploadOutputDTO, UploadProgressDTO } from '@spa/upload-transfer';
const progress: UploadProgressDTO = { loaded: 0, lengthComputable: false };
const input: UploadInputDTO = { file: new Blob(['consumer']), url: 'https://example.invalid/upload', method: 'PUT', headers: {}, onProgress: (event: UploadProgressDTO): void => { void event; } };
const output: UploadOutputDTO = { status: 204 };
const useCase = new api.UploadFileUseCase({ upload: async (value: UploadInputDTO): Promise<UploadOutputDTO> => { void value; return output; } });
const exceptions = [new api.UploadException('consumer'), new api.UploadAbortException(), new api.UploadNetworkException(), new api.UploadTimeoutException(), new api.UploadHttpException(403)];
/**
 * Verifica o contrato público do consumidor instalado.
 *
 * @returns {Promise<void>} Conclusão da validação.
 */
async function verify(): Promise<void> {
  if (!(api.createUploadFileUseCase() instanceof api.UploadFileUseCase)) throw new Error('Invalid composition');
  if ((await useCase.execute(input)).status !== 204) throw new Error('Invalid use case');
  for (const exception of exceptions) {
    try { throw exception; } catch (error: unknown) {
      if (!(error instanceof api.UploadException)) throw error;
    }
  }
  void progress;
}
export { api, verify };
`;
  writeFileSync(join(temporary, 'consumer.ts'), consumer);
  const compiler = join(root, 'node_modules/typescript/bin/tsc');
  const common = [
    'consumer.ts',
    '--strict',
    '--noUncheckedIndexedAccess',
    '--exactOptionalPropertyTypes',
    '--verbatimModuleSyntax',
    '--target',
    'ES2022',
    '--lib',
    'ES2022,DOM,DOM.Iterable',
  ];
  run(process.execPath, [
    compiler,
    ...common,
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--outDir',
    'compiled',
  ]);
  run(process.execPath, [
    '--input-type=module',
    '-e',
    `
    import assert from 'node:assert/strict';
    import { api, verify } from './compiled/consumer.js';
    assert(import.meta.resolve('@spa/upload-transfer').startsWith(new URL('./node_modules/', import.meta.url).href));
    assert(import.meta.resolve('@spa/upload-transfer').endsWith('/dist/node.mjs'));
    assert.equal(api.createUploadTransport().constructor.name, 'NodeTransportAdapter');
    await verify();
    console.log(process.version);
  `,
  ]);
  console.info(`External Node ESM, DTOs and exceptions: passed (${process.version})`);
  run(process.execPath, [
    compiler,
    ...common,
    '--module',
    'ESNext',
    '--moduleResolution',
    'Bundler',
    '--customConditions',
    'browser',
    '--noEmit',
  ]);
  console.info('Browser consumer TypeScript: passed');

  writeFileSync(join(temporary, 'index.html'), '<script type="module" src="/browser.ts"></script>');
  writeFileSync(
    join(temporary, 'browser.ts'),
    `import { api, verify } from './consumer.js';
await verify();
Object.assign(globalThis, { consumerResult: { names: Object.keys(api).sort(), transport: api.createUploadTransport().constructor.name } });
`,
  );
  await build({
    root: temporary,
    configFile: false,
    logLevel: 'warn',
    build: { target: 'es2022', minify: false },
    plugins: [
      {
        name: 'verify-browser-dependency-graph',
        /**
         * Verifica os módulos selecionados pelo bundler Browser.
         *
         * @param {object} _options Opções de saída do bundler.
         * @param {object} bundle Artefatos gerados.
         * @returns {void} Conclusão da inspeção.
         */
        generateBundle(_options, bundle) {
          let browserEntry = false;
          for (const artifact of Object.values(bundle)) {
            if (artifact.type !== 'chunk') continue;
            for (const id of Object.keys(artifact.modules)) {
              assert(
                !id.includes('node:') && !id.includes('browser-external'),
                `Node dependency: ${id}`,
              );
              assert(!id.endsWith('/dist/node.mjs'), 'Node entry selected');
              if (id.endsWith('/dist/browser.mjs')) browserEntry = true;
            }
            assert(!artifact.code.includes('NodeTransportAdapter'));
          }
          assert(browserEntry, 'Browser entry not selected');
        },
      },
    ],
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://consumer.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const file = join(temporary, 'dist', path === '/' ? 'index.html' : path);
      await route.fulfill({
        body: readFileSync(file),
        contentType: path.endsWith('.js') ? 'application/javascript' : 'text/html',
      });
    });
    await page.goto('http://consumer.test/');
    await page.waitForFunction(() => Boolean(globalThis.consumerResult));
    const result = await page.evaluate(() => globalThis.consumerResult);
    assert.equal(result.transport, 'XhrTransportAdapter');
    assert.deepEqual(
      result.names,
      [
        'createUploadFileUseCase',
        'createUploadTransport',
        'UploadFileUseCase',
        'UploadException',
        'UploadAbortException',
        'UploadNetworkException',
        'UploadTimeoutException',
        'UploadHttpException',
      ].sort(),
    );
    assert.deepEqual(errors, []);
    console.info(
      'Installed Browser package: Vite build, dependency graph and Chromium execution passed',
    );
  } finally {
    await browser.close();
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

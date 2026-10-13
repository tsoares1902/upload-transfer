import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const distDirectory = resolve(projectRoot, 'dist');

/**
 * Executa uma expressão JavaScript em um processo Node.js isolado.
 *
 * @param {string[]} conditions Condições adicionais de resolução.
 * @param {string} expression Expressão JavaScript a executar.
 * @returns {string} Resultado produzido pelo processo.
 */
function executeNode(conditions: string[], expression: string): string {
  return execFileSync(process.execPath, [...conditions, '--input-type=module', '-e', expression], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
}

/**
 * Executa uma importação do pacote em um processo Node.js isolado.
 *
 * @param {string[]} conditions Condições adicionais de resolução.
 * @returns {string} Nome do transporte selecionado.
 */
function resolveTransport(conditions: string[]): string {
  return executeNode(
    conditions,
    "import('@spa/upload-transfer').then(m => console.log(m.createUploadTransport().constructor.name))",
  );
}

/**
 * Executa a composição do caso de uso em um processo Node.js isolado.
 *
 * @param {string[]} conditions Condições adicionais de resolução.
 * @returns {string} Nome do caso de uso criado.
 */
function resolveUseCase(conditions: string[]): string {
  return executeNode(
    conditions,
    "import('@spa/upload-transfer').then(m => console.log(m.createUploadFileUseCase().constructor.name))",
  );
}

/**
 * Obtém o código compilado de um artefato.
 *
 * @param {string} filename Nome do arquivo compilado.
 * @returns {string} Conteúdo JavaScript do artefato.
 */
function readBundle(filename: string): string {
  return readFileSync(resolve(distDirectory, filename), 'utf8');
}

/**
 * Obtém os imports relativos de um módulo ESM compilado.
 *
 * @param {string} source Código-fonte compilado.
 * @returns {string[]} Caminhos relativos importados.
 */
function getRelativeImports(source: string): string[] {
  const imports = source.matchAll(
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/g,
  );

  return Array.from(imports, (match) => match[1]).filter(
    (value): value is string => value !== undefined,
  );
}

/**
 * Percorre os imports relativos do bundle Browser.
 *
 * @param {string} filename Arquivo inicial ou chunk compilado.
 * @param {Set<string>} visited Arquivos já analisados.
 * @returns {string[]} Conteúdos dos módulos encontrados.
 */
function collectBrowserModules(filename: string, visited = new Set<string>()): string[] {
  const absolutePath = resolve(distDirectory, filename);

  if (visited.has(absolutePath)) {
    return [];
  }

  visited.add(absolutePath);

  const source = readFileSync(absolutePath, 'utf8');
  const modules = [source];

  for (const importedPath of getRelativeImports(source)) {
    const importedFile = resolve(dirname(absolutePath), importedPath);

    modules.push(...collectBrowserModules(importedFile.slice(distDirectory.length + 1), visited));
  }

  return modules;
}

describe('Package exports', () => {
  describe('Conditional resolution', () => {
    it('selects the Node transport by default', () => {
      expect(resolveTransport([])).toBe('NodeTransportAdapter');
    });

    it('selects the Browser transport with the browser condition', () => {
      expect(resolveTransport(['--conditions=browser'])).toBe('XhrTransportAdapter');
    });
  });

  describe('Use case composition', () => {
    it('creates UploadFileUseCase in Node.js', () => {
      expect(resolveUseCase([])).toBe('UploadFileUseCase');
    });

    it('creates UploadFileUseCase with the browser condition', () => {
      expect(resolveUseCase(['--conditions=browser'])).toBe('UploadFileUseCase');
    });
  });

  describe('Bundle isolation', () => {
    it('keeps Node built-in modules out of the Browser dependency graph', () => {
      const modules = collectBrowserModules('browser.mjs');

      for (const source of modules) {
        expect(source).not.toMatch(/(?:from\s*|import\s*\(|require\s*\()\s*['"]node:/);

        expect(source).not.toContain('NodeTransportAdapter');
      }
    });

    it('includes native HTTP imports in the Node bundle', () => {
      const source = readBundle('node.mjs');

      expect(source).toContain('node:http');
      expect(source).toContain('node:https');
      expect(source).toContain('NodeTransportAdapter');
    });
  });
});

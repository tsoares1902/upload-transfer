# @spa/upload-transfer

Biblioteca privada ESM de transferência HTTP de arquivos binários para URLs previamente autorizadas. Versão atual: **0.1.0**. Requer Node.js **22 ou superior**, ou navegador com XMLHttpRequest, Blob e AbortController. Não oferece entrada CommonJS.

O primeiro consumidor previsto é Comissões da Nova Intranet. O backend prepara e confirma uploads; esta biblioteca transfere exclusivamente o arquivo. O provider atual é SeaweedFS, com interface compatível com S3. AWS S3, Azure Blob Storage e Google Cloud Storage não têm integrações específicas implementadas.

## Instalação e distribuição

Para instalar um arquivo gerado por `npm pack`:

```bash
npm install /caminho/spa-upload-transfer-0.1.0.tgz
```

Quando o registry corporativo estiver configurado para o escopo `@spa`:

```bash
npm install @spa/upload-transfer@0.1.0
```

O pacote não está declarado como publicado. `private: true` impede publicação por npm, inclusive em registry privado, mas permite `npm pack` e instalação do `.tgz`. Manter esse campo para distribuição por arquivo; uma futura publicação interna exige configurar registry e acesso e revisar explicitamente esse campo.

## API pública

As entradas condicionais Browser e Node exportam `createUploadFileUseCase`, `createUploadTransport`, `UploadFileUseCase` e as cinco exceções abaixo. Os tipos exportados são `UploadInputDTO`, `UploadOutputDTO` e `UploadProgressDTO`.

`createUploadFileUseCase()` retorna um `UploadFileUseCase` composto com o provider SeaweedFS e o transporte do ambiente. `execute(input)` retorna `Promise<UploadOutputDTO>`. `createUploadTransport()` retorna o transporte XHR no Browser e HTTP/HTTPS nativo no Node.

`UploadFileUseCase` também pode ser instanciado com um provider estrutural que implemente `upload(input: UploadInputDTO): Promise<UploadOutputDTO>`:

```ts
import { UploadFileUseCase, createUploadTransport } from '@spa/upload-transfer';

const transport = createUploadTransport();
const upload = new UploadFileUseCase({ upload: (input) => transport.upload(input) });
```

### Browser

O consumidor recebe `file` de um input de arquivo e `authorization` da preparação feita pelo backend:

```ts
import { createUploadFileUseCase } from '@spa/upload-transfer';
import type { UploadOutputDTO } from '@spa/upload-transfer';

async function transferFile(
  file: File,
  authorization: { url: string; method: string; headers: Record<string, string> },
  signal: AbortSignal,
): Promise<UploadOutputDTO> {
  return createUploadFileUseCase().execute({
    file,
    ...authorization,
    signal,
    timeoutMs: 60_000,
    onProgress: ({ percentage }) => {
      if (percentage !== undefined) console.info('Progresso (%)', percentage);
    },
  });
}
```

O bundler deve habilitar a condição `browser`. O storage precisa permitir a origem, o método e os headers via CORS. Headers restritos pelo navegador não podem ser enviados arbitrariamente; não modificar os headers assinados para contornar isso.

### Node.js

O contrato também utiliza `Blob` no Node, não Buffer ou Readable diretamente:

```ts
import { readFile } from 'node:fs/promises';
import { createUploadFileUseCase } from '@spa/upload-transfer';
import type { UploadOutputDTO } from '@spa/upload-transfer';

async function transferFile(
  path: string,
  authorization: { url: string; method: string; headers: Record<string, string> },
): Promise<UploadOutputDTO> {
  const file = new Blob([await readFile(path)]);
  return createUploadFileUseCase().execute({ file, ...authorization, timeoutMs: 60_000 });
}
```

Esse exemplo carrega o arquivo em memória antes de criar o Blob; o transporte lê o Blob em fluxo.

## Contratos

Todos os campos dos DTOs são `readonly`.

| UploadInputDTO | Tipo                                  | Obrigatório        |
| -------------- | ------------------------------------- | ------------------ |
| file           | Blob (inclui File no Browser)         | Sim                |
| url            | string                                | Sim                |
| method         | string                                | Sim                |
| headers        | Readonly<Record<string, string>>      | Sim; pode ser `{}` |
| onProgress     | (progress: UploadProgressDTO) => void | Não                |
| signal         | AbortSignal                           | Não                |
| timeoutMs      | number                                | Não                |

`UploadOutputDTO` contém somente `status: number`. Respostas 2xx são sucesso; outras respostas geram `UploadHttpException`.

| UploadProgressDTO | Tipo             | Significado                    |
| ----------------- | ---------------- | ------------------------------ |
| loaded            | number           | Bytes enviados acumulados      |
| total             | number, opcional | Total conhecido                |
| percentage        | number, opcional | Percentual quando computável   |
| lengthComputable  | boolean          | Indica se o total é computável |

## Erros

`UploadException` é a classe base. `UploadAbortException` indica cancelamento; `UploadNetworkException`, falha de rede ou de início da requisição; `UploadTimeoutException`, limite de tempo; `UploadHttpException`, resposta HTTP malsucedida, com propriedade `status`. Exceções podem preservar `cause` via ErrorOptions.

```ts
import {
  createUploadFileUseCase,
  UploadException,
  UploadAbortException,
  UploadNetworkException,
  UploadTimeoutException,
  UploadHttpException,
} from '@spa/upload-transfer';
import type { UploadInputDTO } from '@spa/upload-transfer';

async function transfer(input: UploadInputDTO): Promise<void> {
  try {
    await createUploadFileUseCase().execute(input);
  } catch (error: unknown) {
    if (error instanceof UploadAbortException) console.info('Upload cancelado');
    else if (error instanceof UploadTimeoutException) console.info('Tempo limite excedido');
    else if (error instanceof UploadHttpException) console.info('Status HTTP', error.status);
    else if (error instanceof UploadNetworkException) console.info('Falha de rede');
    else if (error instanceof UploadException) console.info('Falha de upload');
    else throw error;
  }
}
```

## Cancelamento, progresso e timeout

Passe `controller.signal` e chame `controller.abort()` para cancelar. Um signal já cancelado rejeita antes de iniciar o envio.

No Browser, progresso vem de `xhr.upload`; total e percentual podem estar ausentes. No Node, progresso é emitido após a escrita dos chunks, usando o tamanho do Blob; um Blob vazio não emite progresso. Progresso de 100% não confirma sucesso: aguarde a Promise e o status HTTP. Callbacks devem ser rápidos e não lançar erros.

Sem `timeoutMs`, não há limite explícito definido pela biblioteca. Use um número positivo e finito: no Browser é usado `xhr.timeout` (zero desabilita); no Node é um timer da operação, e zero dispara imediatamente. Os ambientes também estão sujeitos às suas próprias restrições de rede.

## Segurança

O consumidor fornece URL pré-assinada, método e headers de autorização exatamente como preparados pelo backend. Preserve query string e valores assinados. URLs assinadas e tokens são informações sensíveis: não os registre em logs, mensagens de erro ou telemetria. Utilize HTTPS em produção. Não há gerenciamento de credenciais de storage.

## Desenvolvimento

```bash
npm ci
npm run clean
npm run build
npm run typecheck
npm run lint
npm run format
npm run format:check
npm test
npm run test:unit
npm run test:package
npm run test:consumer
npm run test:browser:install
npm run test:browser
npm run check
npm pack --dry-run
npm pack
```

`check` executa TypeScript, ESLint, Prettier, testes unitários/integração e build. `test:package` constrói e valida as entradas públicas. `test:consumer` constrói, inspeciona o empacotamento, instala o `.tgz` fora do repositório, compila um consumidor TypeScript Node e Browser, executa o consumidor Node e compila/executa o bundle Vite em Chromium. Usa as ferramentas já disponíveis no projeto e requer Chromium instalado. Diretórios temporários são removidos ao terminar.

## Limitações do MVP

Não há upload multipart ou em partes, upload resumível, retry automático, gerenciamento de concorrência, preparação ou confirmação no backend, nem gerenciamento de credenciais de storage. Não há integração com a Nova Intranet neste pacote. A compatibilidade futura com outros storages depende de seus contratos HTTP e não significa integração específica já validada.

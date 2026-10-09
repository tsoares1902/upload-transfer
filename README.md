# @spa/upload-transfer

Biblioteca TypeScript para transferência HTTP direta de arquivos a URLs autorizadas pela aplicação consumidora.

## Objetivo

Centralizar o transporte de arquivos para armazenamento de objetos, preservando a responsabilidade da aplicação e do backend pela preparação, autorização e confirmação dos uploads.

A primeira integração será realizada no módulo **Comissões da Nova Intranet**, substituindo exclusivamente a requisição HTTP que envia o arquivo diretamente ao bucket.

## Escopo do MVP

- Upload HTTP direto, com arquivo no corpo da requisição.
- URL, método e headers fornecidos pela aplicação.
- Compatibilidade com Browser e Node.js 22.
- Progresso tipado.
- Resultado e exceções tipados.
- Testes automatizados.

## Fora do escopo

A biblioteca não prepara uploads, gera assinaturas S3, administra credenciais, confirma registros ou implementa regras de negócio.

Multipart, chunks, retry automático e retomada de uploads não fazem parte do MVP.

## Tecnologias

TypeScript strict, ESM, tsdown, Vitest, Playwright, ESLint e Prettier.

## Desenvolvimento

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Os testes serão adicionados nas próximas etapas.

## Estado

**Passo 0 — Fundação.** A API de upload ainda não está implementada.

## Distribuição

O pacote será distribuído por registry corporativo privado, após definição das permissões e da configuração de publicação.

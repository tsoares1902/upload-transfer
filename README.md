# Upload Transfer

Pacote TypeScript para transferência direta e resiliente de arquivos para object storage.

O Upload Transfer atua no transfer plane do processo de upload. Ele recebe uma autorização temporária fornecida pela aplicação e realiza a transferência dos dados diretamente para o storage, sem transportar o arquivo pela API backend.

O pacote é independente de framework frontend e de storage provider.

## Features

- Transferência direta para object storage
- File / Blob
- Transfer Authorization
- Fetch nativo
- Validação da resposta da transferência
- Resultado padronizado
- Erros padronizados
- Cancelamento
- Timeout configurável
- Retry
- Backoff
- Progresso de upload
- Multipart / chunk
- Retry por chunk
- Controle de concorrência
- Resume
- Framework agnostic
- Provider agnostic
- Zero runtime dependencies como objetivo

## Compatibility

- Node.js >= 10
- Browsers modernos compatíveis com as Web APIs utilizadas pelo pacote

## Status

Em desenvolvimento.
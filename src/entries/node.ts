import { SeaweedFSAdapter } from '../adapters/providers/SeaweedFSAdapter.js';
import { NodeTransportAdapter } from '../adapters/transports/NodeTransportAdapter.js';
import type { UploadTransportInterface } from '../interfaces/UploadTransportInterface.js';
import { UploadFileUseCase } from '../use-cases/UploadFileUseCase.js';

/**
 * Cria o transporte HTTP adequado ao ambiente Node.js.
 *
 * @returns {UploadTransportInterface} Transporte baseado nos módulos HTTP nativos do Node.js.
 */
export function createUploadTransport(): UploadTransportInterface {
  return new NodeTransportAdapter();
}

/**
 * Cria o caso de uso de upload com as dependências do ambiente Node.js.
 *
 * @returns {UploadFileUseCase} Caso de uso configurado com o transporte Node.js.
 */
export function createUploadFileUseCase(): UploadFileUseCase {
  return new UploadFileUseCase(new SeaweedFSAdapter(createUploadTransport()));
}

export { UploadFileUseCase } from '../use-cases/UploadFileUseCase.js';

export type { UploadInputDTO } from '../types/UploadInputDTO.js';
export type { UploadOutputDTO } from '../types/UploadOutputDTO.js';
export type { UploadProgressDTO } from '../types/UploadProgressDTO.js';

export { UploadException } from '../exceptions/UploadException.js';
export { UploadAbortException } from '../exceptions/UploadAbortException.js';
export { UploadNetworkException } from '../exceptions/UploadNetworkException.js';
export { UploadTimeoutException } from '../exceptions/UploadTimeoutException.js';
export { UploadHttpException } from '../exceptions/UploadHttpException.js';

import { NodeTransportAdapter } from '../adapters/transports/NodeTransportAdapter.js';
import type { UploadTransportInterface } from '../interfaces/UploadTransportInterface.js';

/**
 * Cria o transporte HTTP adequado ao ambiente Node.js.
 *
 * @returns {UploadTransportInterface} Transporte baseado nos módulos HTTP nativos do Node.js.
 */
export function createUploadTransport(): UploadTransportInterface {
  return new NodeTransportAdapter();
}

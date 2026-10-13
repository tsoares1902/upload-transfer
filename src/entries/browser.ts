import { XhrTransportAdapter } from '../adapters/transports/XhrTransportAdapter.js';
import type { UploadTransportInterface } from '../interfaces/UploadTransportInterface.js';

/**
 * Cria o transporte HTTP adequado ao ambiente Browser.
 *
 * @returns {UploadTransportInterface} Transporte baseado em XMLHttpRequest.
 */
export function createUploadTransport(): UploadTransportInterface {
  return new XhrTransportAdapter();
}

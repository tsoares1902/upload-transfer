import { UploadException } from './UploadException.js';

export class UploadNetworkException extends UploadException {
  /**
   * Cria uma exceção para falhas de rede durante o upload.
   *
   * @param {string} [message='Network error during upload.'] Descrição da falha.
   * @param {ErrorOptions} [options] Opções nativas, incluindo a causa original.
   */
  constructor(message = 'Network error during upload.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'UploadNetworkException';
  }
}

import { UploadException } from './UploadException.js';

export class UploadTimeoutException extends UploadException {
  /**
   * Cria uma exceção para uploads que excederam o tempo limite.
   *
   * @param {ErrorOptions} [options] Opções nativas, incluindo a causa original.
   */
  constructor(options?: ErrorOptions) {
    super('Upload timed out.', options);
    this.name = 'UploadTimeoutException';
  }
}

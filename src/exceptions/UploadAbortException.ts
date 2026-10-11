import { UploadException } from './UploadException.js';

export class UploadAbortException extends UploadException {
  /**
   * Cria uma exceção para uploads cancelados.
   *
   * @param {ErrorOptions} [options] Opções nativas, incluindo a causa original.
   */
  constructor(options?: ErrorOptions) {
    super('Upload was aborted.', options);
    this.name = 'UploadAbortException';
  }
}

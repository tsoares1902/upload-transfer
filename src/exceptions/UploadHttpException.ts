import { UploadException } from './UploadException.js';

export class UploadHttpException extends UploadException {
  /**
   * Cria uma exceção para uma resposta HTTP malsucedida.
   *
   * @param {number} status Código de status HTTP recebido.
   * @param {ErrorOptions} [options] Opções nativas, incluindo a causa original.
   */
  constructor(
    /** Código de status HTTP recebido. */
    public readonly status: number,
    options?: ErrorOptions,
  ) {
    super(`Upload failed with HTTP status ${status}.`, options);
    this.name = 'UploadHttpException';
  }
}

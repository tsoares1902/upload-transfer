export class UploadException extends Error {
  /**
   * Cria uma exceção de upload.
   *
   * @param {string} message Descrição do erro.
   * @param {ErrorOptions} [options] Opções nativas, incluindo a causa original.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UploadException';
  }
}

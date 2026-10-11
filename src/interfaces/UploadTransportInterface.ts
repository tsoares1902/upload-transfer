import type { UploadInputDTO } from '../types/UploadInputDTO.js';
import type { UploadOutputDTO } from '../types/UploadOutputDTO.js';

export interface UploadTransportInterface {
  /**
   * Transfere um arquivo por HTTP conforme os dados e as opções de controle fornecidos.
   *
   * @param {UploadInputDTO} input Dados da transferência e opções de controle.
   * @returns {Promise<UploadOutputDTO>} Resultado HTTP da transferência.
   */
  upload(input: UploadInputDTO): Promise<UploadOutputDTO>;
}

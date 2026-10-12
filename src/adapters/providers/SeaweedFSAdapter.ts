import type { UploadProviderInterface } from '../../interfaces/UploadProviderInterface.js';
import type { UploadTransportInterface } from '../../interfaces/UploadTransportInterface.js';
import type { UploadInputDTO } from '../../types/UploadInputDTO.js';
import type { UploadOutputDTO } from '../../types/UploadOutputDTO.js';

export class SeaweedFSAdapter implements UploadProviderInterface {
  /**
   * Cria o provider SeaweedFS com o transporte HTTP informado.
   *
   * @param {UploadTransportInterface} transport Transporte responsável pela transferência.
   */
  constructor(private readonly transport: UploadTransportInterface) {}

  /**
   * Transfere um arquivo utilizando a URL pré-assinada recebida.
   *
   * @param {UploadInputDTO} input Dados da transferência HTTP.
   * @returns {Promise<UploadOutputDTO>} Resultado da transferência.
   */
  upload(input: UploadInputDTO): Promise<UploadOutputDTO> {
    return this.transport.upload(input);
  }
}

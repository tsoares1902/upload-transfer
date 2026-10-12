import type { UploadProviderInterface } from '../interfaces/UploadProviderInterface.js';
import type { UploadInputDTO } from '../types/UploadInputDTO.js';
import type { UploadOutputDTO } from '../types/UploadOutputDTO.js';

export class UploadFileUseCase {
  /**
   * Cria o caso de uso com o provider responsável pelo upload.
   *
   * @param {UploadProviderInterface} provider Provider responsável pela transferência.
   */
  constructor(private readonly provider: UploadProviderInterface) {}

  /**
   * Executa a transferência do arquivo utilizando o provider configurado.
   *
   * @param {UploadInputDTO} input Dados necessários para a transferência.
   * @returns {Promise<UploadOutputDTO>} Resultado da transferência HTTP.
   */
  execute(input: UploadInputDTO): Promise<UploadOutputDTO> {
    return this.provider.upload(input);
  }
}

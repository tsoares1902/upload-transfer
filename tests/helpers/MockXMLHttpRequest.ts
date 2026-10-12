import { vi } from 'vitest';

export class MockXMLHttpRequest {
  /** Instâncias criadas pelo transporte. */
  static instances: MockXMLHttpRequest[] = [];
  /** Falhas síncronas configuradas por operação. */
  static failures: Partial<Record<'open' | 'setRequestHeader' | 'send', Error>> = {};
  /** Status HTTP controlado pelo teste. */
  status = 0;
  /** Timeout nativo padrão, em milissegundos. */
  timeout = 0;
  /** Callback de resposta HTTP. */
  onload: (() => void) | null = null;
  /** Callback de falha de rede. */
  onerror: (() => void) | null = null;
  /** Callback de timeout. */
  ontimeout: (() => void) | null = null;
  /** Callback de cancelamento. */
  onabort: (() => void) | null = null;
  /** Canal de progresso do upload. */
  upload = {
    onprogress: null as
      ((event: Pick<ProgressEvent, 'loaded' | 'total' | 'lengthComputable'>) => void) | null,
  };
  /**
   * Registra método e URL e permite falhas de inicialização.
   *
   * @param {string} method Método HTTP.
   * @param {string} url URL solicitada.
   * @returns {void} Conclui a abertura simulada.
   */
  open = vi.fn<(method: string, url: string) => void>(() => {
    if (MockXMLHttpRequest.failures.open) throw MockXMLHttpRequest.failures.open;
  });
  /**
   * Registra os headers enviados pelo adapter.
   *
   * @param {string} name Nome do header.
   * @param {string} value Valor do header.
   * @returns {void} Conclui o registro.
   */
  setRequestHeader = vi.fn<(name: string, value: string) => void>(() => {
    if (MockXMLHttpRequest.failures.setRequestHeader)
      throw MockXMLHttpRequest.failures.setRequestHeader;
  });
  /**
   * Registra o corpo original enviado.
   *
   * @param {Blob} body Corpo da requisição.
   * @returns {void} Conclui o envio simulado.
   */
  send = vi.fn<(body: Blob) => void>(() => {
    if (MockXMLHttpRequest.failures.send) throw MockXMLHttpRequest.failures.send;
  });
  /**
   * Simula cancelamento síncrono do XHR.
   *
   * @returns {void} Emite o evento de cancelamento.
   */
  abort = vi.fn(() => this.onabort?.());

  /**
   * Registra a instância para controle pelo teste.
   *
   * @returns {MockXMLHttpRequest} Instância controlável.
   */
  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  /**
   * Emite uma resposta HTTP controlada.
   *
   * @param {number} status Status da resposta.
   * @returns {void} Conclui a emissão.
   */
  respond(status: number): void {
    this.status = status;
    this.onload?.();
  }
}

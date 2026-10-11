import type { UploadProgressDTO } from './UploadProgressDTO.js';

export interface UploadInputDTO {
  readonly file: Blob;
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly onProgress?: (progress: UploadProgressDTO) => void;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

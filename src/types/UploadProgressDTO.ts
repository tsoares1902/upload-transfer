export interface UploadProgressDTO {
  readonly loaded: number;
  readonly total?: number;
  readonly percentage?: number;
  readonly lengthComputable: boolean;
}

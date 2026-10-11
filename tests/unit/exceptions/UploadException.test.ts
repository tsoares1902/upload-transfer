import { describe, expect, it } from 'vitest';

import { UploadException } from '../../../src/exceptions/UploadException.js';

describe('UploadException', () => {
  it('should extend the native Error class', () => {
    const error = new UploadException('Upload failed.');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UploadException);
  });

  it('should preserve the error name and message', () => {
    const error = new UploadException('Upload failed.');

    expect(error.name).toBe('UploadException');
    expect(error.message).toBe('Upload failed.');
  });

  it('should preserve the original cause', () => {
    const cause = new Error('Original failure.');
    const error = new UploadException('Upload failed.', { cause });

    expect(error.cause).toBe(cause);
  });
});

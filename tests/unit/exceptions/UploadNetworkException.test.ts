import { describe, expect, it } from 'vitest';

import { UploadException } from '../../../src/exceptions/UploadException.js';
import { UploadNetworkException } from '../../../src/exceptions/UploadNetworkException.js';

describe('UploadNetworkException', () => {
  it('should extend UploadException', () => {
    const error = new UploadNetworkException();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UploadException);
    expect(error).toBeInstanceOf(UploadNetworkException);
  });

  it('should use the default message', () => {
    const error = new UploadNetworkException();

    expect(error.name).toBe('UploadNetworkException');
    expect(error.message).toBe('Network error during upload.');
  });

  it('should accept a custom message', () => {
    const error = new UploadNetworkException('Connection refused.');

    expect(error.message).toBe('Connection refused.');
  });

  it('should preserve the original cause', () => {
    const cause = new TypeError('Failed to fetch.');
    const error = new UploadNetworkException('Network failure.', { cause });

    expect(error.cause).toBe(cause);
  });
});

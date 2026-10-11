import { describe, expect, it } from 'vitest';

import { UploadException } from '../../../src/exceptions/UploadException.js';
import { UploadTimeoutException } from '../../../src/exceptions/UploadTimeoutException.js';

describe('UploadTimeoutException', () => {
  it('should extend UploadException', () => {
    const error = new UploadTimeoutException();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UploadException);
    expect(error).toBeInstanceOf(UploadTimeoutException);
  });

  it('should expose the correct name and message', () => {
    const error = new UploadTimeoutException();

    expect(error.name).toBe('UploadTimeoutException');
    expect(error.message).toBe('Upload timed out.');
  });

  it('should preserve the original cause', () => {
    const cause = new Error('Request timeout.');
    const error = new UploadTimeoutException({ cause });

    expect(error.cause).toBe(cause);
  });
});

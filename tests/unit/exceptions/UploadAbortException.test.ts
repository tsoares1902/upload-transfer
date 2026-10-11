import { describe, expect, it } from 'vitest';

import { UploadException } from '../../../src/exceptions/UploadException.js';
import { UploadAbortException } from '../../../src/exceptions/UploadAbortException.js';

describe('UploadAbortException', () => {
  it('should extend UploadException', () => {
    const error = new UploadAbortException();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UploadException);
    expect(error).toBeInstanceOf(UploadAbortException);
  });

  it('should expose the correct name and message', () => {
    const error = new UploadAbortException();

    expect(error.name).toBe('UploadAbortException');
    expect(error.message).toBe('Upload was aborted.');
  });

  it('should preserve the original cause', () => {
    const cause = new Error('Operation cancelled.');
    const error = new UploadAbortException({ cause });

    expect(error.cause).toBe(cause);
  });
});

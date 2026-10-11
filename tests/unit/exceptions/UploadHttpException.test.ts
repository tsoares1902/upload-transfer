import { describe, expect, it } from 'vitest';

import { UploadException } from '../../../src/exceptions/UploadException.js';
import { UploadHttpException } from '../../../src/exceptions/UploadHttpException.js';

describe('UploadHttpException', () => {
  it('should extend UploadException', () => {
    const error = new UploadHttpException(400);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(UploadException);
    expect(error).toBeInstanceOf(UploadHttpException);
  });

  it.each([400, 401, 403, 404, 409, 429, 500, 503])('should preserve HTTP status %i', (status) => {
    const error = new UploadHttpException(status);

    expect(error.status).toBe(status);
    expect(error.name).toBe('UploadHttpException');
    expect(error.message).toBe(`Upload failed with HTTP status ${status}.`);
  });

  it('should preserve the original cause', () => {
    const cause = new Error('HTTP request failed.');
    const error = new UploadHttpException(500, { cause });

    expect(error.cause).toBe(cause);
  });
});

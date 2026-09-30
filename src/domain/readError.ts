import type { ErrorCode } from './types';

export class ReadError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

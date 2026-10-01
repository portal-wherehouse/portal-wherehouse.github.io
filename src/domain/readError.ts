import type { ErrorCode } from './types';

export class ReadError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    /** Set when the scan belongs to a transfer (its slip, or a pallet on its way here), so a screen can open it. */
    public transferId?: string,
  ) {
    super(message);
  }
}

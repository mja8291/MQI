import type { ErrorCode } from '@mqi/shared';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const fail = (code: ErrorCode, message: string, details?: unknown): never => {
  throw new AppError(code, message, details);
};

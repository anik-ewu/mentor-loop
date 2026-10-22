export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string[]>) =>
  new AppError(400, 'BAD_REQUEST', message, fields);
export const unauthorized = (message = 'Please log in') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

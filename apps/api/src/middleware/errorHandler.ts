import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, fields: err.fields } });
  }
  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid request' } });
  }
  // Prisma's "record not found": the row went away between the check and the write.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
  // Body parser rejections (too large, bad charset...) are the client's mistake, not an outage.
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const message = status === 413 ? 'That request is too large' : 'Invalid request';
    const code = status === 413 ? 'TOO_LARGE' : 'BAD_REQUEST';
    return res.status(status).json({ error: { code, message } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}

import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyToken, type AuthPayload } from '../lib/jwt';

export const AUTH_COOKIE = 'ml_session';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthPayload;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return next(unauthorized());
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    next(unauthorized('Your session has expired, please log in again'));
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.auth?.role !== 'admin') return next(forbidden());
    next();
  });
}

/** Returns the authenticated user's id. Only call after requireAuth. */
export const currentUserId = (req: Request) => req.auth!.sub;

import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyToken, type AuthPayload } from '../lib/jwt';
import { prisma } from '../lib/prisma';

export const AUTH_COOKIE = 'ml_session';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthPayload;
  }
}

/**
 * The session's payload, or null when the token is invalid, expired or revoked. Tokens are
 * stateless, so a password reset bumps User.sessionVersion and this rejects tokens from before it.
 */
async function readSession(token: string): Promise<AuthPayload | null> {
  let payload: AuthPayload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { sessionVersion: true },
  });
  return user && user.sessionVersion === (payload.ver ?? 0) ? payload : null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return next(unauthorized());
  try {
    const session = await readSession(token);
    if (!session) return next(unauthorized('Your session has expired, please log in again'));
    req.auth = session;
    next();
  } catch (err) {
    next(err);
  }
}

/** Sets req.auth when a valid session cookie is present, never rejects. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  try {
    // Expired, invalid or revoked: treat as logged out.
    if (token) req.auth = (await readSession(token)) ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  void requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.auth?.role !== 'admin') return next(forbidden());
    next();
  });
}

/** Returns the authenticated user's id. Only call after requireAuth. */
export const currentUserId = (req: Request) => req.auth!.sub;

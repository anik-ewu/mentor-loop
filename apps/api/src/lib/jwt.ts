import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';

export interface AuthPayload {
  sub: string;
  role: Role;
  /** User.sessionVersion when the token was issued. Missing in tokens from before it existed. */
  ver?: number;
}

export const signToken = (payload: AuthPayload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });

export const verifyToken = (token: string) => jwt.verify(token, env.JWT_SECRET) as AuthPayload;

/** A separate key, so a ticket from the password step can never pass as a session. */
const ticketKey = () => `${env.JWT_SECRET}:two-factor`;

/** Proves the first login step passed. Only POST /auth/2fa/login accepts it. */
export const signTwoFactorTicket = (payload: { sub: string; ver: number }) =>
  jwt.sign(payload, ticketKey(), { expiresIn: '5m' });

export function verifyTwoFactorTicket(ticket: string) {
  try {
    return jwt.verify(ticket, ticketKey()) as { sub: string; ver: number };
  } catch {
    return null;
  }
}

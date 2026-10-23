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

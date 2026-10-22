import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';

export interface AuthPayload {
  sub: string;
  role: Role;
}

export const signToken = (payload: AuthPayload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });

export const verifyToken = (token: string) => jwt.verify(token, env.JWT_SECRET) as AuthPayload;

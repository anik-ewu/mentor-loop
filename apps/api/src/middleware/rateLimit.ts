import { isIP } from 'node:net';
import type { Request } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { env } from '../config/env';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/**
 * Who to count a request against. In production req.ip is a proxy shared by many visitors, so
 * Vercel's client IP header comes first. A request sent straight to Render can fake this header,
 * so a route that is costly or guessable also needs a limit on emailKey or everyoneKey.
 */
export function clientKey(req: Request) {
  const forwarded = req.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  return ipKeyGenerator(forwarded && isIP(forwarded) ? forwarded : (req.ip ?? ''));
}

/** Counts per account. Goes after validateBody, which normalises the email and caps its length. */
export const emailKey = (req: Request) => (req.body as { email: string }).email;

/** One count for all visitors, as a backstop. Anyone can use it up, so keep it above real traffic. */
export const everyoneKey = () => 'everyone';

type LimiterOptions = Pick<Options, 'limit'> & Partial<Options>;

/** `enabled` is only for tests: the API tests log in far more often than any limit allows. */
export const createLimiter = (options: LimiterOptions, enabled = env.NODE_ENV !== 'test') =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    keyGenerator: clientKey,
    skip: () => !enabled,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
    ...options,
  });

/**
 * A ceiling for all API traffic per visitor, well above real use: AI polling and page loads together
 * stay far below 1 request per second. Stops one client from tying up the server and database.
 */
export const generalLimiter = createLimiter({
  limit: 900,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests, try again in a few minutes' },
  },
});

/**
 * Caps password guesses per account, even with a faked client IP. It can't catch one password tried
 * across many accounts. Server errors don't count, so an outage doesn't block anyone afterwards.
 * Google sign-in and a reset link already sent still work for an account that hits this limit.
 */
export const createLoginFailureLimiter = (enabled?: boolean) =>
  createLimiter(
    {
      limit: 10,
      keyGenerator: emailKey,
      skipSuccessfulRequests: true,
      requestWasSuccessful: (_req, res) => res.statusCode !== 401,
      legacyHeaders: false,
    },
    enabled,
  );

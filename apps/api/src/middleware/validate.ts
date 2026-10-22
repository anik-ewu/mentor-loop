import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { badRequest } from '../lib/errors';

/** Validates req.body and replaces it with the parsed (typed, trimmed) value. */
export const validateBody =
  (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = z.flattenError(result.error).fieldErrors as Record<string, string[]>;
      return next(badRequest('Please check the highlighted fields', fields));
    }
    req.body = result.data;
    next();
  };

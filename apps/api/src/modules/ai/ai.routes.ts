import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { badRequest } from '../../lib/errors';
import { currentUserId, requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { aiDisabled } from './ai.runner';
import {
  coverLetterRequestSchema,
  interviewRequestSchema,
  practicedSchema,
  reviewRequestSchema,
  runListQuerySchema,
} from './ai.schema';
import * as ai from './ai.service';
import { aiEnabled } from './claude';

const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Kept in memory only: the PDF goes to the model and is never written anywhere. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 10 },
}).single('resume');

function receivePdf(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(
        badRequest(
          err.code === 'LIMIT_FILE_SIZE' ? 'The PDF must be 5 MB or smaller' : 'Invalid upload',
          { resume: [err.code === 'LIMIT_FILE_SIZE' ? 'Max 5 MB' : err.message] },
        ),
      );
    }
    if (err) return next(err);
    const file = req.file;
    // Both the declared type and the file's own magic bytes must say PDF.
    if (
      file &&
      (file.mimetype !== 'application/pdf' ||
        !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
    ) {
      return next(badRequest('Only PDF files are supported', { resume: ['Upload a PDF file'] }));
    }
    next();
  });
}

const requireAi = (_req: Request, _res: Response, next: NextFunction) =>
  next(aiEnabled() ? undefined : aiDisabled());

const actor = (req: Request) => ({ id: currentUserId(req), role: req.auth!.role });

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.post(
  '/reviews',
  requireAi,
  receivePdf,
  validateBody(reviewRequestSchema),
  async (req, res) => {
    const run = await ai.createReview(actor(req), req.body, req.file);
    res.status(202).json({ run });
  },
);

aiRouter.post(
  '/interview-questions',
  requireAi,
  validateBody(interviewRequestSchema),
  async (req, res) => {
    res.status(202).json({ run: await ai.createInterviewQuestions(actor(req), req.body) });
  },
);

aiRouter.post(
  '/cover-letters',
  requireAi,
  validateBody(coverLetterRequestSchema),
  async (req, res) => {
    res.status(202).json({ run: await ai.createCoverLetter(actor(req), req.body) });
  },
);

aiRouter.get('/runs', async (req, res) => {
  res.json({ runs: await ai.listRuns(currentUserId(req), runListQuerySchema.parse(req.query)) });
});

aiRouter.get('/runs/:id', async (req, res) => {
  res.json({ run: await ai.getRun(currentUserId(req), req.params.id as string) });
});

aiRouter.patch('/runs/:id/practiced', validateBody(practicedSchema), async (req, res) => {
  const { key, done } = req.body;
  res.json({ run: await ai.setPracticed(currentUserId(req), req.params.id as string, key, done) });
});

aiRouter.delete('/runs/:id', async (req, res) => {
  await ai.deleteRun(currentUserId(req), req.params.id as string);
  res.status(204).end();
});

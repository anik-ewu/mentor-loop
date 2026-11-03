import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { AppError, badRequest } from '../../lib/errors';
import { currentUserId, requireAuth } from '../../middleware/auth';
import { createLimiter } from '../../middleware/rateLimit';
import { validateBody } from '../../middleware/validate';
import { aiDisabled, assertCanRun } from './ai.runner';
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

/**
 * Each PDF sits in memory twice during its model call: the upload and its base64 copy, about 12 MB
 * at most. This keeps the total far below what a 512 MB server can hold, however many arrive at once.
 */
const MAX_PARALLEL_PDFS = 4;
/** A client that trickles an upload would otherwise hold its slot for minutes. */
const UPLOAD_TIMEOUT_MS = 60_000;
let pdfsInMemory = 0;

/** Kept in memory only: the PDF goes to the model and is never written anywhere. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 10 },
}).single('resume');

/** Holds a place for one upload. Released with `res.locals.releasePdf`, or when the response ends. */
function holdPdfSlot(req: Request, res: Response, next: NextFunction) {
  // Pasted text is small, and must not wait behind (or block) real uploads.
  if (!req.is('multipart/form-data')) return next();
  if (pdfsInMemory >= MAX_PARALLEL_PDFS) {
    return next(
      new AppError(503, 'AI_BUSY', 'The AI coach is busy right now. Try again in a minute.'),
    );
  }
  pdfsInMemory++;
  let held = true;
  const release = () => {
    if (held) pdfsInMemory--;
    held = false;
  };
  res.locals.releasePdf = release;
  // From the route handler on, the handler or its run owns the slot, even if the client hangs up.
  res.once('close', () => {
    if (!res.locals.pdfHandled) release();
  });
  next();
}

function receivePdf(req: Request, res: Response, next: NextFunction) {
  const timer = setTimeout(() => req.destroy(), UPLOAD_TIMEOUT_MS);
  upload(req, res, (err: unknown) => {
    clearTimeout(timer);
    if (err instanceof multer.MulterError) {
      return next(
        badRequest(
          err.code === 'LIMIT_FILE_SIZE' ? 'The PDF must be 5 MB or smaller' : 'Invalid upload',
          { resume: [err.code === 'LIMIT_FILE_SIZE' ? 'Max 5 MB' : err.message] },
        ),
      );
    }
    // Anything else here comes from parsing the client's broken or cut-off multipart body.
    if (err) return next(badRequest('Invalid upload', { resume: ['Upload a valid PDF file'] }));
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

/** Turns the request away before anything is uploaded or sent to the model. */
const checkQuota = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    await assertCanRun(currentUserId(req), req.auth!.role);
    next();
  } catch (err) {
    next(err);
  }
};

/** Bursts, on top of the daily quota: turned-away requests don't count there but still cost work. */
const aiRequestLimiter = createLimiter({
  limit: 30,
  keyGenerator: (req) => currentUserId(req),
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many AI requests, try again later' } },
});

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.post(
  '/reviews',
  requireAi,
  aiRequestLimiter,
  checkQuota,
  holdPdfSlot,
  receivePdf,
  validateBody(reviewRequestSchema),
  async (req, res) => {
    res.locals.pdfHandled = true;
    let started = false;
    try {
      const run = await ai.createReview(actor(req), req.body, req.file, () => {
        started = true;
        return res.locals.releasePdf;
      });
      res.status(202).json({ run });
    } finally {
      if (!started) res.locals.releasePdf?.();
    }
  },
);

aiRouter.post(
  '/interview-questions',
  requireAi,
  aiRequestLimiter,
  validateBody(interviewRequestSchema),
  async (req, res) => {
    res.status(202).json({ run: await ai.createInterviewQuestions(actor(req), req.body) });
  },
);

aiRouter.post(
  '/cover-letters',
  requireAi,
  aiRequestLimiter,
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

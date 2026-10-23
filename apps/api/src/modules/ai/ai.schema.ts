import { z } from 'zod';

const optionalText = (max: number) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(max).optional());

// ---------- Requests ----------

/** Multipart fields of POST /api/ai/reviews; the PDF itself is checked separately. */
export const reviewRequestSchema = z.object({
  text: optionalText(30_000),
  jobId: z.preprocess((v) => (v === '' ? undefined : v), z.uuid().optional()),
  targetRole: optionalText(120),
  jobDescription: optionalText(20_000),
});

export const runListQuerySchema = z.object({
  kind: z
    .enum(['resume_review', 'interview_questions', 'cover_letter'])
    .optional()
    .catch(undefined),
  jobId: z.uuid().optional().catch(undefined),
});

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

// ---------- Model output ----------
// No numeric or length limits here: structured outputs ignore them, so scores are
// clamped after parsing instead.

export const profileSchema = z.object({
  headline: z.string().describe('One-line professional headline, e.g. "Backend engineer, 4 yrs"'),
  skills: z.array(z.string()),
  experience: z.array(
    z.object({
      role: z.string(),
      company: z.string(),
      period: z.string(),
      highlights: z
        .array(z.string())
        .describe('Key achievements, with numbers when the resume has them'),
    }),
  ),
  projects: z.array(z.object({ name: z.string(), summary: z.string(), tech: z.array(z.string()) })),
  education: z.array(z.string()),
});

export const reviewOutputSchema = z.object({
  overallScore: z.number().describe('0-100'),
  atsScore: z.number().describe('0-100: how well an applicant tracking system can parse it'),
  summary: z.string().describe('2-3 sentences'),
  seniority: z.enum(['fresher', 'junior', 'mid', 'senior', 'lead']),
  sections: z.array(z.object({ name: z.string(), score: z.number(), feedback: z.string() })),
  strengths: z.array(z.string()),
  improvements: z.array(
    z.object({ priority: z.enum(['high', 'medium', 'low']), issue: z.string(), fix: z.string() }),
  ),
  bulletRewrites: z.array(
    z.object({ original: z.string(), improved: z.string(), why: z.string() }),
  ),
  missingKeywords: z.array(z.string()),
  redFlags: z.array(z.string()).describe('Gaps, typos, formatting problems'),
  jobMatch: z
    .object({
      score: z.number().describe('0-100'),
      matchedSkills: z.array(z.string()),
      missingSkills: z.array(z.string()),
      verdict: z.string().describe('One or two sentences: apply as is, tailor first, or a stretch'),
    })
    .nullable()
    .describe('null when no target job or role was given'),
  profile: profileSchema,
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type Profile = z.infer<typeof profileSchema>;

// ---------- Interview questions ----------

export const interviewRequestSchema = z.object({
  jobId: z.uuid(),
  reviewId: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.uuid().optional()),
});

export const INTERVIEW_CATEGORIES = [
  'technical',
  'system_design',
  'behavioral',
  'role_specific',
  'company_culture',
] as const;

export const interviewOutputSchema = z.object({
  rounds: z.array(
    z.object({
      category: z.enum(INTERVIEW_CATEGORIES),
      questions: z.array(
        z.object({
          question: z.string(),
          whyAsked: z.string().describe('What the interviewer wants to learn'),
          answerPoints: z.array(z.string()).describe('3-5 points a strong answer covers'),
          difficulty: z.enum(['easy', 'medium', 'hard']),
          fromResume: z
            .boolean()
            .describe("True when the question is about the candidate's own project or job"),
        }),
      ),
    }),
  ),
  questionsToAsk: z.array(z.string()).describe('Smart questions the candidate can ask them'),
});

export type InterviewRequest = z.infer<typeof interviewRequestSchema>;

/** Ticks one question as practised ("<roundIndex>-<questionIndex>") or clears it. */
export const practicedSchema = z.object({
  key: z.string().regex(/^\d{1,2}-\d{1,2}$/, 'Unknown question'),
  done: z.boolean(),
});

// ---------- Cover letter ----------

export const coverLetterRequestSchema = z.object({
  jobId: z.uuid(),
  reviewId: z.uuid(),
  tone: z.enum(['formal', 'friendly', 'concise']).default('formal'),
  length: z.enum(['short', 'standard']).default('standard'),
});

export const coverLetterOutputSchema = z.object({
  subject: z.string().describe('Email subject line'),
  greeting: z.string().describe('e.g. "Dear Hiring Team,"'),
  paragraphs: z.array(z.string()),
  closing: z
    .string()
    .describe('Sign-off with the candidate name, e.g. "Best regards,\\nJordan Lee"'),
  highlightsUsed: z.array(z.string()).describe('Which profile facts the letter relies on'),
});

export type CoverLetterRequest = z.infer<typeof coverLetterRequestSchema>;

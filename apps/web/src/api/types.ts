export type Role = 'user' | 'admin';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  isActive: boolean;
}

export interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'open' | 'booked';
}

export interface Booking {
  id: string;
  status: BookingStatus;
  note: string | null;
  cvUrl: string | null;
  createdAt: string;
  slot: Slot;
  service: Pick<Service, 'id' | 'name' | 'durationMin'>;
  user: Pick<User, 'id' | 'name' | 'email' | 'avatarUrl'>;
  /** AI resume review the candidate shared with the mentor. */
  resumeReview: {
    id: string;
    score: number | null;
    summary: string | null;
    targetRole: string | null;
  } | null;
}

export interface AdminSlot extends Slot {
  bookings: (Booking & { service: Service })[];
}

export interface Stats {
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  users: number;
  openSlots: number;
  nextBooking: Booking | null;
}

export interface AuthConfig {
  googleClientId: string | null;
  demoMode: boolean;
  aiEnabled: boolean;
}

// ---------- Job tracker ----------

export type JobStatus =
  | 'wishlist'
  | 'applied'
  | 'assessment'
  | 'interviewing'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'ghosted';
export type WorkMode = 'onsite' | 'hybrid' | 'remote';
export type JobEventType = 'status_change' | 'interview' | 'note' | 'follow_up';
export type InterviewOutcome = 'pending' | 'passed' | 'failed';
export type JobSort = 'updated' | 'created' | 'applied' | 'company' | 'priority';

export interface JobSummary {
  id: string;
  company: string;
  title: string;
  jobUrl: string | null;
  location: string | null;
  workMode: WorkMode | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  source: string | null;
  status: JobStatus;
  /** 1–3 stars, 3 is highest. */
  priority: number;
  appliedAt: string | null;
  followUpAt: string | null;
  deadline: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  nextInterviewAt: string | null;
}

export interface JobEvent {
  id: string;
  jobId: string;
  type: JobEventType;
  fromStatus: JobStatus | null;
  toStatus: JobStatus | null;
  title: string | null;
  scheduledAt: string | null;
  outcome: InterviewOutcome | null;
  notes: string | null;
  createdAt: string;
}

export interface JobAiRun {
  id: string;
  kind: 'resume_review' | 'interview_questions' | 'cover_letter';
  status: 'processing' | 'done' | 'failed';
  score: number | null;
  createdAt: string;
}

export interface Job extends Omit<JobSummary, 'nextInterviewAt'> {
  contactName: string | null;
  contactEmail: string | null;
  jobDescription: string | null;
  notes: string | null;
  coverLetter: string | null;
  events: JobEvent[];
  aiRuns: JobAiRun[];
}

export interface JobStats {
  byStatus: Partial<Record<JobStatus, number>>;
  total: number;
  applied: number;
  appliedLast7Days: number;
  /** Percentages, 0–100. */
  responseRate: number;
  interviews: number;
  interviewRate: number;
  offers: number;
  followUpsDue: Pick<JobSummary, 'id' | 'company' | 'title' | 'status' | 'followUpAt'>[];
  upcomingInterviews: {
    id: string;
    title: string | null;
    scheduledAt: string;
    job: Pick<JobSummary, 'id' | 'company' | 'title'>;
  }[];
}

// ---------- AI coach ----------

export type AiKind = 'resume_review' | 'interview_questions' | 'cover_letter';
export type AiStatus = 'processing' | 'done' | 'failed';

export interface Profile {
  headline: string;
  skills: string[];
  experience: { role: string; company: string; period: string; highlights: string[] }[];
  projects: { name: string; summary: string; tech: string[] }[];
  education: string[];
}

export interface ReviewResult {
  overallScore: number;
  atsScore: number;
  summary: string;
  seniority: 'fresher' | 'junior' | 'mid' | 'senior' | 'lead';
  sections: { name: string; score: number; feedback: string }[];
  strengths: string[];
  improvements: { priority: 'high' | 'medium' | 'low'; issue: string; fix: string }[];
  bulletRewrites: { original: string; improved: string; why: string }[];
  missingKeywords: string[];
  redFlags: string[];
  jobMatch: {
    score: number;
    matchedSkills: string[];
    missingSkills: string[];
    verdict: string;
  } | null;
  profile: Profile;
}

export interface AiRunInput {
  source?: 'pdf' | 'text';
  fileName?: string | null;
  targetRole?: string | null;
  tone?: string;
  length?: string;
}

export interface AiRunSummary {
  id: string;
  kind: AiKind;
  status: AiStatus;
  score: number | null;
  error: string | null;
  input: AiRunInput;
  jobId: string | null;
  sourceRunId: string | null;
  createdAt: string;
  completedAt: string | null;
  job: Pick<JobSummary, 'id' | 'company' | 'title'> | null;
}

export interface AiRun<R = unknown> extends AiRunSummary {
  result: R | null;
}

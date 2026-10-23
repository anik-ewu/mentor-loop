-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('wishlist', 'applied', 'assessment', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'ghosted');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('onsite', 'hybrid', 'remote');

-- CreateEnum
CREATE TYPE "JobEventType" AS ENUM ('status_change', 'interview', 'note', 'follow_up');

-- CreateEnum
CREATE TYPE "AiKind" AS ENUM ('resume_review', 'interview_questions', 'cover_letter');

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "GoalMetric" AS ENUM ('applications', 'interviews', 'follow_ups', 'resume_matches', 'interview_preps');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "resumeReviewId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobUrl" TEXT,
    "location" TEXT,
    "workMode" "WorkMode",
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT,
    "source" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'wishlist',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "appliedAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "contactName" TEXT,
    "contactEmail" TEXT,
    "jobDescription" TEXT,
    "notes" TEXT,
    "coverLetter" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "JobEventType" NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus",
    "title" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "outcome" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AiKind" NOT NULL,
    "status" "AiStatus" NOT NULL DEFAULT 'processing',
    "jobId" TEXT,
    "sourceRunId" TEXT,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "score" INTEGER,
    "error" TEXT,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "metric" "GoalMetric" NOT NULL,
    "target" INTEGER NOT NULL,

    CONSTRAINT "WeeklyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobApplication_userId_status_idx" ON "JobApplication"("userId", "status");

-- CreateIndex
CREATE INDEX "JobEvent_jobId_createdAt_idx" ON "JobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_userId_kind_createdAt_idx" ON "AiRun"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_status_createdAt_idx" ON "AiRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyGoal_userId_weekStart_metric_key" ON "WeeklyGoal"("userId", "weekStart", "metric");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_resumeReviewId_fkey" FOREIGN KEY ("resumeReviewId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

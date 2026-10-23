-- CreateEnum
CREATE TYPE "AiLimitReason" AS ENUM ('daily', 'budget');

-- AlterTable
ALTER TABLE "AiRun" ADD COLUMN     "costMicros" INTEGER,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER;

-- CreateTable
CREATE TABLE "AiLimitHit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "AiLimitReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiLimitHit_createdAt_idx" ON "AiLimitHit"("createdAt");

-- AddForeignKey
ALTER TABLE "AiLimitHit" ADD CONSTRAINT "AiLimitHit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

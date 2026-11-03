-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifyExpires" TIMESTAMP(3),
ADD COLUMN     "emailVerifyTokenHash" TEXT,
ADD COLUMN     "recoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecret" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerifyTokenHash_key" ON "User"("emailVerifyTokenHash");

-- Google already verified these addresses, an admin's comes from the deploy settings, and the demo
-- accounts have no real inbox. Everyone else is unverified until they use a confirmation link.
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP
WHERE "googleId" IS NOT NULL
   OR "role" = 'admin'
   OR "email" IN ('demo@mentorloop.dev', 'admin@mentorloop.dev');

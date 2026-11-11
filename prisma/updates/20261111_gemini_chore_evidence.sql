-- AlterTable
ALTER TABLE "ChoreSubmission" ADD COLUMN     "afterEvidenceId" TEXT,
ADD COLUMN     "aiReason" TEXT,
ADD COLUMN     "aiReviewStartedAt" TIMESTAMP(3),
ADD COLUMN     "aiReviewedAt" TIMESTAMP(3),
ADD COLUMN     "aiStatus" TEXT NOT NULL DEFAULT 'NOT_REVIEWED',
ADD COLUMN     "aiVerdict" TEXT,
ADD COLUMN     "approvalSource" TEXT,
ADD COLUMN     "beforeEvidenceId" TEXT;

-- CreateTable
CREATE TABLE "ChoreEvidence" (
    "id" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChoreEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChoreEvidence_choreId_childId_createdAt_idx" ON "ChoreEvidence"("choreId", "childId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreSubmission_beforeEvidenceId_key" ON "ChoreSubmission"("beforeEvidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreSubmission_afterEvidenceId_key" ON "ChoreSubmission"("afterEvidenceId");

-- AddForeignKey
ALTER TABLE "ChoreSubmission" ADD CONSTRAINT "ChoreSubmission_beforeEvidenceId_fkey" FOREIGN KEY ("beforeEvidenceId") REFERENCES "ChoreEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSubmission" ADD CONSTRAINT "ChoreSubmission_afterEvidenceId_fkey" FOREIGN KEY ("afterEvidenceId") REFERENCES "ChoreEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreEvidence" ADD CONSTRAINT "ChoreEvidence_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreEvidence" ADD CONSTRAINT "ChoreEvidence_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;


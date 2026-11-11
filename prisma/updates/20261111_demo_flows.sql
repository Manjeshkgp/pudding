-- Upgrade from the schema at merge fdf006e. Run once, or use npm run db:push.
-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "reservedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "spendingLimit" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "spentTotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "purchaseReservedBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "SpendingRule" ADD COLUMN     "ageBlockEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inStoreEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onlineEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FamilyTopUp" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "items" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "decisionReason" TEXT,
    "aiDecision" TEXT,
    "reviewedByUserId" TEXT,
    "payerUserId" TEXT,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "paymentAttempt" INTEGER NOT NULL DEFAULT 0,
    "paymentStartedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "processingAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FamilyTopUp_idempotencyKey_key" ON "FamilyTopUp"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FamilyTopUp_familyId_createdAt_idx" ON "FamilyTopUp"("familyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_paypalOrderId_key" ON "Purchase"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_paypalCaptureId_key" ON "Purchase"("paypalCaptureId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_idempotencyKey_key" ON "Purchase"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Purchase_familyId_status_createdAt_idx" ON "Purchase"("familyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_childId_paidAt_idx" ON "Purchase"("childId", "paidAt");

-- AddForeignKey
ALTER TABLE "FamilyTopUp" ADD CONSTRAINT "FamilyTopUp_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


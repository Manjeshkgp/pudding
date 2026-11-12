BEGIN;
-- CreateTable
CREATE TABLE "FamilySubscription" (
    "familyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "paypalPlanId" TEXT NOT NULL,
    "paypalSubscriptionId" TEXT,
    "approvalUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPROVAL_PENDING',
    "nextBillingAt" TIMESTAMP(3),
    "failedPaymentsCount" INTEGER NOT NULL DEFAULT 0,
    "providerUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilySubscription_pkey" PRIMARY KEY ("familyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FamilySubscription_requestId_key" ON "FamilySubscription"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilySubscription_paypalSubscriptionId_key" ON "FamilySubscription"("paypalSubscriptionId");

-- AddForeignKey
ALTER TABLE "FamilySubscription" ADD CONSTRAINT "FamilySubscription_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingChildrenConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ParentSignupDraft" ADD COLUMN     "notificationsCompletedAt" TIMESTAMP(3);


-- Preserve completed demo accounts; future PayPal disconnects do not restart onboarding.
UPDATE "User" SET "onboardingCompletedAt" = COALESCE("paypalLinkedAt", "createdAt"),
  "onboardingChildrenConfirmedAt" = COALESCE("paypalLinkedAt", "createdAt")
WHERE "role" = 'CO_PARENT' OR ("paypalVaultId" IS NOT NULL AND "pinHash" IS NOT NULL);
-- Existing drafts with saved questions have already passed the old notifications screen.
UPDATE "ParentSignupDraft" SET "notificationsCompletedAt" = "createdAt"
WHERE "securityQuestions" IS NOT NULL AND jsonb_typeof("securityQuestions") = 'array' AND jsonb_array_length("securityQuestions") > 0;

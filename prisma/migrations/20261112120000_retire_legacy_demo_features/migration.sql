BEGIN;

-- Preserve historical payments and disputes in databases that used the old flow.
LOCK TABLE "SpendingRequest", "Donation", "Dispute", "Wallet" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "SpendingRequest")
        OR EXISTS (SELECT 1 FROM "Donation")
        OR EXISTS (SELECT 1 FROM "Dispute")
        OR EXISTS (SELECT 1 FROM "Wallet" WHERE "lockedPendingBalance" <> 0)
    THEN
        RAISE EXCEPTION 'Archive and reconcile legacy payment, donation, and dispute records before retiring their tables.';
    END IF;
END $$;

-- DropForeignKey
ALTER TABLE "SpendingRequest" DROP CONSTRAINT "SpendingRequest_familyId_fkey";

-- DropForeignKey
ALTER TABLE "SpendingRequest" DROP CONSTRAINT "SpendingRequest_childId_fkey";

-- DropForeignKey
ALTER TABLE "SpendingRequest" DROP CONSTRAINT "SpendingRequest_reviewedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Donation" DROP CONSTRAINT "Donation_familyId_fkey";

-- DropForeignKey
ALTER TABLE "Donation" DROP CONSTRAINT "Donation_childId_fkey";

-- DropForeignKey
ALTER TABLE "Donation" DROP CONSTRAINT "Donation_charityId_fkey";

-- DropForeignKey
ALTER TABLE "LessonProgress" DROP CONSTRAINT "LessonProgress_childId_fkey";

-- DropForeignKey
ALTER TABLE "LessonProgress" DROP CONSTRAINT "LessonProgress_lessonId_fkey";

-- DropForeignKey
ALTER TABLE "ChildBadge" DROP CONSTRAINT "ChildBadge_childId_fkey";

-- DropForeignKey
ALTER TABLE "ChildBadge" DROP CONSTRAINT "ChildBadge_badgeId_fkey";

-- DropForeignKey
ALTER TABLE "Dispute" DROP CONSTRAINT "Dispute_familyId_fkey";

-- DropForeignKey
ALTER TABLE "Dispute" DROP CONSTRAINT "Dispute_parentId_fkey";

-- DropIndex
DROP INDEX "Family_familyCode_idx";

-- DropIndex
DROP INDEX "User_email_idx";

-- DropIndex
DROP INDEX "CoParentInvite_inviteToken_idx";

-- AlterTable
ALTER TABLE "Family" DROP COLUMN "autoTopUpAmount",
DROP COLUMN "autoTopUpSchedule",
DROP COLUMN "autoTopUpThreshold";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "mfaSecret";

-- AlterTable
ALTER TABLE "Wallet" DROP COLUMN "lockedPendingBalance";

-- AlterTable
ALTER TABLE "SpendingRule" DROP COLUMN "autoApproveCategories",
DROP COLUMN "autoApproveUnderAmount",
DROP COLUMN "requireApprovalCategories",
DROP COLUMN "safeListMerchants";

-- AlterTable
ALTER TABLE "SupportTicket" DROP COLUMN "resolvedByAdminId";

-- DropTable
DROP TABLE "SpendingRequest";

-- DropTable
DROP TABLE "Charity";

-- DropTable
DROP TABLE "Donation";

-- DropTable
DROP TABLE "Lesson";

-- DropTable
DROP TABLE "LessonProgress";

-- DropTable
DROP TABLE "Badge";

-- DropTable
DROP TABLE "ChildBadge";

-- DropTable
DROP TABLE "Dispute";

-- DropTable
DROP TABLE "SystemConfig";

-- DropEnum
DROP TYPE "SpendingOptionType";

-- DropEnum
DROP TYPE "SpendingRequestStatus";

-- DropEnum
DROP TYPE "DonationStatus";

-- DropEnum
DROP TYPE "LessonTopic";

-- DropEnum
DROP TYPE "AgeGroup";

-- DropEnum
DROP TYPE "DisputeStatus";

COMMIT;

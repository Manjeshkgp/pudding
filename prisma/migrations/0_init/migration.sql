BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PRIMARY_PARENT', 'CO_PARENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "CoParentPermissionLevel" AS ENUM ('EQUAL', 'LIMITED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WalletBucket" AS ENUM ('SPEND', 'SAVE', 'GIVE', 'FAMILY_BUDGET');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('BUDGET_ADD', 'BUDGET_ADJUST', 'INSTANT_TRANSFER', 'BUCKET_TRANSFER', 'ALLOWANCE', 'CHORE_REWARD', 'CHORE_STREAK_BONUS', 'GOAL_DEPOSIT', 'GOAL_WITHDRAWAL', 'GOAL_MATCH', 'SAVINGS_INTEREST', 'SPEND_OPTION_A_PAYPAL', 'SPEND_OPTION_B_ORDER', 'DONATION', 'LESSON_REWARD', 'REVERSAL', 'DISPUTE_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('COMPLETED', 'PENDING_CLAIM', 'REVERSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AllowanceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM_DAY');

-- CreateEnum
CREATE TYPE "AllowanceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChoreRecurrence" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SpendingOptionType" AS ENUM ('OPTION_A_PAYPAL_EMAIL', 'OPTION_B_PRODUCT_ORDER');

-- CreateEnum
CREATE TYPE "SpendingRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'COUNTER_OFFERED', 'PAID_COMPLETED', 'PAID_PENDING_CLAIM', 'PAYMENT_FAILED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED_COMPLETED', 'PAID_PENDING_CLAIM', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "LessonTopic" AS ENUM ('SAVING', 'NEEDS_VS_WANTS', 'BUDGETING', 'INTEREST', 'SCAMS');

-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('AGE_6_9', 'AGE_10_13', 'AGE_14_17');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('WEB_VAPID', 'MOBILE_FCM', 'MOBILE_APNS');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUNDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WebhookProcessStatus" AS ENUM ('PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('EMAIL_VERIFY', 'PHONE_VERIFY', 'MFA_CHALLENGE', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "familyCode" TEXT NOT NULL,
    "unallocatedBudget" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "spendingLimit" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "spentTotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "reservedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "autoTopUpAmount" DECIMAL(12,2),
    "autoTopUpThreshold" DECIMAL(12,2),
    "autoTopUpSchedule" TEXT,
    "siblingLeaderboardEnabled" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "familyId" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT,
    "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatar" TEXT NOT NULL DEFAULT 'avatar-1',
    "role" "UserRole" NOT NULL DEFAULT 'PRIMARY_PARENT',
    "permissionLevel" "CoParentPermissionLevel" NOT NULL DEFAULT 'EQUAL',
    "permissions" JSONB,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isKycSimulatedVerified" BOOLEAN NOT NULL DEFAULT false,
    "paypalPayerId" TEXT,
    "paypalVerifiedEmail" TEXT,
    "paypalIsVerified" BOOLEAN NOT NULL DEFAULT false,
    "paypalLinkedAt" TIMESTAMP(3),
    "paypalCustomerId" TEXT,
    "paypalVaultId" TEXT,
    "paypalSetupTokenId" TEXT,
    "onboardingChildrenConfirmedAt" TIMESTAMP(3),
    "onboardingCompletedAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoParentInvite" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "permissionLevel" "CoParentPermissionLevel" NOT NULL DEFAULT 'EQUAL',
    "permissions" JSONB,
    "inviteToken" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoParentInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "age" INTEGER NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT 'default-kid',
    "theme" TEXT NOT NULL DEFAULT 'ocean',
    "pinHash" TEXT,
    "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT DEFAULT '21:00',
    "quietHoursEnd" TEXT DEFAULT '07:00',
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "lastChoreCompletedAt" TIMESTAMP(3),
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "spendBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "saveBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "lockedPendingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "purchaseReservedBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "defaultSplitSpend" INTEGER NOT NULL DEFAULT 70,
    "defaultSplitSave" INTEGER NOT NULL DEFAULT 30,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childId" TEXT,
    "walletBucket" "WalletBucket" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "status" "LedgerStatus" NOT NULL DEFAULT 'COMPLETED',
    "idempotencyKey" TEXT NOT NULL,
    "referenceId" TEXT,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "actorUserId" TEXT,
    "actorChildId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL DEFAULT '1.0',
    "consentText" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowanceRule" (
    "id" TEXT NOT NULL,
    "creationKey" TEXT,
    "childId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "AllowanceFrequency" NOT NULL DEFAULT 'WEEKLY',
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "requireAllChores" BOOLEAN NOT NULL DEFAULT false,
    "reduceByMissedChores" BOOLEAN NOT NULL DEFAULT false,
    "status" "AllowanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "anchorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowanceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chore" (
    "id" TEXT NOT NULL,
    "familyId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rewardAmount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "recurrence" "ChoreRecurrence" NOT NULL DEFAULT 'ONCE',
    "assigneeIds" TEXT[],
    "ageGroupTag" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreSubmission" (
    "id" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "proofPhotoUrl" TEXT,
    "beforeEvidenceId" TEXT,
    "afterEvidenceId" TEXT,
    "aiStatus" TEXT NOT NULL DEFAULT 'NOT_REVIEWED',
    "approvalSource" TEXT,
    "aiVerdict" TEXT,
    "aiReason" TEXT,
    "aiReviewedAt" TIMESTAMP(3),
    "aiReviewStartedAt" TIMESTAMP(3),
    "childNote" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "parentComment" TEXT,
    "reviewedByUserId" TEXT,
    "rewardAmountPaid" DECIMAL(12,2),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ChoreSubmission_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(12,2) NOT NULL,
    "currentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "imageUrl" TEXT,
    "deadline" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "unlockApprovedByParent" BOOLEAN NOT NULL DEFAULT false,
    "matchPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "matchMaxAmount" DECIMAL(12,2),
    "matchedTotalSoFar" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "interestRateApr" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "lastInterestAppliedAt" TIMESTAMP(3),
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendingRequest" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "optionType" "SpendingOptionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT NOT NULL,
    "merchantName" TEXT,
    "purpose" TEXT NOT NULL,
    "recipientPaypalEmail" TEXT,
    "productName" TEXT,
    "productUrl" TEXT,
    "productPhotoUrl" TEXT,
    "status" "SpendingRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "counterOfferAmount" DECIMAL(12,2),
    "parentComment" TEXT,
    "reviewedByUserId" TEXT,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendingRule" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "maxPerTransaction" DECIMAL(12,2),
    "dailyLimit" DECIMAL(12,2),
    "weeklyLimit" DECIMAL(12,2),
    "monthlyLimit" DECIMAL(12,2),
    "inStoreEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onlineEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ageBlockEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveUnderAmount" DECIMAL(12,2),
    "autoApproveCategories" TEXT[],
    "safeListMerchants" TEXT[],
    "requireApprovalCategories" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendingRule_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Charity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "logoUrl" TEXT,
    "paypalEmail" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "charityId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "receiptNumber" TEXT,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "topic" "LessonTopic" NOT NULL,
    "ageGroup" "AgeGroup" NOT NULL,
    "summary" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "quizQuestions" JSONB NOT NULL,
    "xpReward" INTEGER NOT NULL DEFAULT 50,
    "defaultMoneyReward" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "badgeCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "rewardPaid" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "xpBonus" INTEGER NOT NULL DEFAULT 25,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildBadge" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "familyId" TEXT,
    "userId" TEXT,
    "childId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "childId" TEXT,
    "platform" "PushPlatform" NOT NULL DEFAULT 'WEB_VAPID',
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT,
    "auth" TEXT,
    "deviceToken" TEXT,
    "deviceName" TEXT,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSecurityQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSecurityQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentSignupDraft" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "securityQuestions" JSONB,
    "notificationsCompletedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentSignupDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyEveryTransaction" BOOLEAN NOT NULL DEFAULT true,
    "notifyThresholdAmount" DECIMAL(12,2),
    "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "adminResponse" TEXT,
    "resolvedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "ledgerEntryId" TEXT,
    "spendingRequestId" TEXT,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "familyId" TEXT,
    "actorUserId" TEXT,
    "actorChildId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookProcessStatus" NOT NULL DEFAULT 'PROCESSED',
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Family_familyCode_key" ON "Family"("familyCode");

-- CreateIndex
CREATE INDEX "Family_familyCode_idx" ON "Family"("familyCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_familyId_idx" ON "User"("familyId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_paypalSetupTokenId_idx" ON "User"("paypalSetupTokenId");

-- CreateIndex
CREATE INDEX "User_paypalPayerId_idx" ON "User"("paypalPayerId");

-- CreateIndex
CREATE UNIQUE INDEX "CoParentInvite_inviteToken_key" ON "CoParentInvite"("inviteToken");

-- CreateIndex
CREATE INDEX "CoParentInvite_familyId_idx" ON "CoParentInvite"("familyId");

-- CreateIndex
CREATE INDEX "CoParentInvite_email_idx" ON "CoParentInvite"("email");

-- CreateIndex
CREATE INDEX "CoParentInvite_inviteToken_idx" ON "CoParentInvite"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "Child_username_key" ON "Child"("username");

-- CreateIndex
CREATE INDEX "Child_familyId_idx" ON "Child"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_childId_key" ON "Wallet"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_familyId_createdAt_idx" ON "LedgerEntry"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_childId_createdAt_idx" ON "LedgerEntry"("childId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_paypalOrderId_idx" ON "LedgerEntry"("paypalOrderId");

-- CreateIndex
CREATE INDEX "LedgerEntry_paypalCaptureId_idx" ON "LedgerEntry"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "LedgerEntry_type_status_idx" ON "LedgerEntry"("type", "status");

-- CreateIndex
CREATE INDEX "ConsentRecord_childId_idx" ON "ConsentRecord"("childId");

-- CreateIndex
CREATE INDEX "ConsentRecord_parentId_idx" ON "ConsentRecord"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "AllowanceRule_creationKey_key" ON "AllowanceRule"("creationKey");

-- CreateIndex
CREATE INDEX "AllowanceRule_childId_idx" ON "AllowanceRule"("childId");

-- CreateIndex
CREATE INDEX "AllowanceRule_status_nextRunAt_idx" ON "AllowanceRule"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "Chore_familyId_idx" ON "Chore"("familyId");

-- CreateIndex
CREATE INDEX "Chore_isTemplate_idx" ON "Chore"("isTemplate");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreSubmission_beforeEvidenceId_key" ON "ChoreSubmission"("beforeEvidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreSubmission_afterEvidenceId_key" ON "ChoreSubmission"("afterEvidenceId");

-- CreateIndex
CREATE INDEX "ChoreSubmission_choreId_idx" ON "ChoreSubmission"("choreId");

-- CreateIndex
CREATE INDEX "ChoreSubmission_childId_status_idx" ON "ChoreSubmission"("childId", "status");

-- CreateIndex
CREATE INDEX "ChoreEvidence_choreId_childId_createdAt_idx" ON "ChoreEvidence"("choreId", "childId", "createdAt");

-- CreateIndex
CREATE INDEX "SavingsGoal_childId_status_idx" ON "SavingsGoal"("childId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SpendingRequest_paypalOrderId_key" ON "SpendingRequest"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SpendingRequest_paypalCaptureId_key" ON "SpendingRequest"("paypalCaptureId");

-- CreateIndex
CREATE UNIQUE INDEX "SpendingRequest_idempotencyKey_key" ON "SpendingRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SpendingRequest_familyId_status_idx" ON "SpendingRequest"("familyId", "status");

-- CreateIndex
CREATE INDEX "SpendingRequest_childId_status_idx" ON "SpendingRequest"("childId", "status");

-- CreateIndex
CREATE INDEX "SpendingRequest_paypalOrderId_idx" ON "SpendingRequest"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SpendingRule_childId_key" ON "SpendingRule"("childId");

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

-- CreateIndex
CREATE UNIQUE INDEX "Donation_receiptNumber_key" ON "Donation"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_paypalOrderId_key" ON "Donation"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_paypalCaptureId_key" ON "Donation"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "Donation_childId_createdAt_idx" ON "Donation"("childId", "createdAt");

-- CreateIndex
CREATE INDEX "Donation_familyId_idx" ON "Donation"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_slug_key" ON "Lesson"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_childId_lessonId_key" ON "LessonProgress"("childId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_code_key" ON "Badge"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ChildBadge_childId_badgeId_key" ON "ChildBadge"("childId", "badgeId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_childId_isRead_idx" ON "Notification"("childId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_platform_isActive_idx" ON "PushSubscription"("userId", "platform", "isActive");

-- CreateIndex
CREATE INDEX "PushSubscription_childId_platform_isActive_idx" ON "PushSubscription"("childId", "platform", "isActive");

-- CreateIndex
CREATE INDEX "UserSecurityQuestion_userId_idx" ON "UserSecurityQuestion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSecurityQuestion_userId_questionKey_key" ON "UserSecurityQuestion"("userId", "questionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ParentSignupDraft_email_key" ON "ParentSignupDraft"("email");

-- CreateIndex
CREATE INDEX "ParentSignupDraft_expiresAt_idx" ON "ParentSignupDraft"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_familyId_idx" ON "SupportTicket"("familyId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE INDEX "Dispute_familyId_idx" ON "Dispute"("familyId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "AuditLog_familyId_createdAt_idx" ON "AuditLog"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_purpose_idx" ON "VerificationToken"("userId", "purpose");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoParentInvite" ADD CONSTRAINT "CoParentInvite_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoParentInvite" ADD CONSTRAINT "CoParentInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowanceRule" ADD CONSTRAINT "AllowanceRule_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSubmission" ADD CONSTRAINT "ChoreSubmission_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSubmission" ADD CONSTRAINT "ChoreSubmission_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSubmission" ADD CONSTRAINT "ChoreSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSubmission" ADD CONSTRAINT "ChoreSubmission_beforeEvidenceId_fkey" FOREIGN KEY ("beforeEvidenceId") REFERENCES "ChoreEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSubmission" ADD CONSTRAINT "ChoreSubmission_afterEvidenceId_fkey" FOREIGN KEY ("afterEvidenceId") REFERENCES "ChoreEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreEvidence" ADD CONSTRAINT "ChoreEvidence_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreEvidence" ADD CONSTRAINT "ChoreEvidence_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendingRequest" ADD CONSTRAINT "SpendingRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendingRequest" ADD CONSTRAINT "SpendingRequest_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendingRequest" ADD CONSTRAINT "SpendingRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendingRule" ADD CONSTRAINT "SpendingRule_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyTopUp" ADD CONSTRAINT "FamilyTopUp_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_charityId_fkey" FOREIGN KEY ("charityId") REFERENCES "Charity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildBadge" ADD CONSTRAINT "ChildBadge_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildBadge" ADD CONSTRAINT "ChildBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSecurityQuestion" ADD CONSTRAINT "UserSecurityQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorChildId_fkey" FOREIGN KEY ("actorChildId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

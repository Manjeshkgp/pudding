import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const createChildSchema = z
  .object({
    name: z.string().trim().min(1, "Child name is required").max(80),
    age: z
      .number()
      .int()
      .min(6, "Child must be at least 6 years old (FR-1.5)")
      .max(17, "Child must be 17 or younger (FR-1.5)"),
    avatar: z.string().trim().max(100).default("default-kid"),
    theme: z.string().trim().max(50).default("ocean"),
    pin: z
      .string()
      .regex(/^[0-9]{4,6}$/, "Child PIN must be 4 to 6 digits (FR-1.5)"),
    defaultSplitSpend: z.number().int().min(0).max(100).default(70),
    defaultSplitSave: z.number().int().min(0).max(100).default(20),
    defaultSplitGive: z.number().int().min(0).max(100).default(10),
    quietHoursStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .optional()
      .default("21:00"),
    quietHoursEnd: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .optional()
      .default("07:00"),
    consentAccepted: z.literal(true, {
      errorMap: () => ({
        message:
          "Verifiable parental consent is required to create a child profile (FR-1.6)",
      }),
    }),
    consentVersion: z.string().trim().default("1.0"),
    consentText: z
      .string()
      .trim()
      .default(
        "I confirm I am the parent or legal guardian of this child and consent to the creation of their supervised GoodSpend profile under the Privacy Policy and COPPA/GDPR-K terms."
      ),
  })
  .refine(
    (data) =>
      data.defaultSplitSpend + data.defaultSplitSave + data.defaultSplitGive ===
      100,
    {
      message:
        "Spend, Save, and Give default split percentages must add up to 100%",
      path: ["defaultSplitSpend"],
    }
  );

/**
 * GET /api/children
 * Lists all child profiles in the authenticated parent's family with wallet & consent status.
 */
export async function GET(req: NextRequest) {
  try {
    const { family } = await requireParent(req);

    const children = await prisma.child.findMany({
      where: { familyId: family.id },
      include: {
        wallet: true,
        spendingRule: true,
        allowanceRules: {
          where: { status: { not: "CANCELLED" } },
        },
        consentRecords: {
          orderBy: { grantedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return apiSuccess({
      familyCode: family.familyCode,
      children: children.map((child) => ({
        id: child.id,
        name: child.name,
        age: child.age,
        avatar: child.avatar,
        theme: child.theme,
        isFrozen: child.isFrozen,
        pinLockedUntil: child.pinLockedUntil,
        quietHoursStart: child.quietHoursStart,
        quietHoursEnd: child.quietHoursEnd,
        streakCount: child.streakCount,
        level: child.level,
        xp: child.xp,
        createdAt: child.createdAt,
        wallet: child.wallet
          ? {
              id: child.wallet.id,
              spendBalance: child.wallet.spendBalance.toString(),
              saveBalance: child.wallet.saveBalance.toString(),
              giveBalance: child.wallet.giveBalance.toString(),
              lockedPendingBalance:
                child.wallet.lockedPendingBalance.toString(),
              defaultSplitSpend: child.wallet.defaultSplitSpend,
              defaultSplitSave: child.wallet.defaultSplitSave,
              defaultSplitGive: child.wallet.defaultSplitGive,
              isFrozen: child.wallet.isFrozen,
            }
          : null,
        spendingRule: child.spendingRule,
        allowanceRules: child.allowanceRules,
        latestConsent: child.consentRecords[0] ?? null,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/children
 * Creates a new child profile, initializes their Spend/Save/Give Wallet, default SpendingRule,
 * and stores a timestamped Parental ConsentRecord (FR-1.5, FR-1.6, FR-3.1).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req, "canManageChildren");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, createChildSchema);

    const existingChildWithName = await prisma.child.findFirst({
      where: {
        familyId: family.id,
        name: { equals: input.name, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (existingChildWithName) {
      throw new ApiError(
        409,
        `A child named "${input.name}" already exists in your family`,
        "DUPLICATE_CHILD_NAME"
      );
    }

    const pinHash = await bcrypt.hash(input.pin, 10);

    const created = await prisma.$transaction(async (tx) => {
      const child = await tx.child.create({
        data: {
          familyId: family.id,
          name: input.name,
          age: input.age,
          avatar: input.avatar,
          theme: input.theme,
          pinHash,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
        },
      });

      const wallet = await tx.wallet.create({
        data: {
          childId: child.id,
          spendBalance: 0,
          saveBalance: 0,
          giveBalance: 0,
          lockedPendingBalance: 0,
          defaultSplitSpend: input.defaultSplitSpend,
          defaultSplitSave: input.defaultSplitSave,
          defaultSplitGive: input.defaultSplitGive,
        },
      });

      const spendingRule = await tx.spendingRule.create({
        data: {
          childId: child.id,
          autoApproveCategories: [],
          safeListMerchants: [],
          requireApprovalCategories: [],
        },
      });

      const consentRecord = await tx.consentRecord.create({
        data: {
          parentId: user.id,
          childId: child.id,
          consentVersion: input.consentVersion,
          consentText: input.consentText,
          ipAddress,
          userAgent,
          status: "GRANTED",
        },
      });

      await writeAuditLog(
        {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "CHILD_PROFILE_CREATED",
          targetType: "Child",
          targetId: child.id,
          details: {
            childName: child.name,
            age: child.age,
            consentId: consentRecord.id,
            consentVersion: consentRecord.consentVersion,
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      return { child, wallet, spendingRule, consentRecord };
    });

    return apiSuccess(
      {
        child: {
          id: created.child.id,
          name: created.child.name,
          age: created.child.age,
          avatar: created.child.avatar,
          theme: created.child.theme,
          quietHoursStart: created.child.quietHoursStart,
          quietHoursEnd: created.child.quietHoursEnd,
          familyCode: family.familyCode,
        },
        wallet: {
          id: created.wallet.id,
          spendBalance: created.wallet.spendBalance.toString(),
          saveBalance: created.wallet.saveBalance.toString(),
          giveBalance: created.wallet.giveBalance.toString(),
          defaultSplitSpend: created.wallet.defaultSplitSpend,
          defaultSplitSave: created.wallet.defaultSplitSave,
          defaultSplitGive: created.wallet.defaultSplitGive,
        },
        consent: created.consentRecord,
      },
      201,
      "Child profile created with verifiable parental consent"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

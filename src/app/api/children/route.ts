import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";
import { refreshSessionNavigation } from "@/lib/refresh-navigation";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
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
import {
  calculateChildAge,
  childPinSchema,
  findAvailableChildUsername,
  parseChildBirthDate,
} from "@/lib/child-credentials";

const createChildSchema = z
  .object({
    firstName: z.string().trim().min(1).max(40),
    lastName: z.string().trim().min(1).max(40),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must use YYYY-MM-DD")
      .refine(
        (value) => parseChildBirthDate(value) !== null,
        "Enter a valid date of birth",
      ),
    avatar: z.string().trim().max(100).default("default-kid"),
    theme: z.string().trim().max(50).default("ocean"),
    pin: childPinSchema.optional(),
    defaultSplitSpend: z.number().int().min(0).max(100).default(70),
    defaultSplitSave: z.number().int().min(0).max(100).default(30),

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
        "I confirm I am the parent or legal guardian of this child and consent to the creation of their supervised Pudding profile under the Privacy Policy and COPPA/GDPR-K terms.",
      ),
  })
  .superRefine((data, ctx) => {
    const birthDate = parseChildBirthDate(data.dateOfBirth);
    if (birthDate) {
      const age = calculateChildAge(birthDate);
      if (age < 6 || age > 18) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateOfBirth"],
          message: "Child must be 6 to 18 years old",
        });
      }
    }
  })
  .refine((data) => data.defaultSplitSpend + data.defaultSplitSave === 100, {
    message: "Spend and Save default split percentages must add up to 100%",
    path: ["defaultSplitSpend"],
  });

/**
 * GET /api/children
 * Lists all child profiles in the authenticated parent's family with wallet & consent status.
 */
export async function GET(req: NextRequest) {
  try {
    const { family } = await requireParent(req);

    const paged = req.nextUrl.searchParams.get("view") === "feed";
    const children = await prisma.child.findMany({
      where: {
        familyId: family.id,
        ...(paged
          ? olderThan("createdAt", pageCursor(req.nextUrl.searchParams))
          : {}),
      },
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
      orderBy: paged
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : { createdAt: "asc" },
      ...(paged ? { take: pageSize + 1 } : {}),
    });

    const page = paged
      ? takePage(children, "createdAt")
      : { items: children, nextCursor: null };
    const items = page.items.map((child) => ({
      id: child.id,
      name: child.name,
      firstName: child.firstName,
      lastName: child.lastName,
      username: child.username,
      dateOfBirth: child.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      age: child.age,
      pinSet: Boolean(child.pinHash),
      canLogin: Boolean(child.pinHash),
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

            lockedPendingBalance: child.wallet.lockedPendingBalance.toString(),
            defaultSplitSpend: child.wallet.defaultSplitSpend,
            defaultSplitSave: child.wallet.defaultSplitSave,

            isFrozen: child.wallet.isFrozen,
          }
        : null,
      spendingRule: child.spendingRule,
      allowanceRules: child.allowanceRules,
      latestConsent: child.consentRecords[0] ?? null,
    }));
    return apiSuccess({
      children: items,
      ...(paged ? { items, nextCursor: page.nextCursor } : {}),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/children
 * Creates a new child profile, initializes their Spend and Save Wallet, default SpendingRule,
 * and stores a timestamped Parental ConsentRecord (FR-1.5, FR-1.6, FR-3.1).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req, "canManageChildren");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, createChildSchema);
    const name = `${input.firstName} ${input.lastName}`;

    if (input.pin && !user.paypalIsVerified) {
      throw new ApiError(
        403,
        "Connect and verify PayPal before setting a child's PIN",
        "PAYPAL_VERIFICATION_REQUIRED",
      );
    }

    const dateOfBirth = parseChildBirthDate(input.dateOfBirth)!;
    const age = calculateChildAge(dateOfBirth);
    const pinHash = input.pin ? await bcrypt.hash(input.pin, 10) : null;
    const usernameFor = async () =>
      await findAvailableChildUsername(name, dateOfBirth, async (candidate) =>
        Boolean(
          await prisma.child.findUnique({
            where: { username: candidate },
            select: { id: true },
          }),
        ),
      );

    const createChild = (username: string) =>
      prisma.$transaction(async (tx) => {
        const child = await tx.child.create({
          data: {
            familyId: family.id,
            name,
            firstName: input.firstName,
            lastName: input.lastName,
            username,
            dateOfBirth,
            age,
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

            lockedPendingBalance: 0,
            defaultSplitSpend: input.defaultSplitSpend,
            defaultSplitSave: input.defaultSplitSave,
          },
        });

        const spendingRule = await tx.spendingRule.create({
          data: {
            childId: child.id,
            dailyLimit: Number(process.env.DEMO_DEFAULT_DAILY_LIMIT_USD || 20),
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
              username: child.username,
              dateOfBirth:
                child.dateOfBirth?.toISOString().slice(0, 10) ?? null,
              age: child.age,
              pinSet: Boolean(child.pinHash),
              canLogin: Boolean(child.pinHash),
              consentId: consentRecord.id,
              consentVersion: consentRecord.consentVersion,
            },
            ipAddress,
            userAgent,
          },
          tx,
        );

        return { child, wallet, spendingRule, consentRecord };
      });

    let created: Awaited<ReturnType<typeof createChild>> | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        created = await createChild(await usernameFor());
        break;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          throw error;
        }
      }
    }
    if (!created) {
      throw new ApiError(
        409,
        "Unable to generate a unique child login name. Please try again.",
        "USERNAME_GENERATION_FAILED",
      );
    }

    const response = apiSuccess(
      {
        child: {
          id: created.child.id,
          name: created.child.name,
          firstName: created.child.firstName,
          lastName: created.child.lastName,
          username: created.child.username,
          dateOfBirth:
            created.child.dateOfBirth?.toISOString().slice(0, 10) ?? null,
          age: created.child.age,
          pinSet: Boolean(created.child.pinHash),
          canLogin: Boolean(created.child.pinHash),
          avatar: created.child.avatar,
          theme: created.child.theme,
          quietHoursStart: created.child.quietHoursStart,
          quietHoursEnd: created.child.quietHoursEnd,
        },
        wallet: {
          id: created.wallet.id,
          spendBalance: created.wallet.spendBalance.toString(),
          saveBalance: created.wallet.saveBalance.toString(),

          defaultSplitSpend: created.wallet.defaultSplitSpend,
          defaultSplitSave: created.wallet.defaultSplitSave,
        },
        consent: created.consentRecord,
      },
      201,
      "Child profile created with verifiable parental consent",
    );
    await refreshSessionNavigation(req, response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}

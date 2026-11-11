import { completeOnboardingIfReady } from "@/lib/onboarding";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";

/** Sandbox identities are intentionally reusable across demo users, including deployed demos. */
export async function linkPayPalIdentity(
  userId: string,
  payerId: string,
  data: Omit<Prisma.UserUpdateInput, "paypalPayerId">,
) {
  const updated = await prisma.$transaction(async (tx) => {
    // Serialize identity updates so concurrent live links cannot bypass ownership checks.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pudding:paypal:${payerId}`}, 0))::text`;
    if (process.env.PAYPAL_ENV !== "sandbox") {
      const owner = await tx.user.findFirst({
        where: { paypalPayerId: payerId, NOT: { id: userId } },
        select: { id: true },
      });
      if (owner)
        throw new ApiError(
          409,
          "This PayPal account is already linked to another Pudding user",
          "PAYPAL_ALREADY_LINKED",
        );
    }
    return tx.user.update({
      where: { id: userId },
      data: { ...data, paypalPayerId: payerId },
    });
  });
  await completeOnboardingIfReady(userId);
  return updated;
}

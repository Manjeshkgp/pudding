import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";

export async function verifyParentPin(userId: string, pin: string) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.pinHash) return "PIN_NOT_SET";
    if (user.pinLockedUntil && user.pinLockedUntil > new Date())
      return "PIN_LOCKED";
    if (!/^\d{6}$/.test(pin) || !(await bcrypt.compare(pin, user.pinHash))) {
      const failures =
        user.pinLockedUntil && user.pinLockedUntil <= new Date()
          ? 1
          : user.failedPinAttempts + 1;
      await tx.user.update({
        where: { id: userId },
        data: {
          failedPinAttempts: failures,
          pinLockedUntil: failures >= 5 ? new Date(Date.now() + 900000) : null,
        },
      });
      return failures >= 5 ? "PIN_LOCKED" : "INVALID_PIN";
    }
    await tx.user.update({
      where: { id: userId },
      data: { failedPinAttempts: 0, pinLockedUntil: null },
    });
    return null;
  });
  if (result)
    throw new ApiError(
      result === "PIN_LOCKED" ? 423 : 403,
      result === "PIN_NOT_SET"
        ? "Create your parent PIN first."
        : result === "PIN_LOCKED"
          ? "PIN locked for 15 minutes. Reset it using your password in Security."
          : "Incorrect parent PIN.",
      result,
    );
}

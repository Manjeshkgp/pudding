import crypto from "crypto";
import bcrypt from "bcryptjs";
import { VerificationPurpose } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sendOtpEmail } from "@/services/email.service";
import { sendOtpSms } from "@/services/sms.service";

export type VerificationChannel = "EMAIL" | "SMS";

const PURPOSE_LABELS: Record<VerificationPurpose, string> = {
  EMAIL_VERIFY: "Email Verification",
  PHONE_VERIFY: "Phone Verification",
  MFA_CHALLENGE: "Security Verification (MFA)",
  PASSWORD_RESET: "Password Reset",
};

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

export async function issueVerificationOtp(params: {
  userId: string;
  target: string; // email address or phone number
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  recipientName?: string;
  expiresInMinutes?: number;
}) {
  const expiresInMinutes = params.expiresInMinutes ?? 10;
  const normalizedTarget = params.target.trim().toLowerCase();
  const otpCode = generateSixDigitOtp();
  const codeHash = await bcrypt.hash(otpCode, 10);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  // Invalidate any older unconsumed tokens for the same user, target & purpose
  await prisma.verificationToken.updateMany({
    where: {
      userId: params.userId,
      target: normalizedTarget,
      purpose: params.purpose,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  const tokenRecord = await prisma.verificationToken.create({
    data: {
      userId: params.userId,
      target: normalizedTarget,
      purpose: params.purpose,
      codeHash,
      expiresAt,
    },
  });

  const purposeLabel = PURPOSE_LABELS[params.purpose] || "Verification";

  let deliveryResult: {
    delivered: boolean;
    provider: string;
    messageId?: string;
    note?: string;
    error?: string;
  };

  if (params.channel === "EMAIL") {
    deliveryResult = await sendOtpEmail({
      to: normalizedTarget,
      recipientName: params.recipientName,
      otpCode,
      purposeLabel,
      expiresInMinutes,
    });
  } else {
    deliveryResult = await sendOtpSms({
      toPhone: normalizedTarget,
      otpCode,
      purposeLabel,
      expiresInMinutes,
    });
  }

  return {
    verificationId: tokenRecord.id,
    target: normalizedTarget,
    channel: params.channel,
    purpose: params.purpose,
    expiresAt: tokenRecord.expiresAt,
    delivery: deliveryResult,
    // Expose codes only in non-production environments unless explicitly disabled.
    ...(process.env.NODE_ENV !== "production" && process.env.EXPOSE_DEV_OTP !== "false"
      ? { devOtpCode: otpCode }
      : {}),
  };
}

export async function verifyOtpCode(params: {
  target: string;
  purpose: VerificationPurpose;
  code: string;
}): Promise<{
  valid: boolean;
  userId?: string;
  reason?: string;
}> {
  const normalizedTarget = params.target.trim().toLowerCase();

  const tokenRecord = await prisma.verificationToken.findFirst({
    where: {
      target: normalizedTarget,
      purpose: params.purpose,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!tokenRecord) {
    return {
      valid: false,
      reason: "No active verification code found. Please request a new code.",
    };
  }

  if (tokenRecord.expiresAt.getTime() < Date.now()) {
    return {
      valid: false,
      reason: "Verification code has expired. Please request a new code.",
    };
  }

  const isMatch = await bcrypt.compare(
    params.code.trim(),
    tokenRecord.codeHash
  );
  if (!isMatch) {
    return {
      valid: false,
      reason: "Invalid verification code.",
    };
  }

  await prisma.verificationToken.update({
    where: { id: tokenRecord.id },
    data: { consumedAt: new Date() },
  });

  return {
    valid: true,
    userId: tokenRecord.userId,
  };
}

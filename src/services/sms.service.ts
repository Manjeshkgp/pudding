/**
 * Pluggable SMS Provider Adapter
 *
 * Currently defaults to `SMS_PROVIDER="mock"` (no-op / console log) per product roadmap,
 * while maintaining the exact interface needed to plug in Twilio, AWS SNS, or MSG91
 * later without changing any API routes, database models, or verification flows.
 */
import { logger } from "@/lib/logger";

export interface SendSmsPayload {
  toPhone: string;
  message: string;
}

export interface SendSmsResult {
  delivered: boolean;
  provider: "MOCK" | "TWILIO" | "MSG91";
  messageId?: string;
  note?: string;
}

export interface SmsProviderAdapter {
  sendSms(payload: SendSmsPayload): Promise<SendSmsResult>;
}

class MockSmsAdapter implements SmsProviderAdapter {
  async sendSms(payload: SendSmsPayload): Promise<SendSmsResult> {
    logger.info("sms.mock_dispatch", {
      provider: "mock",
      outcome: "not_sent",
      recipientPresent: Boolean(payload.toPhone),
    });
    return {
      delivered: true,
      provider: "MOCK",
      messageId: `mock_sms_${Date.now()}`,
      note: "Mobile SMS OTP is currently in mock mode; integrate Twilio/MSG91 in src/services/sms.service.ts when ready.",
    };
  }
}

function getSmsAdapter(): SmsProviderAdapter {
  // Future providers (e.g., process.env.SMS_PROVIDER === "twilio") can be returned here
  return new MockSmsAdapter();
}

export async function sendSms(payload: SendSmsPayload): Promise<SendSmsResult> {
  const adapter = getSmsAdapter();
  return adapter.sendSms(payload);
}

export async function sendOtpSms(params: {
  toPhone: string;
  otpCode: string;
  purposeLabel: string;
  expiresInMinutes?: number;
}): Promise<SendSmsResult> {
  const expires = params.expiresInMinutes ?? 10;
  return sendSms({
    toPhone: params.toPhone,
    message: `GoodSpend: Your ${params.purposeLabel} verification code is ${params.otpCode}. Valid for ${expires} minutes.`,
  });
}

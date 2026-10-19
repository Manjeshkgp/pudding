import {
  renderOtpEmailHtml,
  renderNotificationEmailHtml,
  renderWeeklyDigestEmailHtml,
} from "@/email/templates";

export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  delivered: boolean;
  provider: "RESEND" | "CONSOLE_FALLBACK";
  messageId?: string;
  error?: string;
}

/**
 * Sends an email via Resend REST API (`https://api.resend.com/emails`).
 * If RESEND_API_KEY is missing or Resend sandbox restricts recipient domain,
 * it gracefully logs the email and returns structured status so flows never crash.
 */
export async function sendEmail(
  payload: SendEmailPayload
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "GoodSpend <noreply@goodspend.manjesh.co.in>";

  if (!apiKey || apiKey === "your-resend-api-key") {
    console.info("[EmailService:CONSOLE_FALLBACK]", {
      to: payload.to,
      subject: payload.subject,
    });
    return {
      delivered: false,
      provider: "CONSOLE_FALLBACK",
      error: "RESEND_API_KEY not configured",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      console.warn("[EmailService:RESEND_WARN]", {
        status: response.status,
        to: payload.to,
        error: data?.message || response.statusText,
      });
      return {
        delivered: false,
        provider: "RESEND",
        error: data?.message || `Resend HTTP ${response.status}`,
      };
    }

    return {
      delivered: true,
      provider: "RESEND",
      messageId: data.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error("[EmailService:ERROR]", message);
    return {
      delivered: false,
      provider: "RESEND",
      error: message,
    };
  }
}

export async function sendOtpEmail(params: {
  to: string;
  recipientName?: string;
  otpCode: string;
  purposeLabel: string;
  expiresInMinutes?: number;
}): Promise<SendEmailResult> {
  const expiresInMinutes = params.expiresInMinutes ?? 10;
  const html = renderOtpEmailHtml({
    recipientName: params.recipientName,
    otpCode: params.otpCode,
    purposeLabel: params.purposeLabel,
    expiresInMinutes,
  });

  return sendEmail({
    to: params.to,
    subject: `${params.otpCode} is your GoodSpend ${params.purposeLabel} code`,
    html,
    text: `Your GoodSpend ${params.purposeLabel} code is ${params.otpCode}. It expires in ${expiresInMinutes} minutes.`,
  });
}

export async function sendAlertEmail(params: {
  to: string;
  recipientName?: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<SendEmailResult> {
  const html = renderNotificationEmailHtml(params);
  return sendEmail({
    to: params.to,
    subject: `GoodSpend: ${params.title}`,
    html,
    text: `${params.title}\n\n${params.body}`,
  });
}

export async function sendWeeklyDigestEmail(params: {
  to: string;
  parentName: string;
  familyName: string;
  weekLabel: string;
  childrenSummaries: Array<{
    childName: string;
    totalEarned: string;
    totalSpent: string;
    totalSaved: string;
    totalDonated: string;
    choresCompleted: number;
    lessonsCompleted: number;
  }>;
}): Promise<SendEmailResult> {
  const html = renderWeeklyDigestEmailHtml(params);
  return sendEmail({
    to: params.to,
    subject: `GoodSpend Weekly Family Digest (${params.weekLabel})`,
    html,
  });
}

/**
 * Pudding Email HTML Templates
 * Built on the Stripo XHTML table layout from src/email/otp.ts so all emails
 * share a consistent structure and can be easily customized later.
 */

export interface BaseEmailLayoutOptions {
  heading: string;
  subtitle: string;
  cardHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  expiryNote?: string;
  footerDisclaimer?: string;
}

export function renderBaseEmailTemplate(
  options: BaseEmailLayoutOptions,
): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const ctaHtml =
    options.ctaLabel && options.ctaUrl
      ? `
                                          <tr>
                                            <td align="center" class="esd-block-button es-p35l es-p35r es-p35b" style="padding: 15px 35px 35px 35px;">
                                              <span class="es-button-border" style="display:inline-block; background:#113f37; border-radius:28px;">
                                                <a href="${options.ctaUrl}" target="_blank" class="es-button" style="display:inline-block; padding:14px 32px; color:#ffffff; font-family:Inter,Arial,sans-serif; font-size:16px; font-weight:600; text-decoration:none;">
                                                  ${options.ctaLabel}
                                                </a>
                                              </span>
                                            </td>
                                          </tr>`
      : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="UTF-8">
    <meta content="width=device-width, initial-scale=1" name="viewport">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta content="telephone=no" name="format-detection">
    <title>${options.heading}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">
  </head>
  <body class="body" style="margin:0; padding:0; background-color:#f6f6f6; font-family:Inter,Arial,sans-serif;">
    <div dir="ltr" class="es-wrapper-color">
      <table width="100%" cellspacing="0" cellpadding="0" class="es-wrapper">
        <tbody>
          <tr>
            <td valign="top" class="esd-email-paddings">
              <table cellspacing="0" cellpadding="0" align="center" class="es-header">
                <tbody>
                  <tr>
                    <td align="center" class="esd-stripe">
                      <table width="600" cellspacing="0" cellpadding="0" bgcolor="#ffffff" align="center" class="es-header-body">
                        <tbody>
                          <tr>
                            <td align="left" style="padding:25px 35px 20px 35px;">
                              <a target="_blank" href="${appUrl}" style="text-decoration:none; color:#113f37; font-size:22px; font-weight:700;">
                                Pudding
                              </a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table align="center" cellspacing="0" cellpadding="0" class="es-content">
                <tbody>
                  <tr>
                    <td bgcolor="transparent" align="center" class="esd-stripe">
                      <table cellspacing="0" bgcolor="#ffffff" align="center" width="600" cellpadding="0" class="es-content-body">
                        <tbody>
                          <tr>
                            <td align="left" style="padding:25px 35px;">
                              <table width="100%" cellspacing="0" cellpadding="0">
                                <tbody>
                                  <tr>
                                    <td width="530" valign="top" align="center">
                                      <table width="100%" cellspacing="0" cellpadding="0">
                                        <tbody>
                                          <tr>
                                            <td align="center" style="padding-bottom:12px;">
                                              <h1 style="margin:0; color:#151515; font-size:26px;">
                                                ${options.heading}
                                              </h1>
                                            </td>
                                          </tr>
                                          <tr>
                                            <td align="center" style="padding-bottom:25px; color:#555555; font-size:15px; line-height:1.5;">
                                              <p style="margin:0;">
                                                ${options.subtitle}
                                              </p>
                                            </td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td width="530" valign="top" align="center">
                                      <table width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="background-color:#ffffff; border-radius:20px; border-collapse:separate; border:1px solid #e8e8e8;">
                                        <tbody>
                                          <tr>
                                            <td style="padding:28px 35px;">
                                              ${options.cardHtml}
                                            </td>
                                          </tr>
                                          ${ctaHtml}
                                        </tbody>
                                      </table>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td align="center" style="padding:20px 35px 35px 35px;">
                              ${
                                options.expiryNote
                                  ? `<p style="margin:0 0 8px 0; font-size:13px; font-weight:600; color:#151515;">${options.expiryNote}</p>`
                                  : ""
                              }
                              <p style="margin:0; font-size:12px; color:#777777; line-height:1.5;">
                                ${
                                  options.footerDisclaimer ||
                                  "You received this email from Pudding Parenting & Kids Fintech."
                                }
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>`;
}

export function renderOtpEmailHtml(params: {
  recipientName?: string;
  otpCode: string;
  purposeLabel: string;
  expiresInMinutes: number;
}): string {
  return renderBaseEmailTemplate({
    heading: params.purposeLabel,
    subtitle: `Hi ${params.recipientName || "there"}, use the verification code below to complete your ${params.purposeLabel.toLowerCase()}.`,
    cardHtml: `
      <div style="text-align:center;">
        <p style="margin:0 0 10px 0; font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:#666666;">Verification Code</p>
        <div style="display:inline-block; padding:16px 32px; background-color:#f4f8f7; border:1px dashed #113f37; border-radius:12px; font-size:32px; font-weight:700; letter-spacing:8px; color:#113f37;">
          ${params.otpCode}
        </div>
      </div>
    `,
    expiryNote: `This code is valid for one use only and expires in ${params.expiresInMinutes} minutes.`,
    footerDisclaimer:
      "If you did not request this verification code, please ignore this email or contact Pudding support.",
  });
}

export function renderNotificationEmailHtml(params: {
  recipientName?: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  return renderBaseEmailTemplate({
    heading: params.title,
    subtitle: `Hi ${params.recipientName || "Parent"}, here is an update from your family account on Pudding.`,
    cardHtml: `
      <div style="font-size:15px; color:#222222; line-height:1.6;">
        ${params.body}
      </div>
    `,
    ctaLabel: params.ctaLabel || "Open Pudding Dashboard",
    ctaUrl:
      params.ctaUrl ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000",
  });
}

export function renderWeeklyDigestEmailHtml(params: {
  parentName: string;
  familyName: string;
  weekLabel: string;
  childrenSummaries: Array<{
    childName: string;
    totalEarned: string;
    totalSpent: string;
    totalSaved: string;
    choresCompleted: number;
    lessonsCompleted: number;
  }>;
}): string {
  const rowsHtml = params.childrenSummaries
    .map(
      (child) => `
      <div style="padding:14px 0; border-bottom:1px solid #efefef;">
        <h3 style="margin:0 0 8px 0; color:#113f37; font-size:17px;">${child.childName}</h3>
        <table width="100%" cellspacing="0" cellpadding="4" style="font-size:14px; color:#333333;">
          <tr>
            <td><strong>Earned:</strong> $${child.totalEarned}</td>
            <td><strong>Spent:</strong> $${child.totalSpent}</td>
          </tr>
          <tr>
            <td colspan="2"><strong>Saved:</strong> $${child.totalSaved}</td>
          </tr>
          <tr>
            <td><strong>Chores Done:</strong> ${child.choresCompleted}</td>
            <td><strong>Lessons Completed:</strong> ${child.lessonsCompleted}</td>
          </tr>
        </table>
      </div>
    `,
    )
    .join("");

  return renderBaseEmailTemplate({
    heading: `Weekly Family Digest (${params.weekLabel})`,
    subtitle: `Hi ${params.parentName}, here is how ${params.familyName} earned, saved, spent, and learned this past week!`,
    cardHtml:
      rowsHtml ||
      `<p style="margin:0; color:#555555;">No child activity recorded this week.</p>`,
    ctaLabel: "View Full Family Dashboard",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/parent/dashboard`,
  });
}

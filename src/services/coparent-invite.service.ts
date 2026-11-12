import type { CoParentInvite } from "@prisma/client";
import { sendEmail } from "@/services/email.service";

export async function deliverCoParentInvite(invite: CoParentInvite) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteAcceptUrl = new URL("/accept-invite", appUrl);
  inviteAcceptUrl.searchParams.set("token", invite.inviteToken);
  const url = inviteAcceptUrl.toString();
  const delivery = await sendEmail({
    to: invite.email,
    subject: "You’re invited to a Pudding family",
    html: `<p>You have been invited to help manage a Pudding family.</p><p><a href="${url.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">Accept invitation</a></p><p>This link expires 24 hours after it was issued.</p>`,
    text: `Join your Pudding family: ${url}\nThis link expires 24 hours after it was issued.`,
  });
  return {
    delivery,
    invite: {
      id: invite.id,
      email: invite.email,
      name: invite.name,
      firstName: invite.firstName,
      lastName: invite.lastName,
      permissionLevel: invite.permissionLevel,
      permissions: invite.permissions,
      inviteToken: invite.inviteToken,
      inviteAcceptUrl: url,
      status: invite.status,
      expiresAt: invite.expiresAt,
    },
  };
}

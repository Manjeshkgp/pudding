const day = 86_400_000;
type Invitation = { createdAt: Date; expiresAt: Date | null; status: string };

export function inviteExpiresAt(createdAt = new Date()) {
  return new Date(createdAt.getTime() + day);
}

export function inviteDeadline(invite: Invitation) {
  // Cap invitations issued under older policies, including links with no expiry.
  const cap = inviteExpiresAt(invite.createdAt);
  return invite.expiresAt && invite.expiresAt < cap ? invite.expiresAt : cap;
}

export function isInviteExpired(invite: Invitation, now = new Date()) {
  return invite.status === "EXPIRED" || inviteDeadline(invite) <= now;
}

export function pendingInviteView<
  T extends Invitation & { inviteToken: string },
>(invite: T, now = new Date()) {
  const expired = isInviteExpired(invite, now);
  return {
    ...invite,
    status: expired ? "EXPIRED" : invite.status,
    expiresAt: inviteDeadline(invite),
    inviteToken: expired ? undefined : invite.inviteToken,
  };
}

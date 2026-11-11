const day = 86_400_000;

export const taskFrequencies = ["ONCE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export const frequencyLabels: Record<(typeof taskFrequencies)[number], string> = {
  ONCE: "Once",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every two weeks",
  MONTHLY: "Monthly",
};

function monthAnniversary(anchor: Date, months: number) {
  const result = new Date(anchor);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(result);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  result.setUTCDate(Math.min(anchor.getUTCDate(), lastDay.getUTCDate()));
  return result;
}

/** Active occurrence, with an inclusive start and exclusive deadline. */
export function chorePeriod(
  recurrence: string,
  createdAt: Date,
  now = new Date(),
): { start: Date; end: Date } | null {
  const duration = recurrence === "DAILY" ? day
    : recurrence === "WEEKLY" ? 7 * day
    : recurrence === "BIWEEKLY" ? 14 * day : 0;
  if (duration) {
    const start = createdAt.getTime() + Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / duration)) * duration;
    return { start: new Date(start), end: new Date(start + duration) };
  }
  if (recurrence !== "MONTHLY") return null;
  let months = Math.max(0, (now.getUTCFullYear() - createdAt.getUTCFullYear()) * 12 + now.getUTCMonth() - createdAt.getUTCMonth());
  if (months > 0 && monthAnniversary(createdAt, months) > now) months--;
  return { start: monthAnniversary(createdAt, months), end: monthAnniversary(createdAt, months + 1) };
}

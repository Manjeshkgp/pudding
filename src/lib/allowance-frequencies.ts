export const scheduledAllowanceFrequencies = ["WEEKLY", "MONTHLY"] as const;

export function isScheduledAllowanceFrequency(frequency: string) {
  return scheduledAllowanceFrequencies.some((allowed) => allowed === frequency);
}

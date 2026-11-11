import type { Prisma } from "@prisma/client";
import { transferFromFamilyToChild } from "@/services/ledger.service";

export function allowanceCycleKey(ruleId: string, dueAt: Date) {
  return `allowance:${ruleId}:${dueAt.toISOString().slice(0, 10)}`;
}

export async function creditScheduledAllowance(
  tx: Prisma.TransactionClient,
  input: {
    ruleId: string;
    familyId: string;
    childId: string;
    childName: string;
    amount: Prisma.Decimal;
    dueAt: Date;
    actorUserId?: string;
  },
) {
  const { ruleId, familyId, childId, childName, amount, dueAt, actorUserId } =
    input;
  const transfer = await transferFromFamilyToChild(
    {
      familyId,
      childId,
      amount,
      actorUserId,
      idempotencyKey: allowanceCycleKey(ruleId, dueAt),
      entryType: "ALLOWANCE",
      targetBucket: "SPEND",
      referenceId: ruleId,
      description: "Scheduled Spend allowance",
      allowAutoTopUp: false,
    },
    tx,
  );
  if (transfer.idempotentReplay) return;
  await tx.notification.createMany({
    data: [
      {
        familyId,
        childId,
        type: "ALLOWANCE_PAID",
        title: "Allowance day!",
        message: `$${amount.toFixed(2)} was added to your Spend wallet.`,
        channel: "IN_APP",
      },
      {
        familyId,
        type: "ALLOWANCE_PAID_PARENT",
        title: `Allowance added for ${childName}`,
        message: `$${amount.toFixed(2)} was added to ${childName}'s Spend wallet from the family budget.`,
        channel: "IN_APP",
      },
    ],
  });
}

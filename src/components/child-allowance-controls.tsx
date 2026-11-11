"use client";
import { useEffect, useRef, useState } from "react";
import {
  Card,
  Field,
  Select,
  Button,
  Status,
  ActionLink,
  useRemote,
  useAction,
} from "@/components/app-ui";
import { Kid, Me, money } from "@/lib/app-types";
import { hasParentPermission } from "@/lib/co-parent-permissions";
import { patchApi, postApi, putApi } from "@/lib/client-api";
import Switch from "@/components/switch";
import { frequencyLabels, taskFrequencies } from "@/lib/chore-period";

type Schedule = {
  id: string;
  amount: string;
  frequency: string;
  status: string;
  nextRunAt: string;
};
type Rule = {
  dailyLimit: string | null;
  weeklyLimit: string | null;
  maxPerTransaction: string | null;
  inStoreEnabled: boolean;
  ageBlockEnabled: boolean;
};
export default function ChildAllowanceControls({
  id,
  user,
}: {
  id: string;
  user: Me["user"];
}) {
  const child = useRemote<Kid>(`/api/children/${id}`);
  const rules = useRemote<{ rule: Rule }>(`/api/spending-rules/${id}`);
  const action = useAction();
  const [daily, setDaily] = useState("20"),
    [weekly, setWeekly] = useState(""),
    [single, setSingle] = useState("");
  const [instore, setInstore] = useState(true),
    [age, setAge] = useState(true),
    [allocation, setAllocation] = useState("");
  const [frequency, setFrequency] =
    useState<(typeof taskFrequencies)[number]>("ONCE");
  const key = useRef<string | null>(null);
  const canControl = hasParentPermission(user, "canManageSpendingRules"),
    canAllocate = hasParentPermission(user, "canManageBudget"),
    canManageChild = hasParentPermission(user, "canManageChildren");
  const canSchedule = hasParentPermission(user, "canManageAllowances");
  const schedules = useRemote<{ allowanceRules: Schedule[] }>(
    canAllocate || canSchedule
      ? `/api/allowances?childId=${encodeURIComponent(id)}`
      : null,
  );
  const selectedFrequency = !canSchedule
    ? "ONCE"
    : !canAllocate && frequency === "ONCE"
      ? "DAILY"
      : frequency;
  useEffect(() => {
    if (rules.data) {
      const r = rules.data.rule;
      setDaily(r.dailyLimit ?? "20");
      setWeekly(r.weeklyLimit ?? "");
      setSingle(r.maxPerTransaction ?? "");
      setInstore(r.inStoreEnabled);
      setAge(r.ageBlockEnabled);
    }
  }, [rules.data]);
  const k = child.data;
  return (
    <>
      <Status
        loading={child.loading}
        error={child.error || rules.error || schedules.error || action.error}
        notice={action.notice}
      />
      {k && (
        <>
          {(canAllocate || canSchedule) && (
            <>
              <Card>
                <h2 className="font-display text-xl font-bold">
                  Allocate spend allowance
                </h2>
                <p>Spend allowance: {money(k.wallet?.spendBalance)}</p>
                <p className="text-sm text-[#5e5e5e]">
                  Your child needs enough Spend allowance to pay, even if AI or
                  a parent approves the purchase. Allocating assigns part of
                  your family budget without moving money through PayPal.
                </p>
                <Field
                  label="Amount (USD)"
                  type="number"
                  min="0.01"
                  max={selectedFrequency === "ONCE" ? "10000" : "5000"}
                  step="0.01"
                  value={allocation}
                  onChange={(e) => {
                    setAllocation(e.target.value);
                    key.current = null;
                  }}
                />
                <Select
                  label="Frequency"
                  value={selectedFrequency}
                  onChange={(value) => {
                    setFrequency(value as (typeof taskFrequencies)[number]);
                    key.current = null;
                  }}
                >
                  {taskFrequencies
                    .filter((value) =>
                      value === "ONCE" ? canAllocate : canSchedule,
                    )
                    .map((value) => (
                      <option key={value} value={value}>
                        {frequencyLabels[value]}
                      </option>
                    ))}
                </Select>
                {selectedFrequency !== "ONCE" && (
                  <p className="text-sm text-[#5e5e5e]">
                    The first amount is added to Spend now. Future additions
                    repeat from today. Saving replaces any existing schedule for
                    this child.
                  </p>
                )}
                <Button
                  busy={action.busy}
                  disabled={
                    !(Number(allocation) > 0) ||
                    Number(allocation) >
                      (selectedFrequency === "ONCE" ? 10000 : 5000)
                  }
                  onClick={() =>
                    void action.run(
                      async () => {
                        if (selectedFrequency !== "ONCE") {
                          key.current ||= crypto.randomUUID();
                          await postApi("/api/allowances", {
                            childId: id,
                            amount: Number(allocation),
                            frequency: selectedFrequency,
                            idempotencyKey: key.current,
                          });
                          setAllocation("");
                          key.current = null;
                          child.reload();
                          schedules.reload();
                          return;
                        }
                        key.current ||= crypto.randomUUID();
                        await postApi(`/api/wallets/${id}/transfer`, {
                          mode: "FAMILY_TO_CHILD",
                          amount: Number(allocation),
                          targetBucket: "SPEND",
                          idempotencyKey: key.current,
                        });
                        setAllocation("");
                        key.current = null;
                        child.reload();
                      },
                      selectedFrequency === "ONCE"
                        ? "Spend allowance allocated."
                        : "First allowance added. Schedule saved.",
                    )
                  }
                >
                  {selectedFrequency === "ONCE"
                    ? "Allocate allowance"
                    : "Save schedule"}
                </Button>
                {schedules.data?.allowanceRules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="flex flex-col gap-2 border-t border-[#e8e8e8] pt-4"
                  >
                    <p className="font-semibold">
                      {money(schedule.amount)} ·{" "}
                      {frequencyLabels[
                        schedule.frequency as keyof typeof frequencyLabels
                      ] || "Monthly"}
                    </p>
                    <p className="text-sm text-[#5e5e5e]">
                      {schedule.status === "PAUSED"
                        ? "Paused"
                        : `Next addition: ${new Date(schedule.nextRunAt).toLocaleString()}`}
                    </p>
                    {canSchedule && (
                      <Button
                        secondary
                        busy={action.busy}
                        onClick={() =>
                          void action.run(async () => {
                            await patchApi(`/api/allowances/${schedule.id}`, {
                              status: "CANCELLED",
                            });
                            schedules.reload();
                          }, "Allowance schedule stopped.")
                        }
                      >
                        Stop schedule
                      </Button>
                    )}
                  </div>
                ))}
                {canAllocate && (
                  <ActionLink href="/topup">
                    Increase shared family limit
                  </ActionLink>
                )}
              </Card>
            </>
          )}
          {canControl && (
            <Card>
              <h2 className="font-display text-xl font-bold">
                Spending controls (optional)
              </h2>
              <p className="text-sm text-[#5e5e5e]">
                You can keep the current settings. These controls decide when a
                purchase needs parent approval; they do not add Spend allowance.
              </p>
              <Field
                label="Daily limit (USD)"
                type="number"
                min="0"
                max="10000"
                step="0.01"
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
              />
              <p className="text-sm text-[#5e5e5e]">
                Set $0 to review every purchase yourself. Purchases within the
                limits go to AI review when it is enabled.
              </p>
              <Field
                label="Weekly limit (optional)"
                type="number"
                min="0.01"
                step="0.01"
                value={weekly}
                onChange={(e) => setWeekly(e.target.value)}
              />
              <Field
                label="Per-purchase limit (optional)"
                type="number"
                min="0.01"
                step="0.01"
                value={single}
                onChange={(e) => setSingle(e.target.value)}
              />
              <div className="flex items-center justify-between gap-3">
                <span>AI review for scanned purchases</span>
                <Switch
                  label="AI review for scanned purchases"
                  on={instore}
                  onChange={setInstore}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>AI age-appropriate review</span>
                <Switch
                  label="AI age-appropriate review"
                  on={age}
                  onChange={setAge}
                />
              </div>
              <Button
                busy={action.busy}
                disabled={rules.loading || daily === ""}
                onClick={() =>
                  void action.run(async () => {
                    await putApi(`/api/spending-rules/${id}`, {
                      dailyLimit: Number(daily),
                      weeklyLimit: weekly ? Number(weekly) : null,
                      maxPerTransaction: single ? Number(single) : null,
                      inStoreEnabled: instore,
                      ageBlockEnabled: age,
                    });
                    rules.reload();
                  }, "Controls saved.")
                }
              >
                Save controls
              </Button>
              {canManageChild && (
                <Button
                  secondary
                  busy={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await postApi(`/api/wallets/${id}/freeze`, {
                        isFrozen: !k.wallet?.isFrozen,
                        freezeChildLoginToo: false,
                      });
                      child.reload();
                    }, "Wallet status updated.")
                  }
                >
                  {k.wallet?.isFrozen ? "Resume spending" : "Pause spending"}
                </Button>
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}

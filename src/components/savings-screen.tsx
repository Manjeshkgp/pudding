"use client";

import {
  ActionLink,
  AppScreen,
  Card,
  Status,
  useRemote,
} from "@/components/app-ui";
import { money, type Me } from "@/lib/app-types";

export function SavingsScreen() {
  const { data, error, loading } = useRemote<Me>("/api/auth/me");

  return (
    <AppScreen title="Your savings" back="/home" role="CHILD">
      <Status error={error} loading={loading} />
      {data?.child && (
        <Card>
          <p>Available savings</p>
          <p className="font-display text-5xl font-bold">
            {money(data.child.wallet?.saveBalance, data.family.currency)}
          </p>
          <p className="text-sm text-[#5e5e5e]">
            30% of your task rewards goes here. You can put savings toward a
            quest or move them to Spending Allowance from the money screen.
          </p>
          <ActionLink href="/quest">Your quests</ActionLink>
          <ActionLink href="/money">Your money</ActionLink>
        </Card>
      )}
    </AppScreen>
  );
}

"use client";
import { AppScreen, Card, ActionLink } from "@/components/app-ui";
export default function PlanScreen() {
  return (
    <AppScreen
      title="Ready for your money adventure?"
      back="/children"
      role="USER"
      color="#ffd7ef"
    >
      <Card>
        <img
          src="/kid-home/coin-stack.svg"
          alt=""
          className="mx-auto size-24"
        />
        <h2 className="font-display text-3xl font-bold">Your Pudding demo</h2>
        <p>
          Connect a PayPal Sandbox wallet, activate your children’s accounts,
          and practice safe spending together.
        </p>
        <p>
          Top-ups increase an internal family limit. They don’t move money into
          Pudding. Approved demo purchases are paid separately through PayPal
          Sandbox.
        </p>
        <ActionLink href="/account/paypal">Connect PayPal</ActionLink>
      </Card>
    </AppScreen>
  );
}

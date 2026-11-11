"use client";
import { ListEnd, usePagedList } from "@/components/paged-list";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { hasParentPermission } from "@/lib/co-parent-permissions";
import { useRouter } from "next/navigation";
import TopupPill from "@/components/topup-pill";
import { useState } from "react";
import {
  AppScreen,
  Card,
  ActionLink,
  Status,
  Empty,
  useRemote,
} from "@/components/app-ui";
import { Kid, money } from "@/lib/app-types";
import { AVATARS } from "@/components/avatar-sheet";
import { topupPath, topupPinSetupPath } from "@/lib/topup-navigation";
type Summary = {
  parent: {
    name: string;
    avatar: string;
    role: string;
    permissionLevel: string;
    permissions?: unknown;
    pinSet: boolean;
    paypalVaultConnected: boolean;
  };
  limit: {
    total: string;
    spent: string;
    reserved: string;
    available: string;
    currency: string;
    unallocated: string;
  };
  pendingPurchases: number;
  unreadNotifications: number;
  pendingChores: number;
};
export default function ParentHome() {
  const router = useRouter();
  const { data, error, loading, reload } = useRemote<Summary>(
    "/api/family/summary?children=omit",
    0,
    true,
  );
  const [selected, setSelected] = useState("");
  const parentAvatar =
    AVATARS[Number(data?.parent.avatar?.replace("avatar-", "")) - 1] ||
    AVATARS[0];
  const children = usePagedList<Kid>("/api/children?view=feed");
  const kids = children.items.filter((k) => !selected || k.id === selected);
  return (
    <AppScreen
      title={data ? `Hello, ${data.parent.name.split(" ")[0]}` : "Your family"}
      back={null}
      role="USER"
      color="#f3f3f3"
      left={
        <Link
          href="/account"
          aria-label="Account"
          className="block size-11 overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
          style={{ backgroundColor: parentAvatar.bg }}
        >
          <img
            src={parentAvatar.src}
            alt=""
            draggable={false}
            className="size-full object-cover"
          />
        </Link>
      }
      right={
        <Link
          href="/inbox"
          aria-label={
            data?.unreadNotifications
              ? `Inbox, ${data.unreadNotifications} unread notifications`
              : "Inbox"
          }
          className="relative flex size-11 items-center justify-center rounded-full bg-[#f3f3f3] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
        >
          <Inbox className="size-6" strokeWidth={1.8} aria-hidden="true" />
          {!!data?.unreadNotifications && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-black px-1 text-[11px] font-medium leading-5 text-white"
            >
              {data.unreadNotifications > 99 ? "99+" : data.unreadNotifications}
            </span>
          )}
        </Link>
      }
    >
      <Status error={error} loading={loading} />
      {error && <button onClick={reload}>Retry</button>}
      {data && (
        <>
          <Card className="border-0 bg-[#ffd7ef]">
            <p className="text-[#5e5e5e]">Family spending available</p>
            <p className="font-display text-[48px] font-bold leading-tight">
              {money(data.limit.available, data.limit.currency)}
            </p>
            <p className="text-sm text-[#5e5e5e]">
              {money(data.limit.spent)} used of {money(data.limit.total)} ·
              Shared by all your children. No automatic reset.
            </p>
            {Number(data.limit.reserved) > 0 && (
              <p>{money(data.limit.reserved)} awaiting payment confirmation.</p>
            )}
            {hasParentPermission(data.parent, "canManageBudget") && (
              <ActionLink
                href={data.parent.pinSet ? topupPath : topupPinSetupPath}
              >
                Increase family limit
              </ActionLink>
            )}
          </Card>
          {!data.parent.paypalVaultConnected && (
            <ActionLink href="/account/paypal">
              Connect your PayPal wallet
            </ActionLink>
          )}
          {!data.parent.pinSet && (
            <ActionLink href="/account/security">
              Create your parent PIN
            </ActionLink>
          )}
          <div className="grid grid-cols-2 gap-3">
            <ActionLink href="/approvals">
              Approvals ({data.pendingPurchases + data.pendingChores})
            </ActionLink>
            <ActionLink href="/activity">Activity</ActionLink>
          </div>
          <div className="flex gap-2 overflow-auto">
            <button
              onClick={() => setSelected("")}
              className={`rounded-full px-4 py-3 ${!selected ? "bg-black text-white" : "bg-white"}`}
            >
              All children
            </button>
            {children.items.map((k) => (
              <button
                key={k.id}
                onClick={() => setSelected(k.id)}
                className={`shrink-0 rounded-full px-4 py-3 ${selected === k.id ? "bg-black text-white" : "bg-white"}`}
              >
                {k.name.split(" ")[0]}
              </button>
            ))}
          </div>
          <Status error={children.error} loading={children.loading} />
          {!children.loading && !children.error && !kids.length && (
            <Empty>Your crew starts here. Add your first child below.</Empty>
          )}
          {kids.map((k) => {
            const avatar =
              AVATARS[Number(k.avatar.replace("avatar-", "")) - 1] ||
              AVATARS[0];
            return (
              <Card key={k.id}>
                <div className="flex items-center gap-3">
                  <img
                    src={avatar.src}
                    alt=""
                    className="size-16 rounded-full"
                    style={{ backgroundColor: avatar.bg }}
                  />
                  <div className="flex-1">
                    <h2 className="font-display text-xl font-bold">{k.name}</h2>
                    <p className="text-sm text-[#5e5e5e]">
                      {k.isFrozen
                        ? "Paused"
                        : k.pinSet
                          ? "Wallet active"
                          : "Ready to activate"}
                    </p>
                  </div>
                  {hasParentPermission(data.parent, "canManageChildren") && (
                    <Link
                      href={`/children/${k.id}/settings`}
                      className="rounded-full bg-[#f3f3f3] px-4 py-3"
                    >
                      Manage
                    </Link>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm text-[#5e5e5e]">Spend allowance</p>
                    <p className="font-display text-2xl font-bold">
                      {money(k.wallet?.spendBalance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[#5e5e5e]">Savings</p>
                    <p className="font-display text-2xl font-bold">
                      {money(k.wallet?.saveBalance)}
                    </p>
                  </div>
                </div>
                {k.pinSet === false &&
                  hasParentPermission(data.parent, "canManageChildren") &&
                  hasParentPermission(
                    data.parent,
                    "canManageSpendingRules",
                  ) && (
                    <ActionLink href={`/activate/${k.id}`}>
                      Activate wallet & get login PIN
                    </ActionLink>
                  )}
                <div className="grid grid-cols-2 gap-3">
                  <ActionLink href={`/goals?childId=${k.id}`}>
                    Savings
                  </ActionLink>
                  <ActionLink href={`/allowances?childId=${k.id}`}>
                    Allowance
                  </ActionLink>
                </div>
              </Card>
            );
          })}
          {!selected && <ListEnd list={children} />}
          {hasParentPermission(data.parent, "canManageChildren") && (
            <ActionLink href="/children/new">Add a child</ActionLink>
          )}
          {hasParentPermission(data.parent, "canApproveChores") && (
            <ActionLink href="/chores">Manage tasks</ActionLink>
          )}
          <ActionLink href="/coparent">Co-parent</ActionLink>
        </>
      )}
      {hasParentPermission(data?.parent, "canManageBudget") && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(48px,env(safe-area-inset-bottom))]">
          <TopupPill
            label="Top up"
            onClick={() =>
              router.push(data?.parent.pinSet ? topupPath : topupPinSetupPath)
            }
          />
        </div>
      )}
    </AppScreen>
  );
}

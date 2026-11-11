"use client";
import { useState } from "react";
import {
  AppScreen,
  Card,
  Field,
  Button,
  Status,
  ActionLink,
  useRemote,
  useAction,
} from "@/components/app-ui";
import { Kid, Me } from "@/lib/app-types";
import { hasParentPermission } from "@/lib/co-parent-permissions";
import { postApi } from "@/lib/client-api";
export default function ChildSettingsScreen({ id }: { id: string }) {
  const child = useRemote<Kid>(`/api/children/${id}`);
  const me = useRemote<Me>("/api/auth/me");
  const action = useAction();
  const [newPin, setNewPin] = useState(""),
    [parentPin, setParentPin] = useState("");
  const k = child.data;
  const canManage = hasParentPermission(me.data?.user, "canManageChildren");
  const canActivate =
    canManage && hasParentPermission(me.data?.user, "canManageSpendingRules");
  return (
    <AppScreen
      title={
        k
          ? `${k.name.split(" ")[0]}'s profile & login`
          : "Child profile & login"
      }
      role="USER"
    >
      <Status
        loading={child.loading || me.loading}
        error={child.error || me.error || action.error}
        notice={action.notice}
      />
      {k && (
        <>
          <Card>
            <p className="text-[#5e5e5e]">Login username</p>
            <p className="break-all font-display text-2xl font-bold">
              {k.username}
            </p>
            <p>
              {k.pinSet
                ? "Login is activated."
                : "Login has not been activated yet."}
            </p>
            {canManage && (
              <ActionLink href={`/children/${id}/edit`}>
                Edit name, avatar & date of birth
              </ActionLink>
            )}
            {k.pinSet === false && canActivate && (
              <ActionLink href={`/activate/${id}`}>
                Activate wallet & get login PIN
              </ActionLink>
            )}
          </Card>
          {k.pinSet === true && canManage && (
            <Card>
              <h2 className="font-display text-xl font-bold">
                Reset login PIN
              </h2>
              <p className="text-sm text-[#5e5e5e]">
                Choose six new digits for your child. This also clears any PIN
                lockout.
              </p>
              <Field
                label="Your parent PIN"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="off"
                value={parentPin}
                onChange={(e) =>
                  setParentPin(e.target.value.replace(/\D/g, ""))
                }
              />
              <Field
                label="New child PIN"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoComplete="new-password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              />
              <Button
                busy={action.busy}
                disabled={newPin.length !== 6 || parentPin.length !== 6}
                onClick={() =>
                  void action.run(async () => {
                    await postApi(`/api/children/${id}/reset-pin`, {
                      newPin,
                      parentPin,
                    });
                    setNewPin("");
                    setParentPin("");
                    child.reload();
                  }, "Child PIN saved. Share it privately with your child.")
                }
              >
                Save child PIN
              </Button>
            </Card>
          )}
        </>
      )}
    </AppScreen>
  );
}

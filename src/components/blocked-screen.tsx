"use client";
import { postApi } from "@/lib/client-api";
import { Button, Card, Status, useAction } from "@/components/app-ui";
export default function BlockedScreen() {
  const action = useAction();
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center gap-5 px-4">
      <Card>
        <h1 className="font-display text-3xl font-bold">Account unavailable</h1>
        <p>
          This account is paused or cannot access the app. Contact your parent
          or support.
        </p>
        <Status error={action.error} />
        <Button
          busy={action.busy}
          onClick={() =>
            void action.run(async () => {
              await postApi("/api/auth/logout", {});
              window.location.replace("/start");
            })
          }
        >
          Sign out
        </Button>
      </Card>
    </main>
  );
}

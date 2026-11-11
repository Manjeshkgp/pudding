"use client";

import { BackPill, EmptyState } from "@/components/coparent-parts";

// Parent flow: invitations this parent has received from another parent (sample: none).
export default function CoparentInvitationsScreen() {
  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col pt-[max(16px,env(safe-area-inset-top))]">
        <div className="px-4">
          <BackPill to="/coparent" />
        </div>
        <EmptyState text="You got no co-parenting invitations" wide />
      </div>
    </main>
  );
}

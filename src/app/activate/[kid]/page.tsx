import { requirePage } from "@/lib/page-auth";
import ActivateWallet from "@/components/activate-wallet";
import { SessionGate } from "@/components/app-ui";
export default async function ActivatePage({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  await requirePage("/activate");
  const { kid } = await params;
  return (
    <SessionGate role="USER">
      <ActivateWallet childId={kid} />
    </SessionGate>
  );
}

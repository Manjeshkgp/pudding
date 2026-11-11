import ActivateWallet from "@/components/activate-wallet";

export default async function ActivatePage({ params }: { params: Promise<{ kid: string }> }) {
  const { kid } = await params;
  const name = kid.charAt(0).toUpperCase() + kid.slice(1).toLowerCase();
  return <ActivateWallet name={name} />;
}

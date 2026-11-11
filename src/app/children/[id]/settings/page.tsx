import { requirePage } from "@/lib/page-auth";
import ChildSettingsScreen from "@/components/child-settings-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage("/children");
  return <ChildSettingsScreen id={(await params).id} />;
}

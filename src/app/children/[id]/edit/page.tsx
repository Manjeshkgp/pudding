import { requirePage } from "@/lib/page-auth";
import EditKidScreen from "@/components/edit-kid-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePage(`/children/${id}/edit`);
  return <EditKidScreen childId={id} returnTo={`/children/${id}/settings`} />;
}

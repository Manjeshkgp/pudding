import EditKidScreen from "@/components/edit-kid-screen";

export default async function Page({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  const { kid } = await params;
  return <EditKidScreen childId={kid} />;
}

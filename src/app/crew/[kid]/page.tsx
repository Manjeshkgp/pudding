import { notFound } from "next/navigation";
import EditKidScreen from "@/components/edit-kid-screen";
import { KIDS } from "@/components/crew-data";

export default async function Page({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  const { kid } = await params;
  const i = Number(kid);
  if (!Number.isInteger(i) || !KIDS[i]) notFound();
  return <EditKidScreen index={i} />;
}

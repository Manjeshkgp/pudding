import { TaskSubmissionScreen } from "@/components/task-submission-screen";
import { requirePage } from "@/lib/page-auth";
import { taskSubmissionPath } from "@/lib/navigation-policy";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePage(taskSubmissionPath(id));
  return <TaskSubmissionScreen id={id} />;
}

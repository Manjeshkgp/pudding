import { redirectLegacyPage } from "@/lib/page-auth";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return redirectLegacyPage("/setup", await searchParams);
}

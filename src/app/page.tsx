import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth";

export default async function RootPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");
  redirect("/lists");
}

import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");
  return <>{children}</>;
}

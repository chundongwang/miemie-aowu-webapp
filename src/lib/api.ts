import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (userId: string) => Promise<NextResponse<any>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withAuth(handler: Handler): Promise<NextResponse<any>> {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handler(userId);
}

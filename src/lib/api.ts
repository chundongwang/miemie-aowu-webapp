import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { logError } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (userId: string) => Promise<NextResponse<any>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withAuth(handler: Handler): Promise<NextResponse<any>> {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await handler(userId);
  } catch (error) {
    logError("withAuth", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Wrap any route handler (including those without auth) in error handling. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withErrorHandling(context: string, handler: () => Promise<NextResponse<any>>): Promise<NextResponse<any>> {
  try {
    return await handler();
  } catch (error) {
    logError(context, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

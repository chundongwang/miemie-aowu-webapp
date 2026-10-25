import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { verifyPassword, setAuthCookie } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api";


// Relative Location keeps the redirect on whatever host the client used
// (the Worker itself sees cf-origin.miemieaowu.ai behind the DMIT proxy).
function seeOther(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  return withErrorHandling("auth.login", async () => {
    // Native <form> submission (page not hydrated, or JS unavailable): the
    // browser sends urlencoded fields and expects a redirect, not JSON.
    const isForm = (req.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
    let username = "", password = "";
    if (isForm) {
      const fd = await req.formData();
      username = String(fd.get("username") || "");
      password = String(fd.get("password") || "");
    } else {
      ({ username, password } = await req.json() as { username: string; password: string });
    }

    if (!username || !password) {
      if (isForm) return seeOther("/login?error=1");
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const db = await getDB();
    const user = await db
      .prepare("SELECT id, username, display_name, password_hash FROM users WHERE username = ? AND deleted_at IS NULL")
      .bind(username.toLowerCase())
      .first<{ id: string; username: string; display_name: string; password_hash: string }>();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      if (isForm) return seeOther("/login?error=1");
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    await setAuthCookie(user.id);

    if (isForm) return seeOther("/lists");

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
    });
  });
}

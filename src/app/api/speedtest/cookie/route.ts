import { NextRequest, NextResponse } from "next/server";

// Cookie round-trip probe for /speedtest. First call sets a short-lived cookie
// with the same attributes the login cookie uses; the page then calls again
// with ?check=1 and we report whether it came back. Proves Set-Cookie survives
// the proxy path and that the client's cookie jar accepts it.
const NAME = "st_probe";

export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (req.nextUrl.searchParams.get("check") === "1") {
    const present = req.cookies.get(NAME)?.value === "1";
    return NextResponse.json({ present }, { headers });
  }
  const res = NextResponse.json({ set: true }, { headers });
  res.cookies.set(NAME, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  return res;
}

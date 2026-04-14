import { NextRequest, NextResponse } from "next/server";

// Logs every API request to the edge runtime console.
// Visible via: `npx wrangler tail` or Cloudflare Dashboard → Workers → Logs
export function middleware(req: NextRequest) {
  const { method, nextUrl } = req;
  console.log(
    JSON.stringify({
      level: "info",
      type: "request",
      method,
      path: nextUrl.pathname,
      ts: new Date().toISOString(),
    })
  );
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

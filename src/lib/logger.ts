// Structured JSON logger — output is visible in `wrangler tail` and
// Cloudflare Dashboard → Workers → your worker → Logs tab.

export function logError(context: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(
    JSON.stringify({
      level: "error",
      context,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...extra,
      ts: new Date().toISOString(),
    })
  );
}

export function logInfo(context: string, data?: Record<string, unknown>) {
  console.log(
    JSON.stringify({ level: "info", context, ...data, ts: new Date().toISOString() })
  );
}

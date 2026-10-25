import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Appends ?dpl=<id> to every /_next/static URL. Bumped 2026-10-25 to evict
  // the zstd-poisoned vendor chunks that iOS WKWebView (the Capacitor app,
  // Safari) cached with a one-year immutable header during the 2026-10-10..24
  // DMIT cache incident: shared chunks keep the same content hash across
  // deploys, so without this clients never re-fetched them and React never
  // ran. Bump again only if clients ever need a forced asset refresh.
  deploymentId: "20261025a",
};

export default nextConfig;

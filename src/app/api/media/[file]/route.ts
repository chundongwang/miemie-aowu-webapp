import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Serve large media (the video-FAB clips) through the Cloudflare Assets binding,
// which honours HTTP Range requests and replies 206 Partial Content. Requesting
// the file directly at /yongqi.mp4 goes through OpenNext's public-file handler,
// which ignores Range and returns the whole file (200) — so mobile browsers
// can't seek/scrub forward into bytes they haven't downloaded yet. Routing the
// same asset through env.ASSETS restores native Range support. See VideoModal.
const ALLOWED = new Set(["yongqi.mp4", "qingge.mp4", "video.mp4"]);

type Params = { params: Promise<{ file: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { file } = await params;
  if (!ALLOWED.has(file)) return new Response("Not found", { status: 404 });

  const { env } = await getCloudflareContext({ async: true });
  if (!env.ASSETS) return new Response("Assets binding unavailable", { status: 500 });
  // Forward the original request (Range / If-Range / conditional headers) to the
  // static-asset server, pointed at the real asset path.
  const assetUrl = new URL(`/${file}`, req.url);
  return env.ASSETS.fetch(new Request(assetUrl, req));
}

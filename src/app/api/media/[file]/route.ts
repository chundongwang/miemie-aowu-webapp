import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Serve the video-FAB clips with real HTTP Range support so mobile browsers can
// seek/scrub. Two layers of the platform can't do this on their own:
//   • Requesting /yongqi.mp4 directly hits OpenNext's public-file handler, which
//     ignores Range and returns the whole file (200).
//   • env.ASSETS.fetch() likewise replies 200 for Range requests in this setup.
// R2, however, supports byte-range reads. So we seed each clip into R2 once
// (streamed from the ASSETS binding — no external upload/credentials needed) and
// then answer Range requests with a proper 206 Partial Content built by hand.
const ALLOWED = new Set(["yongqi.mp4", "qingge.mp4", "video.mp4"]);
const CACHE = "public, max-age=31536000, immutable";

type Params = { params: Promise<{ file: string }> };

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  let start = m[1] === "" ? NaN : parseInt(m[1], 10);
  let end = m[2] === "" ? NaN : parseInt(m[2], 10);
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    // suffix range: final N bytes
    if (end <= 0) return null;
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (Number.isNaN(end) || end >= size) {
    end = size - 1;
  }
  if (start > end || start >= size) return null;
  return { start, end };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { file } = await params;
  if (!ALLOWED.has(file)) return new Response("Not found", { status: 404 });

  const { env, ctx } = await getCloudflareContext({ async: true });
  const assets = env.ASSETS;
  if (!assets) return new Response("Assets binding unavailable", { status: 500 });
  const bucket = (env as unknown as Cloudflare.Env).miemie_aowu_photos;
  const assetUrl = new URL(`/${file}`, req.url);
  const assetReq = () => new Request(assetUrl, { method: "GET" });
  const key = `media/${file}`;

  // No R2? Degrade to the plain asset (playback works, seeking won't).
  if (!bucket) return assets.fetch(assetReq());

  const head = await bucket.head(key);
  if (!head) {
    // Seed R2 from the asset. Do it in the background so this first request
    // isn't blocked on copying ~15–22MB; serve the plain asset meanwhile.
    ctx.waitUntil(
      (async () => {
        const asset = await assets.fetch(assetReq());
        if (asset.ok && asset.body) {
          await bucket.put(key, asset.body, {
            httpMetadata: { contentType: "video/mp4", cacheControl: CACHE },
          });
        }
      })()
    );
    return assets.fetch(assetReq());
  }

  const size = head.size;
  const contentType = head.httpMetadata?.contentType ?? "video/mp4";
  const rangeHeader = req.headers.get("range");
  const range = parseRange(rangeHeader, size);

  if (rangeHeader && !range) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
    });
  }

  if (range) {
    const { start, end } = range;
    const obj = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!obj) return assets.fetch(assetReq());
    return new Response(obj.body as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": CACHE,
      },
    });
  }

  const obj = await bucket.get(key);
  if (!obj) return assets.fetch(assetReq());
  return new Response(obj.body as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": CACHE,
    },
  });
}

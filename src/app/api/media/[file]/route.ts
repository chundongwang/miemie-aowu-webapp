import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

// Serve the video-FAB clips from public/ with real HTTP Range support so mobile
// browsers can seek/scrub (206 Partial Content built by hand).
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

  const filePath = path.join(process.cwd(), "public", file);
  if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });

  const size = fs.statSync(filePath).size;
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
    const stream = fs.createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": CACHE,
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": CACHE,
    },
  });
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Public, login-free speed test. Measures from the visitor's browser:
//  1. /healthz           — answered by the DMIT Hong Kong nginx itself (pure client→HK RTT)
//  2. /api/speedtest/ping — full path DMIT → Cloudflare → Worker
//  3. this page's own CSS — the cached /_next/static path, plus the encoding it arrived in
//  4. /api/speedtest/blob — 1 MiB incompressible download for throughput
// and whether the stylesheet actually applied (the 2026-10-24 zstd incident).

type Row = {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "fail";
  value?: string;
  detail?: string;
};

const ROUNDS = 3;
const BLOB_BYTES = 1024 * 1024;

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function timeFetch(url: string, init?: RequestInit) {
  const t0 = performance.now();
  const res = await fetch(url, { cache: "no-store", ...init });
  const buf = await res.arrayBuffer();
  const ms = performance.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { ms, bytes: buf.byteLength, headers: res.headers };
}

async function medianOf(url: string, rounds = ROUNDS) {
  const times: number[] = [];
  let last: Awaited<ReturnType<typeof timeFetch>> | null = null;
  for (let i = 0; i < rounds; i++) {
    last = await timeFetch(`${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}-${i}`);
    times.push(last.ms);
  }
  return { ms: median(times), last: last! };
}

export default function SpeedTestPage() {
  const [rows, setRows] = useState<Row[]>([
    { key: "css-applied", label: "样式已生效 / Stylesheet applied", status: "pending" },
    { key: "hk", label: "到香港节点 / To Hong Kong edge", status: "pending" },
    { key: "worker", label: "到应用服务器 / To app server", status: "pending" },
    { key: "css", label: "样式文件下载 / Stylesheet download", status: "pending" },
    { key: "blob", label: "1 MB 下载速度 / 1 MB download", status: "pending" },
  ]);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [summary, setSummary] = useState("");
  const [copied, setCopied] = useState(false);
  const markerRef = useRef<HTMLSpanElement>(null);

  const update = useCallback((key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const run = useCallback(async () => {
    setPhase("running");
    setSummary("");
    setCopied(false);
    const out: Record<string, string> = {};
    setRows((rs) => rs.map((r) => ({ ...r, status: "pending", value: undefined, detail: undefined })));

    // 1. Did the stylesheet apply? Tailwind gives the marker a known color.
    update("css-applied", { status: "running" });
    const color = markerRef.current ? getComputedStyle(markerRef.current).color : "";
    const applied = color === "rgb(22, 163, 74)"; // text-green-600
    update("css-applied", { status: applied ? "done" : "fail", value: applied ? "是 / yes" : "否 / NO", detail: color || undefined });
    out.css = applied ? "ok" : "MISSING";

    // 2. HK edge RTT
    update("hk", { status: "running" });
    try {
      const { ms } = await medianOf("/healthz");
      update("hk", { status: "done", value: `${Math.round(ms)} ms` });
      out.hk = `${Math.round(ms)}ms`;
    } catch (e) {
      update("hk", { status: "fail", value: String(e) });
      out.hk = "fail";
    }

    // 3. Worker round trip
    update("worker", { status: "running" });
    try {
      const { ms } = await medianOf("/api/speedtest/ping");
      update("worker", { status: "done", value: `${Math.round(ms)} ms` });
      out.worker = `${Math.round(ms)}ms`;
    } catch (e) {
      update("worker", { status: "fail", value: String(e) });
      out.worker = "fail";
    }

    // 4. This page's own stylesheet through the DMIT cache
    update("css", { status: "running" });
    try {
      const href = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
        .map((l) => l.href)
        .find((h) => h.includes("/_next/static/"));
      if (!href) throw new Error("no stylesheet link found");
      const r = await timeFetch(href, { cache: "reload" });
      const enc = r.headers.get("content-encoding") || "identity";
      const shadow = r.headers.get("x-shadow-cache") || "-";
      update("css", {
        status: "done",
        value: `${Math.round(r.ms)} ms`,
        detail: `${(r.bytes / 1024).toFixed(0)} KB · ${enc} · cache ${shadow}`,
      });
      out.cssdl = `${Math.round(r.ms)}ms ${enc} ${shadow}`;
    } catch (e) {
      update("css", { status: "fail", value: String(e) });
      out.cssdl = "fail";
    }

    // 5. Throughput
    update("blob", { status: "running" });
    try {
      const r = await timeFetch(`/api/speedtest/blob?bytes=${BLOB_BYTES}&_=${Date.now()}`);
      const mbps = (r.bytes * 8) / (r.ms / 1000) / 1_000_000;
      update("blob", { status: "done", value: `${(r.ms / 1000).toFixed(2)} s`, detail: `${mbps.toFixed(1)} Mbps` });
      out.blob = `${(r.ms / 1000).toFixed(2)}s ${mbps.toFixed(1)}Mbps`;
    } catch (e) {
      update("blob", { status: "fail", value: String(e) });
      out.blob = "fail";
    }

    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
    const line = [
      `miemieaowu speedtest ${new Date().toISOString()}`,
      `css=${out.css}`,
      `hk=${out.hk}`,
      `worker=${out.worker}`,
      `cssdl=${out.cssdl}`,
      `1MB=${out.blob}`,
      conn ? `net=${conn}` : null,
      `ua=${navigator.userAgent}`,
    ]
      .filter(Boolean)
      .join(" | ");
    setSummary(line);
    setPhase("done");
    fetch("/api/speedtest/report", { method: "POST", body: line, keepalive: true }).catch(() => {});
  }, [update]);

  useEffect(() => {
    run();
  }, [run]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      /* clipboard may be unavailable in some in-app browsers; text is selectable below */
    }
  }

  const dot: Record<Row["status"], string> = {
    pending: "bg-gray-300",
    running: "bg-amber-400 animate-pulse",
    done: "bg-green-500",
    fail: "bg-red-500",
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-semibold">网络测速 / Speed test</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          无需登录，结果会自动上报。No login needed; results are sent automatically.
        </p>
        <span ref={markerRef} className="text-green-600 sr-only">marker</span>

        <ul className="mt-6 divide-y divide-gray-200 dark:divide-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-4 py-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[r.status]}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm">{r.label}</div>
                {r.detail && <div className="text-xs text-gray-500 dark:text-gray-400">{r.detail}</div>}
              </div>
              <div className={`text-sm font-mono tabular-nums ${r.status === "fail" ? "text-red-600" : ""}`}>
                {r.value ?? (r.status === "running" ? "…" : "")}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex gap-3">
          <button
            onClick={run}
            disabled={phase === "running"}
            className="flex-1 rounded-lg bg-[#2B4B8C] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {phase === "running" ? "测试中… / Running…" : "再测一次 / Run again"}
          </button>
          <button
            onClick={copy}
            disabled={!summary}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {copied ? "已复制 / Copied" : "复制结果 / Copy"}
          </button>
        </div>

        {summary && (
          <p className="mt-4 break-all rounded-lg bg-gray-100 dark:bg-gray-800 p-3 font-mono text-[11px] leading-relaxed text-gray-600 dark:text-gray-300 select-all">
            {summary}
          </p>
        )}
      </div>
    </main>
  );
}

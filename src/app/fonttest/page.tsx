"use client";

import { useSyncExternalStore } from "react";

// Public, login-free font check. Renders the same Simplified Chinese paragraph
// under several font stacks so a per-character weight mismatch (seen on iOS 26
// with `Arial, Helvetica, sans-serif`, where 是/的/不/过/东/西 came out heavier
// than their neighbours) can be compared on a real device.

const SAMPLE =
  "越是亮堂的地方，眼睛瞳孔越是收缩，就越觉得并不是很亮不是很耀眼。\n做的事情越深入，反而觉得不懂的东西越多，越困惑，一个简单的事情来做。";

const STACKS: { label: string; family: string; lang?: string }[] = [
  { label: "A · old body stack, lang=en", family: "Arial, Helvetica, sans-serif", lang: "en" },
  { label: "B · old body stack, lang=zh-Hans", family: "Arial, Helvetica, sans-serif" },
  { label: "C · new body stack (Arial + PingFang SC named)", family: 'Arial, Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif' },
  { label: "D · PingFang SC only", family: '"PingFang SC", sans-serif' },
  { label: "E · system font (-apple-system)", family: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif" },
  { label: "F · Hiragino Sans GB named", family: 'Arial, Helvetica, "Hiragino Sans GB", sans-serif' },
  { label: "G · Helvetica Neue first", family: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
];

export default function FontTestPage() {
  const ua = useSyncExternalStore(() => () => {}, () => navigator.userAgent, () => "");
  return (
    <main className="mx-auto max-w-lg px-4 py-6 text-gray-900 dark:text-gray-100">
      <h1 className="text-lg font-semibold">Font check · 字体检查</h1>
      <p className="mt-1 break-all text-[11px] text-gray-500">{ua}</p>
      {STACKS.map((s) => (
        <section key={s.label} className="mt-5">
          <h2 className="text-xs text-gray-500">{s.label}</h2>
          <p className="mt-1 break-all text-[10px] text-gray-400">{s.family}</p>
          <p
            lang={s.lang ?? "zh-Hans"}
            style={{ fontFamily: s.family }}
            className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300"
          >
            {SAMPLE}
          </p>
        </section>
      ))}
    </main>
  );
}

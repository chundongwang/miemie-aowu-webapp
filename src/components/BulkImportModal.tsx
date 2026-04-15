"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/context/LocaleContext";

type ParsedItem = {
  _key: string;
  name: string;
  secondary: string;
  reason: string;
  imageUrls: string[];
};

type Props = {
  listId: string;
  secondaryLabel: string | null;
  onClose: () => void;
};

export default function BulkImportModal({ listId, secondaryLabel, onClose }: Props) {
  const t = useT();
  const router = useRouter();

  const [step,    setStep]    = useState<"input" | "preview" | "adding">("input");
  const [text,    setText]    = useState("");
  const [parsing, setParsing] = useState(false);
  const [items,   setItems]   = useState<ParsedItem[]>([]);
  const [error,   setError]   = useState("");
  const [progress,      setProgress]      = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [imageWarnings, setImageWarnings] = useState<string[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  const isDirty = text.trim() !== "" || items.length > 0;

  function handleDismiss() {
    if (step === "adding") return; // block dismiss during import
    if (isDirty && !confirm(t("unsavedChanges"))) return;
    stopTimer();
    onClose();
  }

  // ── Step 1: parse ────────────────────────────────────────────────────────

  async function handleParse() {
    setError("");
    setParsing(true);
    setProgress(0);
    setProgressLabel(t("importParsing"));

    // Fake progress: 0 → 38% while LLM works (~150 ms / step)
    timerRef.current = setInterval(() => {
      setProgress((p) => (p < 38 ? p + 1 : p));
    }, 150);

    try {
      const res = await fetch(`/api/lists/${listId}/items/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json() as {
        items?: Array<{ name: string; secondary?: string | null; reason?: string | null; imageUrls?: string[] }>;
        error?: string;
      };

      stopTimer();

      if (!res.ok) { setError(t("importErrorParse")); return; }
      if (!data.items?.length) { setError(t("importNoItems")); return; }

      setItems(data.items.map((it, i) => ({
        _key:      `${i}-${it.name}`,
        name:      it.name,
        secondary: it.secondary ?? "",
        reason:    it.reason    ?? "",
        imageUrls: it.imageUrls ?? [],
      })));
      setProgress(40);
      setProgressLabel("");
      setStep("preview");
    } catch {
      stopTimer();
      setError(t("importErrorParse"));
    } finally {
      setParsing(false);
    }
  }

  // ── Step 2 helpers: edit preview ─────────────────────────────────────────

  function updateItem(key: string, field: "name" | "secondary" | "reason", value: string) {
    setItems((prev) => prev.map((it) => it._key === key ? { ...it, [field]: value } : it));
  }
  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  // ── Step 3: bulk add with SSE progress ───────────────────────────────────

  async function handleAdd() {
    const valid = items.filter((it) => it.name.trim());
    if (!valid.length) return;

    setError("");
    setStep("adding");
    setProgressLabel(t("importAdding"));

    let res: Response;
    try {
      res = await fetch(`/api/lists/${listId}/items/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: valid.map((it) => ({
            name:      it.name.trim(),
            secondary: it.secondary.trim() || null,
            reason:    it.reason.trim()    || null,
            imageUrls: it.imageUrls.length ? it.imageUrls : undefined,
          })),
        }),
      });
    } catch {
      setError(t("importErrorAdd"));
      setStep("preview");
      return;
    }

    if (!res.ok || !res.body) {
      setError(t("importErrorAdd"));
      setStep("preview");
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data: ")) continue;

          const event = JSON.parse(line.slice(6)) as {
            type: string;
            index?: number;
            total?: number;
            count?: number;
            message?: string;
            imagesOk?: number;
            imageErrors?: string[];
          };

          if (event.type === "item" && event.index !== undefined && event.total) {
            const pct = 40 + Math.round(60 * (event.index + 1) / event.total);
            setProgress(pct);
            setProgressLabel(`${t("importAdding")} ${event.index + 1} / ${event.total}`);
            if (event.imageErrors?.length) {
              setImageWarnings((w) => [...w, ...event.imageErrors!]);
              console.warn("[import] image errors:", event.imageErrors);
            }
          }
          if (event.type === "done") {
            setProgress(100);
            setProgressLabel("✓");
            router.refresh();
            // If images failed, stay open briefly to show warning; otherwise close
            setTimeout(onClose, imageWarnings.length > 0 ? 2500 : 600);
          }
          if (event.type === "error") {
            setError(t("importErrorAdd"));
            setStep("preview");
          }
        }
      }
    } catch {
      setError(t("importErrorAdd"));
      setStep("preview");
    }
  }

  const validCount = items.filter((it) => it.name.trim()).length;
  const showBar    = parsing || step === "adding";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center"
      onClick={handleDismiss}
    >
      <div
        className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {step !== "adding" && (
          <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              {step === "preview" && (
                <button
                  onClick={() => { setStep("input"); setError(""); }}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  {t("importBack")}
                </button>
              )}
              <h2 className="text-lg font-semibold">{t("importTitle")}</h2>
            </div>
            <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        )}

        {/* Progress bar (parse + add steps) */}
        {showBar && (
          <div className="px-6 pt-6 pb-2 shrink-0">
            {step === "adding" && (
              <p className="text-sm font-medium text-gray-700 mb-3 text-center">{t("importTitle")}</p>
            )}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2B4B8C] rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-center mt-1.5">{progressLabel} {Math.round(progress)}%</p>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto px-6 pb-8 flex-1">
          {step === "adding" ? (
            <div className="py-2">
              {imageWarnings.length > 0 && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-medium text-amber-700 mb-1">
                    {imageWarnings.length} image{imageWarnings.length > 1 ? "s" : ""} could not be downloaded (items still added)
                  </p>
                  <ul className="space-y-0.5">
                    {imageWarnings.map((w, i) => (
                      <li key={i} className="text-[10px] text-amber-600 break-all">{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : step === "input" ? (
            // ── Input step ──
            <div className="space-y-4 pt-1">
              <p className="text-xs text-gray-400">{t("importStep1Hint")}</p>
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] resize-none"
                placeholder={
                  secondaryLabel
                    ? `Blue Bottle Coffee\n${secondaryLabel}: 300 Webster St, Oakland\nBest pour-over in the city`
                    : `Blue Bottle Coffee — best pour-over in the city\n\nFour Barrel Coffee\nAmazing espresso`
                }
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={handleParse}
                disabled={parsing || !text.trim()}
                className="w-full bg-[#2B4B8C] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {parsing ? t("importParsing") : <>✦ {t("importParseButton")}</>}
              </button>
            </div>
          ) : (
            // ── Preview step ──
            <div className="space-y-3 pt-1">
              <p className="text-xs text-gray-400">{t("importPreviewHint")}</p>

              {items.map((item) => (
                <div key={item._key} className="border border-gray-200 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <input
                      value={item.name}
                      onChange={(e) => updateItem(item._key, "name", e.target.value)}
                      placeholder={t("nameLabel")}
                      className="flex-1 text-sm font-medium border-b border-gray-200 pb-0.5 focus:outline-none focus:border-[#2B4B8C]"
                    />
                    <button
                      onClick={() => removeItem(item._key)}
                      className="text-gray-300 hover:text-red-400 text-sm shrink-0 mt-0.5"
                    >
                      ✕
                    </button>
                  </div>
                  {secondaryLabel !== null && (
                    <input
                      value={item.secondary}
                      onChange={(e) => updateItem(item._key, "secondary", e.target.value)}
                      placeholder={`${secondaryLabel} (${t("optional")})`}
                      className="w-full text-xs text-gray-500 border-b border-gray-100 pb-0.5 focus:outline-none focus:border-[#2B4B8C]"
                    />
                  )}
                  <input
                    value={item.reason}
                    onChange={(e) => updateItem(item._key, "reason", e.target.value)}
                    placeholder={`${t("whyLabel")} (${t("optional")})`}
                    className="w-full text-xs text-gray-400 italic border-b border-gray-100 pb-0.5 focus:outline-none focus:border-[#2B4B8C]"
                  />
                  {item.imageUrls.length > 0 && (
                    <p className="text-[10px] text-[#2B4B8C]">
                      📷 {item.imageUrls.length} image{item.imageUrls.length > 1 ? "s" : ""} will be downloaded
                    </p>
                  )}
                </div>
              ))}

              {items.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">{t("importNoItems")}</p>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={handleAdd}
                disabled={validCount === 0}
                className="w-full bg-[#2B4B8C] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              >
                {t("importAddButton", { n: String(validCount) })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

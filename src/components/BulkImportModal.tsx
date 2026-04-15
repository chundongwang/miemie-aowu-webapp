"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/context/LocaleContext";

type ParsedItem = {
  _key: string; // client-only stable key
  name: string;
  secondary: string;
  reason: string;
};

type Props = {
  listId: string;
  secondaryLabel: string | null;
  onClose: () => void;
};

export default function BulkImportModal({ listId, secondaryLabel, onClose }: Props) {
  const t = useT();
  const router = useRouter();

  const [step, setStep]       = useState<"input" | "preview">("input");
  const [text, setText]       = useState("");
  const [parsing, setParsing] = useState(false);
  const [adding,  setAdding]  = useState(false);
  const [error,   setError]   = useState("");
  const [items,   setItems]   = useState<ParsedItem[]>([]);

  const isDirty = text.trim() !== "" || items.length > 0;

  function handleDismiss() {
    if (isDirty && !confirm(t("unsavedChanges"))) return;
    onClose();
  }

  async function handleParse() {
    setError("");
    setParsing(true);
    try {
      const res = await fetch(`/api/lists/${listId}/items/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json() as { items?: Array<{ name: string; secondary?: string | null; reason?: string | null }>; error?: string };
      if (!res.ok) { setError(t("importErrorParse")); return; }
      if (!data.items || data.items.length === 0) { setError(t("importNoItems")); return; }
      setItems(data.items.map((it, i) => ({
        _key:      `${i}-${it.name}`,
        name:      it.name,
        secondary: it.secondary ?? "",
        reason:    it.reason    ?? "",
      })));
      setStep("preview");
    } catch {
      setError(t("importErrorParse"));
    } finally {
      setParsing(false);
    }
  }

  function updateItem(key: string, field: "name" | "secondary" | "reason", value: string) {
    setItems((prev) => prev.map((it) => it._key === key ? { ...it, [field]: value } : it));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  async function handleAdd() {
    const valid = items.filter((it) => it.name.trim());
    if (valid.length === 0) return;
    setError("");
    setAdding(true);
    try {
      const res = await fetch(`/api/lists/${listId}/items/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: valid.map((it) => ({
            name:      it.name.trim(),
            secondary: it.secondary.trim() || null,
            reason:    it.reason.trim()    || null,
          })),
        }),
      });
      if (!res.ok) { setError(t("importErrorAdd")); return; }
      router.refresh();
      onClose();
    } catch {
      setError(t("importErrorAdd"));
    } finally {
      setAdding(false);
    }
  }

  const validCount = items.filter((it) => it.name.trim()).length;

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
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-2">
            {step === "preview" && (
              <button
                onClick={() => { setStep("input"); setError(""); }}
                className="text-gray-400 hover:text-gray-600 text-sm mr-1"
              >
                {t("importBack")}
              </button>
            )}
            <h2 className="text-lg font-semibold">{t("importTitle")}</h2>
          </div>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 pb-6 flex-1">
          {step === "input" ? (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">{t("importStep1Hint")}</p>
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] resize-none"
                placeholder={
                  secondaryLabel
                    ? `Blue Bottle Coffee\n${secondaryLabel}: 300 Webster St, Oakland\nBest pour-over in the city\n\nFour Barrel Coffee — amazing espresso`
                    : `Blue Bottle Coffee — best pour-over in the city\n\nFour Barrel Coffee\nAmazing espresso and pastries`
                }
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={handleParse}
                disabled={parsing || !text.trim()}
                className="w-full bg-[#2B4B8C] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {parsing ? (
                  <>
                    <span className="animate-spin text-base">⟳</span>
                    {t("importParsing")}
                  </>
                ) : (
                  <>✦ {t("importParseButton")}</>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
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
                </div>
              ))}

              {items.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">{t("importNoItems")}</p>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={handleAdd}
                disabled={adding || validCount === 0}
                className="w-full bg-[#2B4B8C] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
              >
                {adding
                  ? t("importAdding")
                  : t("importAddButton", { n: String(validCount) })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

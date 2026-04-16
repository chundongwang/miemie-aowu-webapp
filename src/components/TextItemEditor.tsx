"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/context/LocaleContext";
import type { Item } from "@/types";

const NOTE_EMOJIS = ["💭", "💡", "⭐", "❤️", "🔥", "📌", "✅", "🌿", "🎵", "📖", "🎯", "😄"];

const MORE_EMOJIS: { label: string; emojis: string[] }[] = [
  { label: "Mood",    emojis: ["😄","😊","🥰","😎","🤔","😢","😂","🥳","😴","🤩","😤","🫠","🙃","🤗","😇","🥹","😩","🫡","🤫","🧐"] },
  { label: "Nature",  emojis: ["🌸","🌿","🍀","🌊","🌙","☀️","🌈","🍃","🦋","🌺","🌻","🌵","🍄","🌾","🐚","🦋","🌷","🪻","🐾","🌍"] },
  { label: "Objects", emojis: ["📝","📖","📌","📎","🔑","💎","🎯","🏆","🎁","🔮","💼","🗂️","📷","🎨","🖊️","📐","🧩","🪄","🔭","💻"] },
  { label: "Food",    emojis: ["☕","🍵","🍎","🍕","🍜","🍣","🧁","🍷","🥗","🍓","🎂","🫖","🍰","🥂","🍺","🧃","🍦","🥐","🫙","🍫"] },
  { label: "Active",  emojis: ["🎵","🎮","🏃","💪","🧘","✈️","🚀","🎸","🏋️","⚽","🎾","🏊","🚴","🧗","🎭","🎪","🏄","🎲","♟️","🎻"] },
  { label: "Symbols", emojis: ["💫","🌟","💥","🎊","🎉","❓","💯","🔆","♾️","🔔","⚡","🌀","🔱","☯️","🆕","✨","🔖","🏷️","📍","🗝️"] },
  { label: "Hearts",  emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💕","💞","💗","💓","💔","❤️‍🔥","💝","🫀","❣️","💟","☮️","🩷"] },
];

type Props = {
  listId: string;
  item?: Item;
  onClose: () => void;
};

export default function TextItemEditor({ listId, item, onClose }: Props) {
  const t = useT();
  const router = useRouter();
  const [title, setTitle]     = useState(item?.name ?? "");
  const [body, setBody]       = useState(item?.reason ?? "");
  const [emoji, setEmoji]     = useState(item?.secondary ?? "");
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving]   = useState(false);
  const bodyRef    = useRef<HTMLTextAreaElement>(null);
  const pickerRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMore) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMore]);

  const isDirty = item
    ? title !== (item.name ?? "") || body !== (item.reason ?? "") || emoji !== (item.secondary ?? "")
    : title.trim() !== "" || body.trim() !== "";

  // Auto-resize textarea
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [body]);

  useEffect(() => {
    if (!item) bodyRef.current?.focus();
  }, [item]);

  function handleDismiss() {
    if (isDirty && !confirm(t("unsavedChanges"))) return;
    onClose();
  }

  const handleSave = useCallback(async () => {
    const trimmedBody  = body.trim();
    const trimmedTitle = title.trim();
    if (!trimmedBody && !trimmedTitle) { onClose(); return; }

    const name = trimmedTitle || trimmedBody.split("\n")[0].slice(0, 80) || t("textUntitled");
    setSaving(true);
    try {
      if (item) {
        await fetch(`/api/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, secondary: emoji || null, reason: trimmedBody || null }),
        });
      } else {
        await fetch(`/api/lists/${listId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, secondary: emoji || null, reason: trimmedBody || null }),
        });
      }
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [title, body, emoji, item, listId, onClose, router, t]);

  // Cmd/Ctrl+Enter to save; Esc to dismiss
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleSave(); }
      if (e.key === "Escape") handleDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSave]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
      {/* toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <button onClick={handleDismiss} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
          ‹ Back
        </button>
        <button
          onClick={handleSave}
          disabled={saving || (!title.trim() && !body.trim())}
          className="text-sm font-medium text-[#2B4B8C] disabled:opacity-30 hover:opacity-70"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* editor */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl w-full mx-auto">
        {/* emoji picker */}
        <div className="relative mb-5" ref={pickerRef}>
          <div className="flex items-center gap-1.5">
            {NOTE_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(emoji === e ? "" : e)}
                className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  emoji === e
                    ? "bg-[#2B4B8C]/10 ring-2 ring-[#2B4B8C]/40"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {e}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors ${
                showMore
                  ? "bg-[#2B4B8C]/10 text-[#2B4B8C]"
                  : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              ···
            </button>
          </div>

          {showMore && (
            <div className="absolute top-11 left-0 z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg p-3 w-72 max-h-72 overflow-y-auto">
              {MORE_EMOJIS.map(({ label, emojis }) => (
                <div key={label} className="mb-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mb-1.5 px-1">{label}</p>
                  <div className="flex flex-wrap gap-1">
                    {emojis.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => { setEmoji(emoji === e ? "" : e); setShowMore(false); }}
                        className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                          emoji === e
                            ? "bg-[#2B4B8C]/10 ring-2 ring-[#2B4B8C]/40"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* title */}
        <div className="flex items-center gap-3 mb-4">
          {emoji && <span className="text-3xl shrink-0">{emoji}</span>}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("textTitlePlaceholder")}
            className="flex-1 text-2xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-700"
          />
        </div>

        {/* body */}
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("textBodyPlaceholder")}
          className="w-full bg-transparent border-none outline-none resize-none text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-700 text-base leading-relaxed min-h-[60vh]"
        />
      </div>

      {/* hint */}
      <div className="px-6 py-2 text-xs text-gray-300 dark:text-gray-700 text-center shrink-0">
        ⌘ + Enter to save
      </div>
    </div>
  );
}

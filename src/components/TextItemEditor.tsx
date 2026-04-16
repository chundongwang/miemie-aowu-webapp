"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/context/LocaleContext";
import type { Item } from "@/types";
import EmojiPicker from "@/components/EmojiPicker";
import { NOTE_QUICK_EMOJIS, NOTE_MORE_EMOJIS } from "@/lib/emojis";

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
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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
      <div className="flex items-center justify-between px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-gray-100 dark:border-gray-800 shrink-0">
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
        <div className="mb-5">
          <EmojiPicker
            value={emoji}
            onChange={setEmoji}
            quickEmojis={NOTE_QUICK_EMOJIS}
            moreEmojis={NOTE_MORE_EMOJIS}
          />
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

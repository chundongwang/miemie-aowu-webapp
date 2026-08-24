"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/context/LocaleContext";
import type { Item, ItemPhoto } from "@/types";
import EmojiPicker from "@/components/EmojiPicker";
import PhotoUploadArea, { type StagedPhoto } from "@/components/PhotoUploadArea";
import { NOTE_QUICK_EMOJIS, NOTE_MORE_EMOJIS } from "@/lib/emojis";

const MAX_PHOTOS = 3;

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
  // Photos already persisted on this note (edit mode). Removing one deletes it
  // on the server immediately — matching how list rows handle photo removal.
  const [existing, setExisting] = useState<ItemPhoto[]>(item?.photos ?? []);
  // New photos staged locally, uploaded on save.
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const photoCount = existing.length + staged.length;

  const isDirty = item
    ? title !== (item.name ?? "") || body !== (item.reason ?? "") || emoji !== (item.secondary ?? "") || staged.length > 0
    : title.trim() !== "" || body.trim() !== "" || staged.length > 0;

  // Auto-resize textarea. Collapsing to "auto" to measure shrinks the content,
  // which makes the browser clamp the scroll container to the top — so preserve
  // and restore its scroll position around the measurement.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const scroller = scrollRef.current;
    const prevTop = scroller?.scrollTop ?? 0;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
    if (scroller) scroller.scrollTop = prevTop;
  }, [body]);

  useEffect(() => {
    if (!item) bodyRef.current?.focus();
  }, [item]);

  function handleDismiss() {
    if (isDirty && !confirm(t("unsavedChanges"))) return;
    onClose();
  }

  async function removeExisting(photoId: string) {
    if (!item) return;
    setExisting((prev) => prev.filter((p) => p.id !== photoId));
    await fetch(`/api/items/${item.id}/photos/${photoId}`, { method: "DELETE" }).catch(() => {});
  }

  async function uploadStaged(itemId: string): Promise<boolean> {
    const results = await Promise.all(
      staged.map(async (p) => {
        const fd = new FormData();
        fd.append("file", p.file);
        const r = await fetch(`/api/items/${itemId}/photos`, { method: "POST", body: fd });
        return r.ok;
      })
    );
    return results.every(Boolean);
  }

  const handleSave = useCallback(async () => {
    const trimmedBody  = body.trim();
    const trimmedTitle = title.trim();
    if (!trimmedBody && !trimmedTitle && photoCount === 0) { onClose(); return; }

    const name = trimmedTitle || trimmedBody.split("\n")[0].slice(0, 80) || t("textUntitled");
    setSaving(true);
    try {
      let itemId = item?.id;
      if (item) {
        await fetch(`/api/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, secondary: emoji || null, reason: trimmedBody || null }),
        });
      } else {
        const res = await fetch(`/api/lists/${listId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, secondary: emoji || null, reason: trimmedBody || null }),
        });
        const data = await res.json() as { id?: string };
        itemId = data.id;
      }

      if (itemId && staged.length > 0) {
        const ok = await uploadStaged(itemId);
        if (!ok) {
          alert(t("photoUploadFailed"));
          setSaving(false);
          return;
        }
      }

      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, emoji, item, listId, onClose, router, t, staged, photoCount]);

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
          disabled={saving || (!title.trim() && !body.trim() && photoCount === 0)}
          className="text-sm font-medium text-[#2B4B8C] disabled:opacity-30 hover:opacity-70"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* editor */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl w-full mx-auto">
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
          className="w-full bg-transparent border-none outline-none resize-none text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-700 text-base leading-relaxed min-h-[40vh]"
        />

        {/* photos — writing first, images after; saved + new shown as one set */}
        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
          <PhotoUploadArea
            photos={staged}
            onChange={setStaged}
            max={MAX_PHOTOS - existing.length}
            labelMax={MAX_PHOTOS}
            leading={existing.map((p) => (
              <div key={p.id} className="relative w-20 h-20 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                <button
                  type="button"
                  onClick={() => removeExisting(p.id)}
                  className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center leading-none hover:bg-red-500"
                >
                  ×
                </button>
              </div>
            ))}
          />
        </div>
      </div>

      {/* hint */}
      <div className="px-6 py-2 text-xs text-gray-300 dark:text-gray-700 text-center shrink-0">
        ⌘ + Enter to save
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useT } from "@/context/LocaleContext";
import EmojiPicker from "@/components/EmojiPicker";
import { LIST_QUICK_EMOJIS, LIST_MORE_EMOJIS } from "@/lib/emojis";

type Props = {
  listId: string;
  current: { title: string; emoji: string; secondaryLabel: string | null };
  onClose: () => void;
};

export default function EditListModal({ listId, current, onClose }: Props) {
  const t = useT();
  const [title, setTitle] = useState(current.title);
  const [emoji, setEmoji] = useState(current.emoji);
  const [secondaryLabel, setSecondaryLabel] = useState(current.secondaryLabel ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isDirty = title !== current.title || emoji !== current.emoji || secondaryLabel !== (current.secondaryLabel ?? "");

  function handleDismiss() {
    if (isDirty && !confirm(t("unsavedChanges"))) return;
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError(t("titleRequired")); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), emoji, secondaryLabel: secondaryLabel.trim() || null }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(t("errorSave")); return; }
      if (data.error) { setError(t("errorSave")); return; }
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={handleDismiss}>
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 pb-10 sm:pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{t("editList")}</h2>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <EmojiPicker
            value={emoji}
            onChange={setEmoji}
            quickEmojis={LIST_QUICK_EMOJIS}
            moreEmojis={LIST_MORE_EMOJIS}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("titleLabel")}</label>
            <input
              autoFocus required value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("secondaryFieldLabel")}{" "}
              <span className="text-gray-400 font-normal">({t("secondaryFieldHint")})</span>
            </label>
            <input
              value={secondaryLabel}
              onChange={(e) => setSecondaryLabel(e.target.value)}
              placeholder={t("secondaryFieldPlaceholder")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full bg-[#2B4B8C] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {loading ? t("saving") : t("saveChanges")}
          </button>
        </form>
      </div>
    </div>
  );
}

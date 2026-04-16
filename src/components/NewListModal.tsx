"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/types";
import { useT } from "@/context/LocaleContext";
import type { TranslationKey } from "@/lib/translations";

const EMOJIS = ["☕", "🎵", "🍜", "📚", "🎬", "🌿", "🎮", "✈️", "🛍️", "💡", "🎨", "🏋️"];

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  coffee:     "categoryCoffee",
  music:      "categoryMusic",
  restaurant: "categoryRestaurant",
  book:       "categoryBook",
  movie:      "categoryMovie",
  custom:     "categoryCustom",
};

export default function NewListModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📋");
  const [category, setCategory] = useState("custom");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isDirty = title.trim() !== "";

  function handleDismiss() {
    if (isDirty && !confirm(t("unsavedChanges"))) return;
    onClose();
  }

  function pickCategory(cat: string) {
    setCategory(cat);
    setEmoji(CATEGORIES[cat].emoji);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, emoji, category, isPublic }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) { setError(t("errorCreateList")); return; }
      router.push(`/lists/${data.id}`);
      router.refresh();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={handleDismiss}>
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 pb-10 sm:pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{t("newListTitle")}</h2>
          <button onClick={handleDismiss} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e} type="button"
                onClick={() => setEmoji(e)}
                className={`text-xl p-1.5 rounded-lg ${emoji === e ? "bg-gray-200 dark:bg-gray-700" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}
              >{e}</button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("titleLabel")}</label>
            <input
              autoFocus required value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t("categoryLabel")}</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORIES).map(([key, val]) => (
                <button
                  key={key} type="button"
                  onClick={() => pickCategory(key)}
                  className={`text-sm px-3 py-1 rounded-full border ${
                    category === key ? "bg-[#2B4B8C] text-white border-[#2B4B8C]" : "border-gray-300 dark:border-gray-600 hover:border-gray-500"
                  }`}
                >
                  {val.emoji} {t(CATEGORY_LABEL_KEYS[key])}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("publicListLabel")}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t("publicListHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPublic((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isPublic ? "bg-[#2B4B8C]" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isPublic ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit" disabled={loading || !title.trim()}
            className="w-full bg-[#2B4B8C] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {loading ? t("creating") : t("createList")}
          </button>
        </form>
      </div>
    </div>
  );
}

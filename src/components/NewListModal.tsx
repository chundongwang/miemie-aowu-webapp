"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/types";

const EMOJIS = ["☕", "🎵", "🍜", "📚", "🎬", "🌿", "🎮", "✈️", "🛍️", "💡", "🎨", "🏋️"];

export default function NewListModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📋");
  const [category, setCategory] = useState("custom");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        body: JSON.stringify({ title, emoji, category }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed to create list"); return; }
      router.push(`/lists/${data.id}`);
      router.refresh();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 pb-10 sm:pb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">New list</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* emoji picker */}
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e} type="button"
                onClick={() => setEmoji(e)}
                className={`text-xl p-1.5 rounded-lg ${emoji === e ? "bg-gray-200" : "hover:bg-gray-100"}`}
              >{e}</button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              autoFocus required value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cafes to Try"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORIES).map(([key, val]) => (
                <button
                  key={key} type="button"
                  onClick={() => pickCategory(key)}
                  className={`text-sm px-3 py-1 rounded-full border ${
                    category === key ? "bg-black text-white border-black" : "border-gray-300 hover:border-gray-500"
                  }`}
                >
                  {val.emoji} {val.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit" disabled={loading || !title.trim()}
            className="w-full bg-black text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {loading ? "Creating…" : "Create list"}
          </button>
        </form>
      </div>
    </div>
  );
}

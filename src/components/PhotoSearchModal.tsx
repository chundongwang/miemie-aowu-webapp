"use client";

import { useState } from "react";
import { useT } from "@/context/LocaleContext";
import type { SerpImageResult } from "@/lib/serp";

type Props = {
  initialQuery: string;
  onClose: () => void;
} & (
  | {
      // Mode A: item already exists → server downloads directly to R2
      itemId: string;
      onPhotoAdded: (photoId: string, url: string) => void;
      onSelectUrl?: never;
    }
  | {
      // Mode B: item not yet created → return the URL to the caller for staging
      itemId?: never;
      onPhotoAdded?: never;
      onSelectUrl: (imageUrl: string) => void;
    }
);

export default function PhotoSearchModal({ itemId, initialQuery, onPhotoAdded, onSelectUrl, onClose }: Props) {
  const t = useT();
  const [query,     setQuery]     = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [results,   setResults]   = useState<SerpImageResult[]>([]);
  const [error,     setError]     = useState("");
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [searched,  setSearched]  = useState(false);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setError("");
    setSearching(true);
    setSearched(true);
    try {
      const endpoint = itemId
        ? `/api/items/${itemId}/search-photos?q=${encodeURIComponent(query.trim())}`
        : `/api/search-images?q=${encodeURIComponent(query.trim())}`;
      const res = await fetch(endpoint);
      const data = await res.json() as { results?: SerpImageResult[]; error?: string };
      if (!res.ok) { setError(t("searchPhotoError")); return; }
      setResults(data.results ?? []);
    } catch {
      setError(t("searchPhotoError"));
    } finally {
      setSearching(false);
    }
  }

  async function handlePick(imageUrl: string) {
    if (addingUrl) return;
    setAddingUrl(imageUrl);
    try {
      if (onSelectUrl) {
        // Mode B: pass URL back to caller (AddItemModal will proxy-download it)
        onSelectUrl(imageUrl);
        onClose();
        return;
      }
      // Mode A: server downloads directly to R2
      const res = await fetch(`/api/items/${itemId}/photos/from-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? "Failed");
        return;
      }
      const data = await res.json() as { id: string; url: string };
      onPhotoAdded!(data.id, data.url);
      onClose();
    } catch {
      setError("Failed to add photo");
    } finally {
      setAddingUrl(null);
    }
  }

  // Run initial search on first render
  useState(() => { void handleSearch(); });

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + search bar */}
        <div className="px-4 pt-5 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">{t("searchPhotoTitle")}</h2>
            <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPhotoPlaceholder")}
              className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="bg-[#2B4B8C] text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 shrink-0"
            >
              {searching ? "…" : t("searchPhotoButton")}
            </button>
          </form>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        {/* Results grid */}
        <div className="overflow-y-auto px-4 pb-6 flex-1">
          {searching && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">{t("searchPhotoSearching")}</p>
          )}

          {!searching && searched && results.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">{t("searchPhotoNoResults")}</p>
          )}

          {!searching && results.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {results.map((r) => {
                const isAdding = addingUrl === r.imageUrl;
                return (
                  <button
                    key={r.imageUrl}
                    onClick={() => handlePick(r.imageUrl)}
                    disabled={!!addingUrl}
                    className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 disabled:opacity-50 hover:ring-2 hover:ring-[#2B4B8C] transition-all"
                    title={r.title || r.source}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.thumbnailUrl}
                      alt={r.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback for blocked thumbnails (e.g. in China)
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                    {isAdding && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white text-xs">{t("searchPhotoAdding")}</span>
                      </div>
                    )}
                    {/* source label */}
                    {r.source && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/40 px-1 py-0.5">
                        <p className="text-[9px] text-white truncate">{r.source}</p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

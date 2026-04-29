"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoUploadArea, { type StagedPhoto } from "@/components/PhotoUploadArea";
import PhotoSearchModal from "@/components/PhotoSearchModal";
import { useT } from "@/context/LocaleContext";

type Props = {
  listId: string;
  secondaryLabel: string | null;
  onClose: () => void;
};

export default function AddItemModal({ listId, secondaryLabel, onClose }: Props) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [secondary, setSecondary] = useState("");
  const [reason, setReason] = useState("");
  const [photos,          setPhotos]          = useState<StagedPhoto[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [showPhotoSearch, setShowPhotoSearch] = useState(false);
  const [proxyLoading,    setProxyLoading]    = useState(false);

  const isDirty = name.trim() !== "" || secondary.trim() !== "" || reason.trim() !== "" || photos.length > 0;

  async function handleSearchPick(imageUrl: string) {
    if (photos.length >= 3) return;
    setProxyLoading(true);
    try {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const file = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });
      const previewUrl = URL.createObjectURL(blob);
      setPhotos((prev) => [...prev, { file, previewUrl }]);
    } finally {
      setProxyLoading(false);
    }
  }

  function handleDismiss() {
    if (isDirty && !confirm(t("unsavedChanges"))) return;
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, secondary: secondary || undefined, reason: reason || undefined }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) { setError(t("errorAddItem")); return; }

      if (photos.length > 0) {
        const uploadResults = await Promise.all(
          photos.map(async (p) => {
            const fd = new FormData();
            fd.append("file", p.file);
            const r = await fetch(`/api/items/${data.id}/photos`, { method: "POST", body: fd });
            if (!r.ok) {
              const body = await r.text().catch(() => r.status.toString());
              return `HTTP ${r.status}: ${body}`;
            }
            return null;
          })
        );
        const failures = uploadResults.filter(Boolean);
        if (failures.length > 0) {
          setError(`Photo upload failed — ${failures[0]}`);
          return;
        }
      }

      router.refresh();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={handleDismiss}>
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 pb-10 sm:pb-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{t("addItem")}</h2>
          <button onClick={handleDismiss} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("nameLabel")}</label>
            <input
              autoFocus required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>
          {secondaryLabel && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {secondaryLabel} <span className="text-gray-400 dark:text-gray-500 font-normal">({t("optional")})</span>
              </label>
              <input
                value={secondary} onChange={(e) => setSecondary(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("whyLabel")} <span className="text-gray-400 dark:text-gray-500 font-normal">({t("optional")})</span>
            </label>
            <textarea
              rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] resize-none dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>

          <div>
            <PhotoUploadArea photos={photos} onChange={setPhotos} />
            {photos.length < 3 && (
              <button
                type="button"
                onClick={() => setShowPhotoSearch(true)}
                disabled={proxyLoading}
                className="mt-2 flex items-center gap-1.5 text-xs text-[#2B4B8C] hover:opacity-70 disabled:opacity-40"
              >
                {proxyLoading ? "…" : <>🔍 {t("searchPhotoTitle")}</>}
              </button>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit" disabled={loading || !name.trim()}
            className="w-full bg-[#2B4B8C] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {loading ? (photos.length > 0 ? t("uploading") : t("adding")) : t("addItem")}
          </button>
        </form>
      </div>

      {showPhotoSearch && (
        <PhotoSearchModal
          initialQuery={name.trim() || "photo"}
          onSelectUrl={handleSearchPick}
          onClose={() => setShowPhotoSearch(false)}
        />
      )}
    </div>
  );
}

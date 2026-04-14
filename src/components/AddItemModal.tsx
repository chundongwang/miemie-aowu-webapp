"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoUploadArea, { type StagedPhoto } from "@/components/PhotoUploadArea";
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
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        await Promise.all(
          photos.map((p) => {
            const fd = new FormData();
            fd.append("file", p.file);
            return fetch(`/api/items/${data.id}/photos`, { method: "POST", body: fd });
          })
        );
      }

      router.refresh();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 pb-10 sm:pb-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{t("addItem")}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("nameLabel")}</label>
            <input
              autoFocus required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
          {secondaryLabel && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {secondaryLabel} <span className="text-gray-400 font-normal">({t("optional")})</span>
              </label>
              <input
                value={secondary} onChange={(e) => setSecondary(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("whyLabel")} <span className="text-gray-400 font-normal">({t("optional")})</span>
            </label>
            <textarea
              rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
            />
          </div>

          <PhotoUploadArea photos={photos} onChange={setPhotos} />

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit" disabled={loading || !name.trim()}
            className="w-full bg-black text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {loading ? (photos.length > 0 ? t("uploading") : t("adding")) : t("addItem")}
          </button>
        </form>
      </div>
    </div>
  );
}

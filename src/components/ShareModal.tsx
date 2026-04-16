"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/context/LocaleContext";

type Contact = { username: string; displayName: string };
type Props = { listId: string; onClose: () => void };

export default function ShareModal({ listId, onClose }: Props) {
  const t = useT();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.ok ? r.json() as Promise<Contact[]> : Promise.resolve([]))
      .then(setContacts)
      .catch(() => {});
  }, []);

  const isDirty = username.trim() !== "";

  function handleDismiss() {
    if (isDirty && !confirm(t("unsavedChanges"))) return;
    onClose();
  }

  async function doShare(name: string) {
    if (!name) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/lists/${listId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok || data.error) { setError(t("errorShare")); return; }
      router.refresh();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doShare(username.trim());
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={handleDismiss}>
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 pb-10 sm:pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold dark:text-gray-100">{t("shareList")}</h2>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contacts.map((c) => (
                <button
                  key={c.username}
                  type="button"
                  onClick={() => doShare(c.username)}
                  disabled={loading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:border-[#2B4B8C] hover:text-[#2B4B8C] dark:hover:border-[#2B4B8C] dark:hover:text-[#2B4B8C] transition-colors disabled:opacity-40"
                >
                  <span className="text-xs text-gray-400 dark:text-gray-500">@</span>{c.displayName}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("shareWithLabel")}</label>
            <input
              autoFocus={contacts.length === 0}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("sharePlaceholder")}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit" disabled={loading || !username.trim()}
            className="w-full bg-[#2B4B8C] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {loading ? t("sharing") : t("share")}
          </button>
        </form>
      </div>
    </div>
  );
}

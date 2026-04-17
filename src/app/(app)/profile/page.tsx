"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/context/LocaleContext";

export default function ProfilePage() {
  const t = useT();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((u) => { const user = u as { username: string; displayName: string };
        setUsername(user.username);
        setDisplayName(user.displayName);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (displayName.trim()) body.displayName = displayName.trim();
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        if (data.error?.includes("incorrect")) setError(t("errorWrongPassword"));
        else setError(t("errorSave"));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await fetch("/api/auth/me", { method: "DELETE" });
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push("/lists")}
            className="text-gray-400 hover:text-gray-600 text-xl pr-1"
          >
            ‹
          </button>
          <h1 className="text-lg font-semibold">{t("profile")}</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* username — read only */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("username")}</label>
            <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 select-all">
              @{username}
            </div>
          </div>

          {/* display name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("displayNameLabel")}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <hr className="border-gray-100" />

          {/* password change */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("currentPassword")}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("newPasswordLabel")}{" "}
              <span className="text-gray-400 font-normal">({t("leaveBlankToKeep")})</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={newPassword ? 8 : undefined}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">{t("profileSaved")}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-black text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
          >
            {saving ? t("saving") : t("saveChanges")}
          </button>
        </form>
      </main>

      <div className="max-w-lg mx-auto px-4 py-6 border-t border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-medium text-red-600 mb-3">{t("deleteAccount")}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t("deleteAccountConfirm")}</p>
        <input
          type="text"
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder="DELETE"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
        />
        <button
          onClick={handleDeleteAccount}
          disabled={deleteConfirm !== "DELETE" || deleting}
          className="w-full bg-red-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40 hover:bg-red-700"
        >
          {deleting ? t("deleting") : t("deleteAccountButton")}
        </button>
      </div>
    </div>
  );
}

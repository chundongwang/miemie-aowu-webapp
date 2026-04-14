"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/context/LocaleContext";

export default function RegisterPage() {
  const t = useT();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username, password,
          displayName: displayName || undefined,
          phone: phone || undefined,
        }),
      });
      let data: { error?: string } = {};
      try { data = await res.json() as { error?: string }; } catch { /* non-JSON response */ }
      if (!res.ok) {
        if (data.error?.includes("taken")) setError(t("errorUsernameTaken"));
        else if (data.error?.includes("pattern") || data.error?.includes("lowercase")) setError(t("errorUsernamePattern"));
        else if (data.error?.includes("8 char")) setError(t("errorPasswordLength"));
        else setError(t("errorRegister"));
        return;
      }
      router.push("/lists");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-center mb-8">{t("createAccount")}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("username")} <span className="text-gray-400 font-normal">({t("usernameHint")})</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[a-z0-9_]{3,30}"
              placeholder={t("usernamePlaceholder")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("displayNameLabel")} <span className="text-gray-400 font-normal">({t("displayNameHint")})</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("displayNamePlaceholder")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("phone")} <span className="text-gray-400 font-normal">({t("phoneHint")})</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("phonePlaceholder")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("password")}</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2B4B8C] text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? t("creatingAccount") : t("createAccount")}
          </button>
        </form>
        <p className="text-sm text-center text-gray-500 mt-6">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="text-[#2B4B8C] font-medium underline">{t("signIn")}</Link>
        </p>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import type { CheckIn } from "@/types";
import { useT } from "@/context/LocaleContext";

type Props = {
  itemId: string;
  itemName: string;
  onClose: () => void;
  onCheckInCreated: (newCount: number) => void;
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function CheckInModal({ itemId, itemName, onClose, onCheckInCreated }: Props) {
  const t = useT();
  const [checkIns, setCheckIns]     = useState<CheckIn[]>([]);
  const [loading, setLoading]       = useState(true);
  const [note, setNote]             = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [gettingLoc, setGettingLoc] = useState(false);
  const [locError, setLocError]     = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  useEffect(() => {
    fetch(`/api/items/${itemId}/checkins`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setCheckIns(data as CheckIn[]);
        setLoading(false);
      });
  }, [itemId]);

  async function handleCheckIn() {
    setGettingLoc(true);
    setLocError(null);
    let latitude: number | undefined;
    let longitude: number | undefined;

    // Try to get GPS; proceed without it if denied/unavailable
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 8000,
          maximumAge: 60_000,
          enableHighAccuracy: false,
        });
      });
      latitude  = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch {
      setLocError(t("checkInLocationDenied"));
    }

    setGettingLoc(false);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/items/${itemId}/checkins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude, note: note.trim() || undefined }),
      });

      if (res.ok) {
        const data = await res.json() as CheckIn & { checkInCount: number };
        setCheckIns((prev) => [data, ...prev]);
        onCheckInCreated(data.checkInCount);
        setSuccess(true);
        setNote("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("checkInTitle")}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{itemName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Check-in form */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          {success ? (
            <p className="text-green-600 dark:text-green-400 text-sm font-medium text-center py-1">
              ✓ {t("checkInSuccess")}
            </p>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("checkInNotePlaceholder")}
                maxLength={200}
                disabled={submitting || gettingLoc}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2B4B8C] disabled:opacity-50"
              />
              {locError && (
                <p className="text-xs text-amber-500">{locError} — {t("checkIn")} will be recorded without location</p>
              )}
              <button
                onClick={handleCheckIn}
                disabled={submitting || gettingLoc}
                className="w-full bg-[#2B4B8C] text-white rounded-xl py-2.5 text-sm font-medium hover:bg-[#1e3a70] disabled:opacity-50 transition-colors"
              >
                {gettingLoc
                  ? t("checkInGettingLocation")
                  : submitting
                  ? t("checkInSubmitting")
                  : `📍 ${t("checkInHere")}`}
              </button>
            </div>
          )}
        </div>

        {/* Check-in list */}
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {loading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">…</p>
          ) : checkIns.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t("checkInEmpty")}</p>
          ) : (
            <ul className="space-y-3">
              {checkIns.map((ci) => (
                <li key={ci.id} className="flex items-start gap-2">
                  <span className="text-base mt-0.5">📍</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {ci.userDisplayName}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {timeAgo(ci.createdAt)}
                      </span>
                      {ci.latitude != null && (
                        <a
                          href={`https://maps.google.com/?q=${ci.latitude},${ci.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#2B4B8C] dark:text-blue-400 hover:underline ml-auto shrink-0"
                        >
                          map
                        </a>
                      )}
                    </div>
                    {ci.note && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ci.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

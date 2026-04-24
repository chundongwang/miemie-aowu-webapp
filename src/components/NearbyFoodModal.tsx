"use client";

import { useEffect, useRef, useState } from "react";

interface FoodResult {
  id: string;
  name: string;
  address: string;
  distance: number;
  rating: string;
  cost: string;
  tel: string;
}

interface SavedCenter {
  address: string;
  lat: number;
  lng: number;
}

interface Props {
  listId: string;
  secondaryLabel?: string | null;
  onClose: () => void;
}

const RADII = [
  { label: "500m", value: 500 },
  { label: "1km",  value: 1000 },
  { label: "2km",  value: 2000 },
  { label: "5km",  value: 5000 },
];

const QUICK_KEYWORDS = ["早餐", "午饭", "晚饭", "咖啡", "奶茶", "火锅", "烧烤"];
const STORAGE_KEY = "miemie_food_center";

function loadSavedCenter(): SavedCenter | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedCenter) : null;
  } catch { return null; }
}

function saveCenterToStorage(center: SavedCenter) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(center)); } catch { /* ignore */ }
}

export default function NearbyFoodModal({ listId, secondaryLabel, onClose }: Props) {
  // Active search center (either GPS or saved/geocoded address)
  const [center, setCenter]         = useState<SavedCenter | null>(null);
  const [centerSource, setCenterSource] = useState<"gps" | "saved" | null>(null);

  // GPS state
  const [gpsState, setGpsState]     = useState<"idle" | "locating" | "ok" | "denied">("idle");

  // Address input state
  const [addressInput, setAddressInput] = useState("");
  const [geocoding, setGeocoding]   = useState(false);
  const [geocodeError, setGeocodeError] = useState("");
  const [showAddressInput, setShowAddressInput] = useState(false);

  // Search
  const [keywords, setKeywords]     = useState("");
  const [radius, setRadius]         = useState(2000);
  const [searching, setSearching]   = useState(false);
  const [results, setResults]       = useState<FoodResult[]>([]);
  const [searched, setSearched]     = useState(false);

  // Item adding
  const [added, setAdded]           = useState<Set<string>>(new Set());
  const [adding, setAdding]         = useState<string | null>(null);

  const addressInputRef = useRef<HTMLInputElement>(null);
  const keywordInputRef = useRef<HTMLInputElement>(null);

  // On mount: load saved center or start GPS
  useEffect(() => {
    const saved = loadSavedCenter();
    if (saved) {
      setCenter(saved);
      setCenterSource("saved");
      setAddressInput(saved.address);
      setTimeout(() => keywordInputRef.current?.focus(), 100);
    } else {
      startGps();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startGps() {
    if (!navigator.geolocation) { setGpsState("denied"); return; }
    setGpsState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: SavedCenter = { address: "GPS location", lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(c);
        setCenterSource("gps");
        setGpsState("ok");
        setTimeout(() => keywordInputRef.current?.focus(), 100);
      },
      () => {
        setGpsState("denied");
        setShowAddressInput(true);
        setTimeout(() => addressInputRef.current?.focus(), 100);
      },
      { timeout: 8000 }
    );
  }

  async function geocodeAddress() {
    const addr = addressInput.trim();
    if (!addr || geocoding) return;
    setGeocoding(true);
    setGeocodeError("");
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
      const data = await res.json() as { lat?: number; lng?: number; formattedAddress?: string; error?: string };
      if (!res.ok || data.error || !data.lat) {
        setGeocodeError(data.error === "Address not found" ? "找不到该地址，请尝试更具体的描述" : "定位失败，请重试");
        return;
      }
      const c: SavedCenter = { address: data.formattedAddress ?? addr, lat: data.lat, lng: data.lng! };
      setCenter(c);
      setCenterSource("saved");
      setAddressInput(c.address);
      saveCenterToStorage(c);
      setShowAddressInput(false);
      setTimeout(() => keywordInputRef.current?.focus(), 100);
    } finally {
      setGeocoding(false);
    }
  }

  async function search() {
    if (!center || searching) return;
    const kw = keywords.trim() || "餐厅";
    setSearching(true);
    setSearched(false);
    try {
      const res = await fetch(
        `/api/search-food?lat=${center.lat}&lng=${center.lng}&keywords=${encodeURIComponent(kw)}&radius=${radius}`
      );
      const data = await res.json() as { results?: FoodResult[]; error?: string };
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }

  async function addItem(place: FoodResult) {
    if (adding) return;
    setAdding(place.id);
    const ratingStr   = place.rating ? `⭐ ${place.rating}` : "";
    const costStr     = place.cost   ? `~¥${place.cost}/人` : "";
    const reasonParts = [place.distance ? `${place.distance < 1000 ? `${place.distance}m` : `${(place.distance / 1000).toFixed(1)}km`}` : "", ratingStr, costStr].filter(Boolean);
    await fetch(`/api/lists/${listId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: place.name,
        secondary: secondaryLabel ? place.address : undefined,
        reason: reasonParts.join(" · "),
      }),
    });
    setAdded((prev) => new Set([...prev, place.id]));
    setAdding(null);
  }

  const ready = !!center;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center gap-3">
        <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl pr-1">✕</button>
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">Find Nearby Food</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">搜索附近餐厅</p>
        </div>
      </header>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3">

        {/* Location center row */}
        <div className="space-y-2">
          {!showAddressInput ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">搜索中心</span>
              {gpsState === "locating" && (
                <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-[#2B4B8C] animate-spin" />
                  定位中…
                </span>
              )}
              {ready && (
                <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">
                  {centerSource === "gps" ? "📍 " : "📌 "}{center!.address}
                </span>
              )}
              <button
                onClick={() => { setShowAddressInput(true); setTimeout(() => addressInputRef.current?.focus(), 50); }}
                className="text-xs text-[#2B4B8C] dark:text-blue-400 shrink-0"
              >
                {ready ? "修改" : "输入地址"}
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  ref={addressInputRef}
                  type="text"
                  value={addressInput}
                  onChange={(e) => { setAddressInput(e.target.value); setGeocodeError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && geocodeAddress()}
                  placeholder="输入地址，如：北京市朝阳区望京"
                  className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
                />
                <button
                  onClick={geocodeAddress}
                  disabled={!addressInput.trim() || geocoding}
                  className="bg-[#2B4B8C] text-white text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-40 shrink-0"
                >
                  {geocoding ? "…" : "保存"}
                </button>
              </div>
              {geocodeError && <p className="text-xs text-red-500">{geocodeError}</p>}
              <div className="flex items-center gap-3">
                {ready && (
                  <button onClick={() => { setShowAddressInput(false); }} className="text-xs text-gray-400 dark:text-gray-500">
                    取消
                  </button>
                )}
                <button
                  onClick={() => { setAddressInput(""); setGeocodeError(""); startGps(); setShowAddressInput(false); }}
                  className="text-xs text-[#2B4B8C] dark:text-blue-400 flex items-center gap-1"
                >
                  📍 使用GPS定位
                </button>
              </div>
            </div>
          )}
          {gpsState === "denied" && !showAddressInput && (
            <p className="text-xs text-amber-600 dark:text-amber-400">无法获取GPS，请输入地址</p>
          )}
        </div>

        {/* Keyword input */}
        <div className="flex gap-2">
          <input
            ref={keywordInputRef}
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="早餐、火锅、咖啡…"
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
            disabled={!ready}
          />
          <button
            onClick={search}
            disabled={!ready || searching}
            className="bg-[#2B4B8C] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40"
          >
            {searching ? "…" : "搜索"}
          </button>
        </div>

        {/* Quick keyword chips */}
        <div className="flex gap-2 flex-wrap">
          {QUICK_KEYWORDS.map((kw) => (
            <button
              key={kw}
              onClick={() => setKeywords(kw)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                keywords === kw
                  ? "bg-[#2B4B8C] text-white border-[#2B4B8C]"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#2B4B8C] hover:text-[#2B4B8C]"
              }`}
            >
              {kw}
            </button>
          ))}
        </div>

        {/* Radius selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">范围</span>
          <div className="flex gap-1.5">
            {RADII.map((r) => (
              <button
                key={r.value}
                onClick={() => setRadius(r.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  radius === r.value
                    ? "bg-[#2B4B8C] text-white border-[#2B4B8C]"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#2B4B8C]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {searching && (
          <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">搜索中…</div>
        )}
        {!searching && searched && results.length === 0 && (
          <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
            附近没有找到结果，试试换个关键词或扩大范围
          </div>
        )}
        {!searching && results.map((place) => {
          const isAdded  = added.has(place.id);
          const isAdding = adding === place.id;
          return (
            <div key={place.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 flex items-start gap-3 shadow-sm dark:shadow-none">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{place.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{place.address}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {place.distance > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      📍 {place.distance < 1000 ? `${place.distance}m` : `${(place.distance / 1000).toFixed(1)}km`}
                    </span>
                  )}
                  {place.rating && <span className="text-xs text-amber-500">⭐ {place.rating}</span>}
                  {place.cost && <span className="text-xs text-gray-400 dark:text-gray-500">~¥{place.cost}/人</span>}
                </div>
              </div>
              <button
                onClick={() => addItem(place)}
                disabled={isAdded || !!isAdding}
                className={`shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  isAdded
                    ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800"
                    : "bg-[#2B4B8C] text-white hover:bg-[#1e3a70] disabled:opacity-40"
                }`}
              >
                {isAdded ? "✓ Added" : isAdding ? "…" : "+ Add"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="pb-[env(safe-area-inset-bottom)]" />
    </div>
  );
}

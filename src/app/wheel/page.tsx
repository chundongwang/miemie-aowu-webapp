"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/context/LocaleContext";

const COLORS = ["#FF6B6B", "#FF9F43", "#FECA57", "#1DD1A1", "#A29BFE", "#FD79A8", "#74B9FF", "#55EFC4", "#FDCB6E", "#E17055"];
const SIZE = 300;

type Food = { id: string; emoji: string; zh: string; en: string };
type Phase = "idle" | "spinning" | "result";
type NearbyState = "idle" | "locating" | "searching" | "done" | "error";
type NearbyResult = { id: string; name: string; address: string; lat: number; lng: number; distance: number; rating: string; cost: string; tel: string; openTime: string };

export default function WheelPage() {
  const router = useRouter();
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef(0);
  const gpsAbortedRef = useRef(false);
  const lastSearchRef = useRef<{ food: Food; coords: { lat: number; lng: number }; addr: string } | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [winner, setWinner] = useState<Food | null>(null);
  // Edit panel
  const [showEdit, setShowEdit] = useState(false);
  const [newEmoji, setNewEmoji] = useState("🍽️");
  const [newZh, setNewZh] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editEmoji, setEditEmoji] = useState("");
  const [editZh, setEditZh] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<NearbyResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const [nearbyState, setNearbyState] = useState<NearbyState>("idle");
  const [nearbyResults, setNearbyResults] = useState<NearbyResult[]>([]);
  const [searchAddr, setSearchAddr] = useState("");
  const [radius, setRadius] = useState(1000);
  const [page, setPage] = useState(1);
  const [savedCenter, setSavedCenter] = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [showAddrInput, setShowAddrInput] = useState(false);
  const [addrInput, setAddrInput] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeErr, setGeocodeErr] = useState("");

  // Load saved location
  useEffect(() => {
    try {
      const raw = localStorage.getItem("miemie_food_center");
      if (raw) {
        const c = JSON.parse(raw) as { address: string; lat: number; lng: number };
        setSavedCenter(c);
        setAddrInput(c.address);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch foods from DB
  useEffect(() => {
    fetch("/api/wheel/items")
      .then((r) => r.json() as Promise<Food[]>)
      .then(setFoods);
  }, []);

  // Redraw canvas whenever foods changes
  useEffect(() => {
    if (foods.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width = SIZE + "px";
    canvas.style.height = SIZE + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    drawWheel(ctx, foods);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foods]);

  function drawWheel(ctx: CanvasRenderingContext2D, items: Food[]) {
    const n = items.length;
    if (n === 0) return;
    const seg = (2 * Math.PI) / n;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const r = SIZE / 2 - 6;

    for (let i = 0; i < n; i++) {
      const start = -Math.PI / 2 + i * seg;
      const end = start + seg;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const mid = start + seg / 2;
      const tr = r * 0.68;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * tr, cy + Math.sin(mid) * tr);
      ctx.rotate(mid + Math.PI / 2);
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(items[i].emoji, 0, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🍜", SIZE / 2, SIZE / 2);
  }

  function spin() {
    if (phase === "spinning" || foods.length === 0) return;
    setPhase("spinning");
    setWinner(null);

    const n = foods.length;
    const seg = (2 * Math.PI) / n;
    const winnerIndex = Math.floor(Math.random() * n);
    const extraSpins = (6 + Math.random() * 4) * 2 * Math.PI;

    const targetMod = (2 * Math.PI - (winnerIndex + 0.5) * seg + 2 * Math.PI) % (2 * Math.PI);
    const currentMod = rotRef.current % (2 * Math.PI);
    let delta = targetMod - currentMod;
    if (delta < 0) delta += 2 * Math.PI;

    const targetRot = rotRef.current + extraSpins + delta;
    rotRef.current = targetRot;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.style.transition = "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)";
    wrapper.style.transform = `rotate(${targetRot}rad)`;

    wrapper.addEventListener("transitionend", () => {
      setWinner(foods[winnerIndex]);
      setPhase("result");
    }, { once: true });
  }

  function reset() {
    const wrapper = wrapperRef.current;
    if (wrapper) wrapper.style.transition = "none";
    setWinner(null);
    setPhase("idle");
    setNearbyState("idle");
    setNearbyResults([]);
    setSearchAddr("");
    setShowAddrInput(false);
    setGeocodeErr("");
    setPage(1);
    lastSearchRef.current = null;
    setCommentary(null);
    setCommentaryLoading(false);
  }

  async function doSearch(food: Food, coords: { lat: number; lng: number }, addr: string, r?: number) {
    const searchRadius = r ?? radius;
    lastSearchRef.current = { food, coords, addr };
    setSearchAddr(addr);
    setShowAddrInput(false);
    setNearbyState("searching");
    setPage(1);
    try {
      const res = await fetch(
        `/api/search-food?lat=${coords.lat}&lng=${coords.lng}&keywords=${encodeURIComponent(food.zh)}&radius=${searchRadius}`
      );
      const data = await res.json() as { results?: NearbyResult[] };
      // Sort by rating descending; unrated go to bottom
      const sorted = [...(data.results ?? [])].sort(
        (a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0)
      );
      setNearbyResults(sorted);
      setNearbyState("done");
    } catch {
      setNearbyState("error");
    }
  }

  async function addItem() {
    if (!newZh.trim() || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/wheel/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji: newEmoji, zh: newZh.trim() }),
      });
      if (res.ok) {
        const item = await res.json() as Food;
        setFoods((prev) => [...prev, item]);
        setNewZh("");
        setNewEmoji("🍽️");
      }
    } finally {
      setAdding(false);
    }
  }

  function startEditItem(f: Food) {
    setEditingItemId(f.id);
    setEditEmoji(f.emoji);
    setEditZh(f.zh);
  }

  async function saveEditItem(id: string) {
    if (!editZh.trim() || savingId) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/wheel/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji: editEmoji, zh: editZh.trim() }),
      });
      if (res.ok) {
        const updated = await res.json() as Food;
        setFoods((prev) => prev.map((f) => f.id === id ? updated : f));
        setEditingItemId(null);
      }
    } finally {
      setSavingId(null);
    }
  }

  async function removeItem(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/wheel/items/${id}`, { method: "DELETE" });
      if (res.ok) setFoods((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function fetchCommentary(food: Food) {
    setCommentary(null);
    setCommentaryLoading(true);
    try {
      const body: Record<string, unknown> = { food };
      if (savedCenter) body.location = { lat: savedCenter.lat, lng: savedCenter.lng };
      const res = await fetch("/api/wheel/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json() as { text?: string };
        setCommentary(data.text ?? null);
      }
    } catch { /* silent — commentary is decorative */ } finally {
      setCommentaryLoading(false);
    }
  }

  // Trigger commentary whenever a new winner is set
  useEffect(() => {
    if (winner && phase === "result") fetchCommentary(winner);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner]);

  function changeRadius(r: number) {
    setRadius(r);
    if (lastSearchRef.current) {
      const { food, coords, addr } = lastSearchRef.current;
      doSearch(food, coords, addr, r);
    }
  }

  function searchNearby(food: Food) {
    setNearbyResults([]);
    if (savedCenter) {
      doSearch(food, savedCenter, savedCenter.address);
      return;
    }
    // No saved center — show address input immediately AND try GPS in parallel
    gpsAbortedRef.current = false;
    setShowAddrInput(true);
    setNearbyState("locating"); // subtle indicator GPS is trying
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (gpsAbortedRef.current) return; // user already searched via address
        setShowAddrInput(false);
        doSearch(food, { lat: pos.coords.latitude, lng: pos.coords.longitude }, "GPS location");
      },
      () => {
        if (gpsAbortedRef.current) return;
        setNearbyState("idle"); // GPS failed, address input already visible
      },
      { timeout: 12000 }
    );
  }

  async function geocodeAndSearch(food: Food) {
    const addr = addrInput.trim();
    if (!addr || geocoding) return;
    gpsAbortedRef.current = true; // cancel pending GPS callback
    setGeocoding(true);
    setGeocodeErr("");
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
      const data = await res.json() as { lat?: number; lng?: number; formattedAddress?: string; error?: string };
      if (!data.lat) { setGeocodeErr("找不到该地址，请重试"); setGeocoding(false); return; }
      const center = { address: data.formattedAddress ?? addr, lat: data.lat, lng: data.lng! };
      localStorage.setItem("miemie_food_center", JSON.stringify(center));
      setSavedCenter(center);
      setAddrInput(center.address);
      setShowAddrInput(false);
      setGeocoding(false);
      await doSearch(food, center, center.address);
    } catch {
      setGeocodeErr("定位失败，请重试");
      setGeocoding(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <header className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center gap-3 z-10">
        <button
          onClick={() => router.back()}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl pr-1"
        >
          ‹
        </button>
        <div className="flex-1">
          <h1 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">今天吃什么？</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500">What to eat today?</p>
        </div>
        <button
          onClick={() => setShowEdit((v) => !v)}
          className={`text-sm px-2 py-1 rounded-lg transition-colors ${showEdit ? "bg-[#2B4B8C] text-white" : "text-gray-400 dark:text-gray-500 hover:text-gray-600"}`}
        >
          ✏️
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center gap-6 px-4 py-6 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>

        {/* Wheel + pointer */}
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          {/* Fixed top pointer */}
          <div
            className="absolute left-1/2 z-10 pointer-events-none"
            style={{
              top: -4,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: "22px solid #2B4B8C",
              filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.2))",
            }}
          />
          {/* Rotating wheel wrapper */}
          <div ref={wrapperRef} style={{ width: SIZE, height: SIZE }}>
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Result card */}
        {winner && phase === "result" && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl px-8 py-5 text-center shadow-md w-full max-w-xs">
            <p className="text-5xl mb-2">{winner.emoji}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{winner.zh}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{winner.en}</p>
            {commentaryLoading && (
              <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse mt-3 text-center">💭 …</p>
            )}
            {commentary && !commentaryLoading && (
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-3 text-left">{commentary}</p>
            )}
            {/* Location + search controls */}
            <div className="mt-4 w-full space-y-2">

              {/* Address input — only when results aren't shown yet (results section handles it when done) */}
              {showAddrInput && nearbyState !== "done" && (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={addrInput}
                      onChange={(e) => { setAddrInput(e.target.value); setGeocodeErr(""); }}
                      onKeyDown={(e) => e.key === "Enter" && geocodeAndSearch(winner)}
                      placeholder="输入地址…"
                      className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
                    />
                    <button
                      onClick={() => geocodeAndSearch(winner)}
                      disabled={!addrInput.trim() || geocoding}
                      className="bg-[#2B4B8C] text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 shrink-0"
                    >
                      {geocoding ? "…" : "保存"}
                    </button>
                  </div>
                  {geocodeErr && <p className="text-xs text-red-500">{geocodeErr}</p>}
                  <div className="flex gap-3 text-xs">
                    {savedCenter && <button onClick={() => { setShowAddrInput(false); setGeocodeErr(""); }} className="text-gray-400 dark:text-gray-500">取消</button>}
                    <button
                      onClick={async () => {
                        setShowAddrInput(false);
                        setSavedCenter(null);
                        localStorage.removeItem("miemie_food_center");
                        await searchNearby(winner);
                      }}
                      className="text-[#2B4B8C] dark:text-blue-400"
                    >
                      📍 使用GPS定位
                    </button>
                  </div>
                </div>
              )}

              {/* Search button */}
              {nearbyState === "idle" && !showAddrInput && (
                <div className="flex gap-2">
                  <button
                    onClick={() => searchNearby(winner)}
                    className="flex-1 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-600 transition-colors"
                  >
                    📍 {locale === "zh" ? "附近哪里有？" : "Find Nearby"}
                  </button>
                  <button
                    onClick={() => setShowAddrInput(true)}
                    title="修改位置"
                    className="px-3 py-2 text-gray-400 dark:text-gray-500 hover:text-[#2B4B8C] dark:hover:text-blue-400 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition-colors text-base"
                  >
                    📌
                  </button>
                </div>
              )}

              {/* GPS trying in background */}
              {nearbyState === "locating" && showAddrInput && (
                <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-[#2B4B8C] animate-spin shrink-0" />
                  GPS定位中，或直接输入地址
                </p>
              )}
              {/* Searching spinner */}
              {nearbyState === "searching" && (
                <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1.5 py-1">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-[#2B4B8C] animate-spin" />
                  {`搜索 ${winner.zh} 中…`}
                </p>
              )}

              {nearbyState === "error" && (
                <p className="text-xs text-red-500 text-center">搜索失败，请重试</p>
              )}
            </div>
          </div>
        )}

        {/* Nearby results */}
        {(nearbyState === "done" || nearbyState === "searching") && (
          <div className="w-full max-w-xs space-y-2">
            {/* Address editor inline (when editing from results) */}
            {showAddrInput && nearbyState === "done" && winner && (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addrInput}
                    onChange={(e) => { setAddrInput(e.target.value); setGeocodeErr(""); }}
                    onKeyDown={(e) => e.key === "Enter" && geocodeAndSearch(winner)}
                    placeholder="输入新地址…"
                    className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
                    autoFocus
                  />
                  <button
                    onClick={() => geocodeAndSearch(winner)}
                    disabled={!addrInput.trim() || geocoding}
                    className="bg-[#2B4B8C] text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 shrink-0"
                  >
                    {geocoding ? "…" : "保存+搜索"}
                  </button>
                </div>
                {geocodeErr && <p className="text-xs text-red-500">{geocodeErr}</p>}
                <div className="flex gap-3 text-xs">
                  <button onClick={() => { setShowAddrInput(false); setGeocodeErr(""); }} className="text-gray-400 dark:text-gray-500">取消</button>
                  <button
                    onClick={() => {
                      setShowAddrInput(false);
                      setSavedCenter(null);
                      localStorage.removeItem("miemie_food_center");
                      if (winner) searchNearby(winner);
                    }}
                    className="text-[#2B4B8C] dark:text-blue-400"
                  >
                    📍 GPS定位
                  </button>
                </div>
              </div>
            )}

            {/* Radius selector + result count */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {nearbyState === "done"
                    ? `📍 ${searchAddr} · ${nearbyResults.length} 家`
                    : <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-[#2B4B8C] animate-spin" />搜索中…</span>
                  }
                </p>
                {nearbyState === "done" && !showAddrInput && (
                  <button
                    onClick={() => setShowAddrInput(true)}
                    className="text-xs text-[#2B4B8C] dark:text-blue-400 shrink-0"
                  >
                    修改
                  </button>
                )}
              </div>
              <div className="flex gap-1">
                {[1000, 2000, 5000].map((r) => (
                  <button
                    key={r}
                    onClick={() => changeRadius(r)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      radius === r
                        ? "bg-[#2B4B8C] text-white border-[#2B4B8C]"
                        : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-[#2B4B8C]"
                    }`}
                  >
                    {r < 1000 ? `${r}m` : `${r / 1000}km`}
                  </button>
                ))}
              </div>
            </div>

            {nearbyResults.slice(0, page * 5).map((place) => (
              <button
                key={place.id}
                onClick={() => setSelectedPlace(place)}
                className="w-full bg-white dark:bg-gray-800 rounded-xl px-4 py-3 shadow-sm text-left hover:shadow-md dark:hover:bg-gray-750 transition-shadow active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{place.name}</p>
                  <span className="text-gray-300 dark:text-gray-600 text-base shrink-0">›</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{place.address}</p>
                <div className="flex gap-2 mt-1">
                  {place.distance > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {place.distance < 1000 ? `${place.distance}m` : `${(place.distance / 1000).toFixed(1)}km`}
                    </span>
                  )}
                  {place.rating && <span className="text-xs text-amber-500">⭐ {place.rating}</span>}
                  {place.cost && <span className="text-xs text-gray-400 dark:text-gray-500">~¥{place.cost}/人</span>}
                </div>
              </button>
            ))}

            {nearbyState === "done" && nearbyResults.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">附近暂无相关餐厅，试试扩大范围</p>
            )}

            {nearbyState === "done" && nearbyResults.length > page * 5 && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="w-full py-2 text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                查看更多 · 还有 {nearbyResults.length - page * 5} 家
              </button>
            )}
          </div>
        )}

        {/* Spin / reset button */}
        <button
          onClick={phase === "result" ? reset : spin}
          disabled={phase === "spinning" || foods.length === 0}
          className="bg-[#2B4B8C] text-white font-bold text-xl px-12 py-4 rounded-full shadow-lg disabled:opacity-40 active:scale-95 transition-transform hover:bg-[#1e3a70]"
        >
          {phase === "result"
            ? (locale === "zh" ? "再转一次" : "Spin Again")
            : (locale === "zh" ? "转！" : "SPIN!")}
        </button>

        {/* Edit panel */}
        {showEdit && (
          <div className="w-full max-w-xs bg-white dark:bg-gray-800 rounded-2xl shadow-md overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">编辑菜单 · {foods.length} 项</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">最少保留 3 项</p>
            </div>

            {/* Item list */}
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-72 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
              {foods.map((f) => {
                const isEditing = editingItemId === f.id;
                const isSaving = savingId === f.id;
                return (
                  <li key={f.id} className="px-4 py-2.5">
                    {isEditing ? (
                      <div className="space-y-1.5">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editEmoji}
                            onChange={(e) => setEditEmoji(e.target.value)}
                            maxLength={2}
                            className="w-12 text-center rounded-lg border border-[#2B4B8C] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 py-1.5 text-lg focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
                          />
                          <input
                            type="text"
                            value={editZh}
                            onChange={(e) => setEditZh(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEditItem(f.id); if (e.key === "Escape") setEditingItemId(null); }}
                            autoFocus
                            className="flex-1 rounded-lg border border-[#2B4B8C] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
                          />
                        </div>
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => saveEditItem(f.id)}
                            disabled={!editZh.trim() || isSaving}
                            className="bg-[#2B4B8C] text-white text-xs font-medium px-3 py-1 rounded-lg disabled:opacity-40"
                          >
                            {isSaving ? "AI翻译中…" : "保存"}
                          </button>
                          <button
                            onClick={() => setEditingItemId(null)}
                            className="text-xs text-gray-400 dark:text-gray-500"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-lg shrink-0">{f.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{f.zh}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{f.en}</p>
                        </div>
                        <button
                          onClick={() => startEditItem(f)}
                          className="text-gray-400 dark:text-gray-500 hover:text-[#2B4B8C] dark:hover:text-blue-400 text-xs shrink-0"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => removeItem(f.id)}
                          disabled={foods.length <= 3 || deletingId === f.id}
                          className="text-gray-300 dark:text-gray-600 hover:text-red-400 disabled:opacity-30 text-lg leading-none shrink-0"
                        >
                          {deletingId === f.id ? "…" : "×"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Add form */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  maxLength={2}
                  className="w-12 text-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 py-1.5 text-lg focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
                />
                <input
                  type="text"
                  value={newZh}
                  onChange={(e) => setNewZh(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                  placeholder="菜名，如：麻婆豆腐"
                  className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]"
                />
                <button
                  onClick={addItem}
                  disabled={!newZh.trim() || adding}
                  className="bg-[#2B4B8C] text-white text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 shrink-0"
                >
                  {adding ? "…" : "添加"}
                </button>
              </div>
              {adding && <p className="text-xs text-gray-400 dark:text-gray-500">AI 翻译中…</p>}
            </div>
          </div>
        )}
      </main>

      <div className="pb-[env(safe-area-inset-bottom)]" />

      {/* Place detail modal */}
      {selectedPlace && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 dark:bg-black/60"
          onClick={() => { setSelectedPlace(null); setCopied(false); }}
        >
          <div
            className="bg-white dark:bg-gray-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl px-6 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-snug">{selectedPlace.name}</h2>
              <button
                onClick={() => { setSelectedPlace(null); setCopied(false); }}
                className="text-gray-400 dark:text-gray-500 text-2xl leading-none shrink-0 mt-0.5"
              >
                ×
              </button>
            </div>

            {/* Stats row */}
            <div className="flex gap-4 text-sm">
              {selectedPlace.distance > 0 && (
                <span className="text-gray-500 dark:text-gray-400">
                  📍 {selectedPlace.distance < 1000 ? `${selectedPlace.distance}m` : `${(selectedPlace.distance / 1000).toFixed(1)}km`}
                </span>
              )}
              {selectedPlace.rating && <span className="text-amber-500">⭐ {selectedPlace.rating}</span>}
              {selectedPlace.cost && <span className="text-gray-500 dark:text-gray-400">~¥{selectedPlace.cost}/人</span>}
            </div>

            {/* Address + navigate */}
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">{selectedPlace.address}</p>
              {selectedPlace.lat !== 0 && (
                <a
                  href={`https://maps.apple.com/?daddr=${selectedPlace.lat},${selectedPlace.lng}&q=${encodeURIComponent(selectedPlace.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm font-medium text-white bg-[#2B4B8C] px-4 py-2.5 rounded-xl w-full justify-center hover:bg-[#1e3a70]"
                >
                  🗺 导航到这里
                </a>
              )}
            </div>

            {/* Phone */}
            {selectedPlace.tel && (
              <a
                href={`tel:${selectedPlace.tel.split(";")[0].trim()}`}
                className="flex items-center gap-2 text-sm text-[#2B4B8C] dark:text-blue-400"
              >
                📞 {selectedPlace.tel.split(";")[0].trim()}
              </a>
            )}

            {/* Open time */}
            {selectedPlace.openTime && (
              <p className="text-xs text-gray-400 dark:text-gray-500">🕐 {selectedPlace.openTime}</p>
            )}

            {/* Copy name */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(selectedPlace.name).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="w-full py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {copied ? "✓ 已复制" : "📋 复制餐厅名称"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { ListDetail, Item, Comment } from "@/types";
import ItemList from "@/components/ItemList";
import AddItemModal from "@/components/AddItemModal";
import EditItemModal from "@/components/EditItemModal";
import TextItemEditor from "@/components/TextItemEditor";
import ShareModal from "@/components/ShareModal";
import EditListModal from "@/components/EditListModal";
import Lightbox from "@/components/Lightbox";
import CommentThread from "@/components/CommentThread";
import BulkImportModal from "@/components/BulkImportModal";
import NearbyFoodModal from "@/components/NearbyFoodModal";
import PullIndicator from "@/components/PullIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useT } from "@/context/LocaleContext";

type Me = { id: string; displayName: string };

export default function ListDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [list, setList]         = useState<ListDetail | null>(null);
  const [me, setMe]             = useState<Me | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showAddItem,  setShowAddItem]  = useState(false);
  const [showShare,    setShowShare]    = useState(false);
  const [showEditList, setShowEditList] = useState(false);
  const [showImport,   setShowImport]   = useState(false);
  const [showNearby,   setShowNearby]   = useState(false);
  const [editingItem,  setEditingItem]  = useState<Item | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "waterfall">("list");
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [comments,    setComments]    = useState<Comment[]>([]);
  const [reactionTotals, setReactionTotals] = useState({ miemie: 0, aowu: 0 });

  function load() {
    Promise.all([
      fetch(`/api/lists/${id}`).then(async (r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        if (!r.ok) return null;
        return r.json() as Promise<ListDetail>;
      }),
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)) as Promise<Me | null>,
    ]).then(([l, user]) => {
      setList(l);
      setMe(user);
      if (l) {
        setReactionTotals({
          miemie: l.items.reduce((s, i) => s + i.miemieCount, 0),
          aowu:   l.items.reduce((s, i) => s + i.aowuCount,   0),
        });
      }
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { indicatorRef, isRefreshing: pullRefreshing } = usePullToRefresh(async () => { load(); });

  // Backfill thumbnails for existing photos that don't have one yet
  useEffect(() => {
    if (!list || !me) return;
    const missing = list.items.flatMap((item) =>
      item.photos.filter((p) => !p.thumbUrl).map((p) => ({ itemId: item.id, photo: p }))
    );
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const { itemId, photo } of missing) {
        if (cancelled) break;
        try {
          // Fetch the full image
          const res = await fetch(photo.url);
          if (!res.ok) continue;
          const contentType = res.headers.get("content-type") ?? "";
          const blob = await res.blob();
          const { compressToJpeg, generateThumbnail } = await import("@/lib/imageUtils");
          // For HEIC/HEIF: createImageBitmap extracts the still frame (drops video),
          // compresses to JPEG — then generate thumbnail from the JPEG
          const isHeic = contentType.includes("heic") || contentType.includes("heif");
          const src = new File([blob], "photo.jpg", { type: contentType || "image/jpeg" });
          const jpegSrc = isHeic ? await compressToJpeg(src) : src;
          const thumbFile = await generateThumbnail(jpegSrc);
          const fd = new FormData();
          fd.append("thumb", thumbFile);
          const r = await fetch(`/api/items/${itemId}/photos/${photo.id}`, { method: "PATCH", body: fd });
          if (r.ok) {
            const { thumbUrl } = await r.json() as { thumbUrl: string };
            // Update local state so thumbs kick in immediately
            setList((prev) => prev ? {
              ...prev,
              items: prev.items.map((it) =>
                it.id === itemId
                  ? { ...it, photos: it.photos.map((p) => p.id === photo.id ? { ...p, thumbUrl } : p) }
                  : it
              ),
            } : prev);
          }
        } catch { /* skip — will retry on next load */ }
      }
    })();
    return () => { cancelled = true; };
  }, [list?.id, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load comments once list is available
  useEffect(() => {
    if (!loading && list) {
      fetch(`/api/lists/${id}/comments`)
        .then((r) => (r.ok ? (r.json() as Promise<Comment[]>) : Promise.resolve([] as Comment[])))
        .then((data) => setComments(data));
    }
  }, [loading, list, id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleModalClose(setter: (v: boolean) => void) {
    return () => { setter(false); load(); };
  }

  function handleCommentAdded(comment: Comment) {
    setComments((prev) => [...prev, comment]);
  }

  async function deleteList() {
    if (!confirm(t("deleteListConfirm"))) return;
    await fetch(`/api/lists/${id}`, { method: "DELETE" });
    router.push("/lists");
  }

  async function revokeShare() {
    if (!confirm(t("unshareConfirm", { name: list?.recipientDisplayName ?? "them" }))) return;
    await fetch(`/api/lists/${id}/share`, { method: "DELETE" });
    load();
  }

  async function togglePublic() {
    if (!list) return;
    const next = !list.isPublic;
    setList((l) => l ? { ...l, isPublic: next } : l);
    await fetch(`/api/lists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: next }),
    });
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">{t("loading")}</div>;
  }
  if (notFound || !list) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">{t("listNotFound")}</div>;
  }

  const isOwner     = me?.id === list.ownerId;
  const isRecipient = me?.id === list.recipientId;
  const isGuest     = !me;
  const isTextList  = list.category === "text" || list.category === "tears";

  const hasReactions = reactionTotals.miemie > 0 || reactionTotals.aowu > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => me ? router.push("/lists") : router.push("/")}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 text-3xl leading-none px-1 -ml-1"
          >
            ‹
          </button>

          {isOwner ? (
            <button
              onClick={() => setShowEditList(true)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-70 transition-opacity"
            >
              <span className="text-2xl">{list.emoji}</span>
              <div className="min-w-0">
                <h1 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{list.title}</h1>
                {list.recipientDisplayName && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t("sharedWith")} {list.recipientDisplayName}</p>
                )}
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-2xl">{list.emoji}</span>
              <div className="min-w-0">
                <h1 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{list.title}</h1>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t("by")} {list.ownerDisplayName}
                  {hasReactions && (
                    <span className="ml-2 text-[#2B4B8C]">
                      咩~ {reactionTotals.miemie} · 嗷～ {reactionTotals.aowu}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* view-mode toggle — always visible */}
          <button
            onClick={() => setViewMode((m) => m === "list" ? "waterfall" : "list")}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 text-base shrink-0"
            title={viewMode === "list" ? t("viewModeWaterfall") : t("viewModeList")}
          >
            {viewMode === "list" ? "⊞" : "☰"}
          </button>

          {isOwner && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={togglePublic}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  list.isPublic
                    ? "border-green-200 text-green-700 bg-green-50 hover:bg-green-100 dark:border-green-800 dark:text-green-400 dark:bg-green-900/30 dark:hover:bg-green-900/50"
                    : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {list.isPublic ? `🌍 ${t("publicBadge")}` : `🔒 ${t("privateBadge")}`}
              </button>
              {list.recipientId ? (
                <button
                  onClick={revokeShare}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1"
                >
                  {t("unshare")}
                </button>
              ) : (
                <button
                  onClick={() => setShowShare(true)}
                  className="text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
                >
                  {t("share")}
                </button>
              )}
              <button onClick={deleteList} className="text-xs text-red-400 hover:text-red-600">
                {t("delete")}
              </button>
            </div>
          )}
        </div>
      </header>

      <PullIndicator ref={indicatorRef} isRefreshing={pullRefreshing} />

      <main className="max-w-lg mx-auto px-4 py-4">
        <ItemList
          items={list.items}
          isOwner={isOwner}
          isRecipient={isRecipient}
          secondaryLabel={list.secondaryLabel}
          listId={id}
          viewMode={viewMode}
          isTextList={isTextList}
          comments={comments}
          userDisplayName={me?.displayName ?? null}
          currentUserId={me?.id ?? null}
          onEditItem={(item) => setEditingItem(item)}
          onPhotoClick={(url, allUrls) =>
            setLightbox({ urls: allUrls, index: Math.max(0, allUrls.indexOf(url)) })
          }
          onCommentAdded={handleCommentAdded}
          onReactionsChanged={(m, a) => setReactionTotals({ miemie: m, aowu: a })}
        />
      </main>

      {/* list-level comments — logged-in only */}
      {!isGuest && (
        <div className="max-w-lg mx-auto px-4 py-6 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t("comments")}</h3>
          <CommentThread
            listId={id}
            itemId={null}
            comments={comments.filter((c) => !c.itemId)}
            userDisplayName={me?.displayName ?? null}
            currentUserId={me?.id ?? null}
            onCommentAdded={handleCommentAdded}
          />
        </div>
      )}

      {isGuest && (
        <div className="fixed bottom-0 inset-x-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("wantToCreate")}</p>
            <Link href="/register" className="shrink-0 bg-[#2B4B8C] text-white text-sm font-medium px-4 py-2 rounded-lg">
              {t("getStarted")}
            </Link>
          </div>
        </div>
      )}

      {(isOwner || isRecipient) && (
        <div className="fixed bottom-6 right-6 sm:right-[calc(50%-208px)] flex flex-col items-center gap-3">
          {!isTextList && (
            <button
              onClick={() => setShowImport(true)}
              title={t("importTitle")}
              className="bg-white dark:bg-gray-900 text-[#2B4B8C] border-2 border-[#2B4B8C] w-11 h-11 rounded-full text-xs font-bold shadow-md dark:shadow-none hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center justify-center"
            >
              {t("importButton")}
            </button>
          )}
          {["restaurant", "coffee"].includes(list.category) && (
            <button
              onClick={() => setShowNearby(true)}
              title="Find nearby food"
              className="bg-white dark:bg-gray-900 text-[#2B4B8C] border-2 border-[#2B4B8C] w-11 h-11 rounded-full text-xl shadow-md dark:shadow-none hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center justify-center"
            >
              📍
            </button>
          )}
          <button
            onClick={() => setShowAddItem(true)}
            className="bg-[#2B4B8C] text-white w-14 h-14 rounded-full text-2xl shadow-lg hover:bg-[#1e3a70] flex items-center justify-center"
          >
            +
          </button>
        </div>
      )}

      {showAddItem && (
        isTextList
          ? <TextItemEditor listId={id} onClose={handleModalClose(setShowAddItem)} />
          : <AddItemModal listId={id} secondaryLabel={list.secondaryLabel} onClose={handleModalClose(setShowAddItem)} />
      )}
      {showShare && (
        <ShareModal listId={id} onClose={handleModalClose(setShowShare)} />
      )}
      {showEditList && (
        <EditListModal
          listId={id}
          current={{ title: list.title, emoji: list.emoji, secondaryLabel: list.secondaryLabel }}
          onClose={handleModalClose(setShowEditList)}
        />
      )}
      {editingItem && (
        isTextList
          ? <TextItemEditor listId={id} item={editingItem} onClose={() => { setEditingItem(null); load(); }} />
          : <EditItemModal
              item={editingItem}
              secondaryLabel={list.secondaryLabel}
              onClose={() => { setEditingItem(null); load(); }}
            />
      )}
      {showImport && (
        <BulkImportModal
          listId={id}
          secondaryLabel={list.secondaryLabel}
          onClose={handleModalClose(setShowImport)}
        />
      )}
      {showNearby && (
        <NearbyFoodModal
          listId={id}
          secondaryLabel={list.secondaryLabel}
          onClose={handleModalClose(setShowNearby)}
        />
      )}
      {lightbox && (
        <Lightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

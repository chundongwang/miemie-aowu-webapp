"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { ListDetail, Item } from "@/types";
import ItemList from "@/components/ItemList";
import AddItemModal from "@/components/AddItemModal";
import EditItemModal from "@/components/EditItemModal";
import ShareModal from "@/components/ShareModal";
import EditListModal from "@/components/EditListModal";
import { useT } from "@/context/LocaleContext";

export default function ListDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [list, setList] = useState<ListDetail | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showEditList, setShowEditList] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [notFound, setNotFound] = useState(false);

  function load() {
    Promise.all([
      fetch(`/api/lists/${id}`).then(async (r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json() as Promise<ListDetail>;
      }),
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)) as Promise<{ id: string } | null>,
    ]).then(([l, user]) => {
      setList(l);
      setMe(user);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleModalClose(setter: (v: boolean) => void) {
    return () => { setter(false); load(); };
  }

  async function deleteList() {
    if (!confirm(t("deleteListConfirm"))) return;
    await fetch(`/api/lists/${id}`, { method: "DELETE" });
    router.push("/lists");
  }

  async function revokeShare() {
    if (!confirm(t("unshareConfirm"))) return;
    await fetch(`/api/lists/${id}/share`, { method: "DELETE" });
    load();
  }

  async function togglePublic() {
    if (!list) return;
    const next = !list.isPublic;
    setList((l) => l ? { ...l, isPublic: next } : l); // optimistic
    await fetch(`/api/lists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: next }),
    });
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">{t("loading")}</div>;
  }
  if (notFound || !list) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">{t("listNotFound")}</div>;
  }

  const isOwner = me?.id === list.ownerId;
  const isRecipient = me?.id === list.recipientId;
  const isGuest = !me;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 z-10">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => me ? router.push("/lists") : router.push("/")}
            className="text-gray-400 hover:text-gray-600 text-xl pr-1"
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
                <h1 className="font-semibold text-gray-900 truncate">{list.title}</h1>
                {list.recipientDisplayName && (
                  <p className="text-xs text-gray-400">{t("sharedWith")} {list.recipientDisplayName}</p>
                )}
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-2xl">{list.emoji}</span>
              <div className="min-w-0">
                <h1 className="font-semibold text-gray-900 truncate">{list.title}</h1>
                <p className="text-xs text-gray-400">{t("by")} {list.ownerDisplayName}</p>
              </div>
            </div>
          )}

          {isOwner && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={togglePublic}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  list.isPublic
                    ? "border-green-200 text-green-700 bg-green-50 hover:bg-green-100"
                    : "border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100"
                }`}
              >
                {list.isPublic ? `🌍 ${t("publicBadge")}` : `🔒 ${t("privateBadge")}`}
              </button>
              {list.recipientId ? (
                <button
                  onClick={revokeShare}
                  className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1"
                >
                  {t("unshare")}
                </button>
              ) : (
                <button
                  onClick={() => setShowShare(true)}
                  className="text-xs font-medium border border-gray-300 rounded-lg px-2 py-1 hover:bg-gray-50"
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

      <main className="max-w-lg mx-auto px-4 py-4">
        <ItemList
          items={list.items}
          isOwner={isOwner}
          isRecipient={isRecipient}
          secondaryLabel={list.secondaryLabel}
          listId={id}
          onEditItem={(item) => setEditingItem(item)}
        />
      </main>

      {isGuest && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">{t("wantToCreate")}</p>
            <Link href="/register" className="shrink-0 bg-black text-white text-sm font-medium px-4 py-2 rounded-lg">
              {t("getStarted")}
            </Link>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="fixed bottom-6 right-6 sm:right-[calc(50%-208px)]">
          <button
            onClick={() => setShowAddItem(true)}
            className="bg-black text-white w-14 h-14 rounded-full text-2xl shadow-lg hover:bg-gray-800 flex items-center justify-center"
          >
            +
          </button>
        </div>
      )}

      {showAddItem && (
        <AddItemModal listId={id} secondaryLabel={list.secondaryLabel} onClose={handleModalClose(setShowAddItem)} />
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
        <EditItemModal
          item={editingItem}
          secondaryLabel={list.secondaryLabel}
          onClose={() => { setEditingItem(null); load(); }}
        />
      )}
    </div>
  );
}

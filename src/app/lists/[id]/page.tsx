"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { ListDetail } from "@/types";
import ItemList from "@/components/ItemList";
import AddItemModal from "@/components/AddItemModal";
import ShareModal from "@/components/ShareModal";

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [list, setList] = useState<ListDetail | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showShare, setShowShare] = useState(false);
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
    if (!confirm("Delete this list? This cannot be undone.")) return;
    await fetch(`/api/lists/${id}`, { method: "DELETE" });
    router.push("/lists");
  }

  async function revokeShare() {
    if (!confirm("Unshare this list?")) return;
    await fetch(`/api/lists/${id}/share`, { method: "DELETE" });
    load();
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }
  if (notFound || !list) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">List not found.</div>;
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
          <span className="text-2xl">{list.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 truncate">{list.title}</h1>
            <p className="text-xs text-gray-400">
              {isOwner && list.recipientDisplayName
                ? `shared with ${list.recipientDisplayName}`
                : !isOwner
                ? `by ${list.ownerDisplayName}`
                : ""}
            </p>
          </div>
          {isOwner && (
            <div className="flex items-center gap-2">
              {list.recipientId ? (
                <button
                  onClick={revokeShare}
                  className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1"
                >
                  Unshare
                </button>
              ) : (
                <button
                  onClick={() => setShowShare(true)}
                  className="text-xs font-medium border border-gray-300 rounded-lg px-2 py-1 hover:bg-gray-50"
                >
                  Share
                </button>
              )}
              <button onClick={deleteList} className="text-xs text-red-400 hover:text-red-600">
                Delete
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
        />
      </main>

      {isGuest && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">Want to create your own list?</p>
            <Link
              href="/register"
              className="shrink-0 bg-black text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              Get started
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
        <AddItemModal
          listId={id}
          secondaryLabel={list.secondaryLabel}
          onClose={handleModalClose(setShowAddItem)}
        />
      )}
      {showShare && (
        <ShareModal listId={id} onClose={handleModalClose(setShowShare)} />
      )}
    </div>
  );
}

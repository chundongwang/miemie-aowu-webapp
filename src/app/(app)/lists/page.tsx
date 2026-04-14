"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { List } from "@/types";
import NewListModal from "@/components/NewListModal";

export default function ListsPage() {
  const router = useRouter();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [me, setMe] = useState<{ id: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/lists").then((r) => r.json()) as Promise<List[]>,
      fetch("/api/auth/me").then((r) => r.json()) as Promise<{ id: string }>,
    ]).then(([ls, user]) => {
      setLists(ls);
      setMe(user);
      setLoading(false);
    });
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between z-10">
        <h1 className="text-lg font-semibold">My Lists</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNew(true)}
            className="bg-black text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            + New
          </button>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-600">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
        ) : lists.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm mb-4">No lists yet.</p>
            <button
              onClick={() => setShowNew(true)}
              className="bg-black text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              Create your first list
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {lists.map((list) => {
              const isOwner = me && list.ownerId === me.id;
              const other = isOwner
                ? list.recipientDisplayName
                : list.ownerDisplayName;
              const otherLabel = isOwner ? "shared with" : "from";

              return (
                <li key={list.id}>
                  <Link
                    href={`/lists/${list.id}`}
                    className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{list.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{list.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {other
                            ? `${otherLabel} ${other}`
                            : isOwner
                            ? "not shared yet"
                            : ""}
                          {" · "}
                          {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                        </p>
                      </div>
                      <span className="text-gray-300 text-lg">›</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {showNew && <NewListModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

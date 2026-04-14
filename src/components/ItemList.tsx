"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";

const STATUS_CYCLE: Record<string, string> = { unseen: "saved", saved: "done", done: "unseen" };
const STATUS_LABEL: Record<string, string> = { unseen: "·", saved: "★", done: "✓" };
const STATUS_COLOR: Record<string, string> = {
  unseen: "text-gray-300",
  saved:  "text-yellow-400",
  done:   "text-green-500",
};

type Props = {
  items: Item[];
  isRecipient: boolean;
  isOwner: boolean;
  secondaryLabel: string | null;
};

export default function ItemList({ items, isRecipient, isOwner, secondaryLabel }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function cycleStatus(item: Item) {
    if (!isRecipient && !isOwner) return;
    setPending(item.id);
    const next = STATUS_CYCLE[item.status];
    await fetch(`/api/items/${item.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setPending(null);
    startTransition(() => router.refresh());
  }

  async function deleteItem(itemId: string) {
    if (!confirm("Remove this item?")) return;
    setDeleting(itemId);
    await fetch(`/api/items/${itemId}`, { method: "DELETE" });
    setDeleting(null);
    startTransition(() => router.refresh());
  }

  if (items.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-16">
        {isOwner ? "No items yet. Add the first one!" : "Nothing here yet."}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((item) => (
        <li key={item.id} className="py-4 flex items-start gap-3">
          <button
            onClick={() => cycleStatus(item)}
            disabled={pending === item.id}
            className={`mt-0.5 text-xl w-7 shrink-0 text-center transition-opacity ${
              STATUS_COLOR[item.status]
            } ${pending === item.id ? "opacity-40" : ""}`}
            title={`Status: ${item.status} — tap to change`}
          >
            {STATUS_LABEL[item.status]}
          </button>

          <div className="flex-1 min-w-0">
            <p className={`font-medium text-sm ${item.status === "done" ? "line-through text-gray-400" : "text-gray-900"}`}>
              {item.name}
            </p>
            {item.secondary && (
              <p className="text-xs text-gray-500 mt-0.5">
                {secondaryLabel ? `${secondaryLabel}: ` : ""}{item.secondary}
              </p>
            )}
            {item.reason && (
              <p className="text-xs text-gray-400 italic mt-1">"{item.reason}"</p>
            )}
          </div>

          {isOwner && (
            <button
              onClick={() => deleteItem(item.id)}
              disabled={deleting === item.id}
              className="text-gray-300 hover:text-red-400 text-sm mt-0.5 shrink-0"
              title="Delete item"
            >
              {deleting === item.id ? "…" : "✕"}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

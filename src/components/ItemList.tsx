"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Item } from "@/types";

const STATUS_CYCLE: Record<string, string> = { unseen: "saved", saved: "done", done: "unseen" };
const STATUS_LABEL: Record<string, string> = { unseen: "·", saved: "★", done: "✓" };
const STATUS_COLOR: Record<string, string> = {
  unseen: "text-gray-300",
  saved:  "text-yellow-400",
  done:   "text-green-500",
};

// ── Single sortable item row ──────────────────────────────────────────────────

type RowProps = {
  item: Item;
  isOwner: boolean;
  isRecipient: boolean;
  secondaryLabel: string | null;
  pending: string | null;
  deleting: string | null;
  onCycle: (item: Item) => void;
  onDelete: (id: string) => void;
};

function SortableRow({ item, isOwner, isRecipient, secondaryLabel, pending, deleting, onCycle, onDelete }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="py-4 flex items-start gap-3">
      {/* drag handle — owner only */}
      {isOwner && (
        <button
          {...attributes}
          {...listeners}
          className="mt-1 text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          aria-label="Drag to reorder"
        >
          ⠿
        </button>
      )}

      {/* status button */}
      <button
        onClick={() => onCycle(item)}
        disabled={pending === item.id || (!isRecipient && !isOwner)}
        className={`mt-0.5 text-xl w-7 shrink-0 text-center transition-opacity ${STATUS_COLOR[item.status]} ${
          pending === item.id ? "opacity-40" : ""
        } ${!isRecipient && !isOwner ? "cursor-default" : ""}`}
        title={`Status: ${item.status}${isRecipient || isOwner ? " — tap to change" : ""}`}
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
          onClick={() => onDelete(item.id)}
          disabled={deleting === item.id}
          className="text-gray-300 hover:text-red-400 text-sm mt-0.5 shrink-0"
          title="Delete item"
        >
          {deleting === item.id ? "…" : "✕"}
        </button>
      )}
    </li>
  );
}

// ── ItemList ──────────────────────────────────────────────────────────────────

type Props = {
  items: Item[];
  isRecipient: boolean;
  isOwner: boolean;
  secondaryLabel: string | null;
  listId: string;
};

export default function ItemList({ items: initialItems, isRecipient, isOwner, secondaryLabel, listId }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [pending, setPending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // sync when parent re-fetches
  useEffect(() => { setItems(initialItems); }, [initialItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  async function cycleStatus(item: Item) {
    if (!isRecipient && !isOwner) return;
    setPending(item.id);
    const next = STATUS_CYCLE[item.status];
    // optimistic update
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: next as Item["status"] } : i));
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
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    await fetch(`/api/items/${itemId}`, { method: "DELETE" });
    setDeleting(null);
    startTransition(() => router.refresh());
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);

    setItems(reordered); // optimistic
    await fetch(`/api/lists/${listId}/items/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((i) => i.id) }),
    });
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-gray-100">
          {items.map((item) => (
            <SortableRow
              key={item.id}
              item={item}
              isOwner={isOwner}
              isRecipient={isRecipient}
              secondaryLabel={secondaryLabel}
              pending={pending}
              deleting={deleting}
              onCycle={cycleStatus}
              onDelete={deleteItem}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

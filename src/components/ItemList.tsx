"use client";

import { useState, useEffect, useTransition, useRef } from "react";
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
import { useT } from "@/context/LocaleContext";

const STATUS_CYCLE: Record<string, string> = { unseen: "saved", saved: "done", done: "unseen" };
const STATUS_LABEL: Record<string, string> = { unseen: "·", saved: "★", done: "✓" };
const STATUS_COLOR: Record<string, string> = {
  unseen: "text-gray-300",
  saved:  "text-yellow-400",
  done:   "text-green-500",
};

const MAX_PHOTOS = 3;

// ── Single sortable item row ──────────────────────────────────────────────────

type RowProps = {
  item: Item;
  isOwner: boolean;
  isRecipient: boolean;
  secondaryLabel: string | null;
  pending: string | null;
  deleting: string | null;
  onCycle: (item: Item) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onPhotoAdded: (itemId: string, photoId: string, url: string) => void;
  onPhotoRemoved: (itemId: string, photoId: string) => void;
};

function SortableRow({
  item, isOwner, isRecipient, secondaryLabel,
  pending, deleting,
  onCycle, onEdit, onDelete, onPhotoAdded, onPhotoRemoved,
}: RowProps) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  async function uploadPhoto(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploadingPhoto(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/items/${item.id}/photos`, { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json() as { id: string; url: string };
      onPhotoAdded(item.id, data.id, data.url);
    }
    setUploadingPhoto(false);
  }

  async function handlePhotoInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await uploadPhoto(file);
    e.target.value = "";
  }

  function handleAddPhotoClick() {
    const isNative =
      typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).Capacitor?.isNativePlatform?.();

    if (!isNative) {
      fileInputRef.current?.click();
      return;
    }

    void (async () => {
      try {
        const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        const image = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
        });
        if (!image.dataUrl) return;
        const res = await fetch(image.dataUrl);
        const blob = await res.blob();
        await uploadPhoto(new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      } catch {
        // cancelled or permission denied
      }
    })();
  }

  async function removePhoto(photoId: string) {
    await fetch(`/api/items/${item.id}/photos/${photoId}`, { method: "DELETE" });
    onPhotoRemoved(item.id, photoId);
  }

  return (
    <li ref={setNodeRef} style={style} className="py-4 flex items-start gap-3">
      {/* drag handle — owner only */}
      {isOwner && (
        <button
          {...attributes}
          {...listeners}
          className="mt-1 text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          aria-label={t("dragToReorder")}
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
        title={`${item.status}${isRecipient || isOwner ? t("tapToChange") : ""}`}
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

        {/* photo thumbnails */}
        {(item.photos.length > 0 || (isOwner && item.photos.length < MAX_PHOTOS)) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {item.photos.map((photo) => (
              <div key={photo.id} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  className="w-16 h-16 object-cover rounded-lg border border-gray-100"
                />
                {isOwner && (
                  <button
                    onClick={() => removePhoto(photo.id)}
                    className="absolute -top-1 -right-1 bg-gray-700 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center hover:bg-red-500"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            {/* add photo button for owner */}
            {isOwner && item.photos.length < MAX_PHOTOS && (
              <button
                onClick={handleAddPhotoClick}
                disabled={uploadingPhoto}
                className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 hover:border-gray-400 hover:text-gray-400 transition-colors disabled:opacity-40"
              >
                {uploadingPhoto ? (
                  <span className="text-xs">…</span>
                ) : (
                  <>
                    <span className="text-lg leading-none">+</span>
                    <span className="text-xs">{t("photoButton")}</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {isOwner && (
        <div className="flex items-center gap-1.5 mt-0.5 shrink-0">
          <button
            onClick={() => onEdit(item)}
            className="text-gray-300 hover:text-gray-500 text-sm"
            title={t("editItem")}
          >
            ✎
          </button>
          <button
            onClick={() => onDelete(item.id)}
            disabled={deleting === item.id}
            className="text-gray-300 hover:text-red-400 text-sm"
            title={t("deleteItem")}
          >
            {deleting === item.id ? "…" : "✕"}
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoInput}
      />
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
  onEditItem: (item: Item) => void;
};

export default function ItemList({ items: initialItems, isRecipient, isOwner, secondaryLabel, listId, onEditItem }: Props) {
  const t = useT();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [pending, setPending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { setItems(initialItems); }, [initialItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  async function cycleStatus(item: Item) {
    if (!isRecipient && !isOwner) return;
    setPending(item.id);
    const next = STATUS_CYCLE[item.status];
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
    if (!confirm(t("removeItemConfirm"))) return;
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
    setItems(reordered);
    await fetch(`/api/lists/${listId}/items/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((i) => i.id) }),
    });
    startTransition(() => router.refresh());
  }

  function handlePhotoAdded(itemId: string, photoId: string, url: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, photos: [...i.photos, { id: photoId, r2Key: "", url, position: i.photos.length }] }
          : i
      )
    );
  }

  function handlePhotoRemoved(itemId: string, photoId: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, photos: i.photos.filter((p) => p.id !== photoId) } : i
      )
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-16">
        {isOwner ? t("noItemsOwner") : t("noItemsRecipient")}
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
              onEdit={onEditItem}
              onDelete={deleteItem}
              onPhotoAdded={handlePhotoAdded}
              onPhotoRemoved={handlePhotoRemoved}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

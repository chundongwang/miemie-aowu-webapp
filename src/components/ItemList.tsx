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
import type { Item, ItemPhoto, Comment } from "@/types";
import { useT } from "@/context/LocaleContext";
import CommentThread from "@/components/CommentThread";
import PhotoSearchModal from "@/components/PhotoSearchModal";

const STATUS_CYCLE: Record<string, string> = { unseen: "saved", saved: "done", done: "unseen" };
const STATUS_LABEL: Record<string, string> = { unseen: "·", saved: "★", done: "✓" };
const STATUS_COLOR: Record<string, string> = {
  unseen: "text-gray-300",
  saved:  "text-yellow-400",
  done:   "text-green-500",
};

const MAX_PHOTOS = 3;

// ── Shared reaction bar ───────────────────────────────────────────────────────

type ReactionBarProps = {
  item: Item;
  itemComments: Comment[];
  onReact: (itemId: string, type: "miemie" | "aowu") => void;
  showComments: boolean;
  onToggleComments: () => void;
};

function ReactionBar({ item, itemComments, onReact, showComments, onToggleComments }: ReactionBarProps) {
  return (
    <div className="flex items-center gap-3 mt-2">
      <button
        onClick={() => onReact(item.id, "miemie")}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#2B4B8C] transition-colors"
      >
        <span>咩~</span><span>{item.miemieCount}</span>
      </button>
      <button
        onClick={() => onReact(item.id, "aowu")}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#2B4B8C] transition-colors"
      >
        <span>嗷～</span><span>{item.aowuCount}</span>
      </button>
      <button
        onClick={onToggleComments}
        className={`flex items-center gap-1 text-xs ml-auto transition-colors ${
          showComments ? "text-[#2B4B8C]" : "text-gray-400 hover:text-gray-600"
        }`}
      >
        <span>💬</span><span>{itemComments.length}</span>
      </button>
    </div>
  );
}

// ── Sortable row (list mode) ──────────────────────────────────────────────────

type RowProps = {
  item: Item;
  isOwner: boolean;
  isRecipient: boolean;
  secondaryLabel: string | null;
  pending: string | null;
  deleting: string | null;
  listId: string;
  comments: Comment[];
  userDisplayName: string | null;
  onCycle: (item: Item) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onPhotoAdded: (itemId: string, photoId: string, url: string) => void;
  onPhotoRemoved: (itemId: string, photoId: string) => void;
  onPhotoClick: (url: string) => void;
  onReact: (itemId: string, type: "miemie" | "aowu") => void;
  onCommentAdded: (c: Comment) => void;
};

function SortableRow({
  item, isOwner, isRecipient, secondaryLabel,
  pending, deleting, listId, comments, userDisplayName,
  onCycle, onEdit, onDelete, onPhotoAdded, onPhotoRemoved, onPhotoClick, onReact, onCommentAdded,
}: RowProps) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto,  setUploadingPhoto]  = useState(false);
  const [showComments,    setShowComments]    = useState(false);
  const [showPhotoSearch, setShowPhotoSearch] = useState(false);

  const itemComments = comments.filter((c) => c.itemId === item.id);

  const canEdit = isOwner || isRecipient;

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
      {/* drag handle */}
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
        {canEdit ? (
          <button
            onClick={() => onEdit(item)}
            className={`font-medium text-sm text-left hover:opacity-70 transition-opacity ${
              item.status === "done" ? "line-through text-gray-400" : "text-gray-900"
            }`}
          >
            {item.name}
          </button>
        ) : (
          <p className={`font-medium text-sm ${item.status === "done" ? "line-through text-gray-400" : "text-gray-900"}`}>
            {item.name}
          </p>
        )}
        {item.secondary && (
          <p className="text-xs text-gray-500 mt-0.5">
            {secondaryLabel ? `${secondaryLabel}: ` : ""}{item.secondary}
          </p>
        )}
        {item.reason && (
          <p className="text-xs text-gray-400 italic mt-1">"{item.reason}"</p>
        )}

        {/* photos */}
        {(item.photos.length > 0 || (canEdit && item.photos.length < MAX_PHOTOS)) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {item.photos.map((photo) => (
              <div key={photo.id} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  className="w-16 h-16 object-cover rounded-lg border border-gray-100 cursor-zoom-in"
                  onClick={() => onPhotoClick(photo.url)}
                />
                {canEdit && (
                  <button
                    onClick={() => removePhoto(photo.id)}
                    className="absolute -top-1 -right-1 bg-gray-700 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center hover:bg-red-500"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {canEdit && item.photos.length < MAX_PHOTOS && (
              <>
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
                <button
                  onClick={() => setShowPhotoSearch(true)}
                  className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-300 hover:border-[#2B4B8C] hover:text-[#2B4B8C] transition-colors"
                >
                  <span className="text-lg leading-none">🔍</span>
                  <span className="text-xs">search</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* reaction bar + comments — logged-in only */}
        {userDisplayName !== null && (
          <>
            <ReactionBar
              item={item}
              itemComments={itemComments}
              onReact={onReact}
              showComments={showComments}
              onToggleComments={() => setShowComments((v) => !v)}
            />
            {showComments && (
              <div className="mt-2 pl-3 border-l-2 border-gray-100">
                <CommentThread
                  listId={listId}
                  itemId={item.id}
                  comments={itemComments}
                  userDisplayName={userDisplayName}
                  onCommentAdded={onCommentAdded}
                  compact
                />
              </div>
            )}
          </>
        )}
      </div>

      {canEdit && (
        <button
          onClick={() => onDelete(item.id)}
          disabled={deleting === item.id}
          className="mt-0.5 text-gray-300 hover:text-red-400 text-sm shrink-0"
          title={t("deleteItem")}
        >
          {deleting === item.id ? "…" : "✕"}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoInput}
      />

      {showPhotoSearch && (
        <PhotoSearchModal
          itemId={item.id}
          initialQuery={item.name}
          onPhotoAdded={(photoId, url) => onPhotoAdded(item.id, photoId, url)}
          onClose={() => setShowPhotoSearch(false)}
        />
      )}
    </li>
  );
}

// ── Waterfall card (one card per photo) ──────────────────────────────────────

type CardProps = {
  item: Item;
  photo: ItemPhoto | null; // the specific photo for this card
  isOwner: boolean;
  isRecipient: boolean;
  secondaryLabel: string | null;
  listId: string;
  comments: Comment[];
  userDisplayName: string | null;
  pending: string | null;
  deleting: string | null;
  onCycle: (item: Item) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onPhotoClick: (url: string) => void;
  onReact: (itemId: string, type: "miemie" | "aowu") => void;
  onCommentAdded: (c: Comment) => void;
};

function WaterfallCard({
  item, photo, isOwner, isRecipient, secondaryLabel, listId, comments, userDisplayName,
  pending, deleting, onCycle, onEdit, onDelete, onPhotoClick, onReact, onCommentAdded,
}: CardProps) {
  const t = useT();
  const canEdit = isOwner || isRecipient;
  const [showComments, setShowComments] = useState(false);
  const itemComments = comments.filter((c) => c.itemId === item.id);

  return (
    <div className="break-inside-avoid mb-3 bg-white rounded-xl overflow-hidden shadow-sm">
      {/* Single photo for this card */}
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.url}
          alt=""
          className="w-full object-cover cursor-zoom-in"
          onClick={() => onPhotoClick(photo.url)}
        />
      )}

      <div className="p-3">
        {/* name + controls */}
        <div className="flex items-start justify-between gap-2">
          {canEdit ? (
            <button
              onClick={() => onEdit(item)}
              className={`font-medium text-sm text-left hover:opacity-70 transition-opacity flex-1 ${
                item.status === "done" ? "line-through text-gray-400" : "text-gray-900"
              }`}
            >
              {item.name}
            </button>
          ) : (
            <p className={`font-medium text-sm flex-1 ${item.status === "done" ? "line-through text-gray-400" : "text-gray-900"}`}>
              {item.name}
            </p>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            {(isOwner || isRecipient) && (
              <button
                onClick={() => onCycle(item)}
                disabled={pending === item.id}
                className={`text-base ${STATUS_COLOR[item.status]} ${pending === item.id ? "opacity-40" : ""}`}
              >
                {STATUS_LABEL[item.status]}
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => onDelete(item.id)}
                disabled={deleting === item.id}
                className="text-gray-300 hover:text-red-400 text-xs"
              >
                {deleting === item.id ? "…" : "✕"}
              </button>
            )}
          </div>
        </div>

        {item.secondary && (
          <p className="text-xs text-gray-500 mt-0.5">
            {secondaryLabel ? `${secondaryLabel}: ` : ""}{item.secondary}
          </p>
        )}
        {item.reason && (
          <p className="text-xs text-gray-400 italic mt-1">"{item.reason}"</p>
        )}

        {/* reaction bar + comments — logged-in only */}
        {userDisplayName !== null && (
          <>
            <ReactionBar
              item={item}
              itemComments={itemComments}
              onReact={onReact}
              showComments={showComments}
              onToggleComments={() => setShowComments((v) => !v)}
            />
            {showComments && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <CommentThread
                  listId={listId}
                  itemId={item.id}
                  comments={itemComments}
                  userDisplayName={userDisplayName}
                  onCommentAdded={onCommentAdded}
                  compact
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── ItemList ──────────────────────────────────────────────────────────────────

type Props = {
  items: Item[];
  isRecipient: boolean;
  isOwner: boolean;
  secondaryLabel: string | null;
  listId: string;
  viewMode: "list" | "waterfall";
  comments: Comment[];
  userDisplayName: string | null;
  onEditItem: (item: Item) => void;
  onPhotoClick: (url: string) => void;
  onCommentAdded: (c: Comment) => void;
  onReactionsChanged: (totalMiemie: number, totalAowu: number) => void;
};

export default function ItemList({
  items: initialItems, isRecipient, isOwner, secondaryLabel, listId,
  viewMode, comments, userDisplayName,
  onEditItem, onPhotoClick, onCommentAdded, onReactionsChanged,
}: Props) {
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

  function notifyTotals(updatedItems: Item[]) {
    onReactionsChanged(
      updatedItems.reduce((s, i) => s + i.miemieCount, 0),
      updatedItems.reduce((s, i) => s + i.aowuCount,   0),
    );
  }

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
    const updated = items.filter((i) => i.id !== itemId);
    setItems(updated);
    notifyTotals(updated);
    await fetch(`/api/items/${itemId}`, { method: "DELETE" });
    setDeleting(null);
    startTransition(() => router.refresh());
  }

  async function reactToItem(itemId: string, type: "miemie" | "aowu") {
    const updated = items.map((i) =>
      i.id === itemId
        ? {
            ...i,
            miemieCount: i.miemieCount + (type === "miemie" ? 1 : 0),
            aowuCount:   i.aowuCount   + (type === "aowu"   ? 1 : 0),
          }
        : i
    );
    setItems(updated);
    notifyTotals(updated);
    await fetch(`/api/items/${itemId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
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

  const sharedProps = {
    isOwner, isRecipient, secondaryLabel, listId, comments, userDisplayName,
    pending, deleting,
    onCycle: cycleStatus,
    onEdit: onEditItem,
    onDelete: deleteItem,
    onPhotoClick,
    onReact: reactToItem,
    onCommentAdded,
  };

  // ── Waterfall mode (one card per photo; items without photos get one card) ──
  if (viewMode === "waterfall") {
    const entries = items.flatMap((item) =>
      item.photos.length > 0
        ? item.photos.map((photo) => ({ item, photo }))
        : [{ item, photo: null as ItemPhoto | null }]
    );
    return (
      <div className="columns-2 gap-3">
        {entries.map(({ item, photo }) => (
          <WaterfallCard
            key={photo ? photo.id : item.id}
            item={item}
            photo={photo}
            {...sharedProps}
          />
        ))}
      </div>
    );
  }

  // ── List mode ──
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-gray-100">
          {items.map((item) => (
            <SortableRow
              key={item.id}
              item={item}
              {...sharedProps}
              onPhotoAdded={handlePhotoAdded}
              onPhotoRemoved={handlePhotoRemoved}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

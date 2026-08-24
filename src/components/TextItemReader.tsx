"use client";

import { useEffect, useState } from "react";
import { useT } from "@/context/LocaleContext";
import type { Item, Comment } from "@/types";
import CommentThread from "@/components/CommentThread";
import Lightbox from "@/components/Lightbox";

type Props = {
  item: Item;
  canEdit: boolean;
  listId: string;
  comments: Comment[];
  userDisplayName: string | null;
  currentUserId: string | null;
  onClose: () => void;
  onEdit: (item: Item) => void;
  onReact: (itemId: string, type: "miemie" | "aowu") => void;
  onCommentAdded: (c: Comment) => void;
};

export default function TextItemReader({
  item, canEdit, listId, comments, userDisplayName, currentUserId,
  onClose, onEdit, onReact, onCommentAdded,
}: Props) {
  const t = useT();
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  // First body line doubles as the name when the note has no explicit title —
  // in that case don't render the title separately (mirrors the list preview).
  const hasTitle = !!item.name && item.name !== item.reason?.split("\n")[0].slice(0, 80);
  const body = item.reason?.trim();
  const itemComments = comments.filter((c) => c.itemId === item.id);
  const ts = item.updatedAt > item.createdAt ? item.updatedAt : item.createdAt;
  const dateStr = new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && zoomIndex === null) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, zoomIndex]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950">
      {/* toolbar */}
      <div className="flex items-center justify-between px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-gray-100 dark:border-gray-800 shrink-0">
        <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
          ‹ Back
        </button>
        {canEdit && (
          <button
            onClick={() => onEdit(item)}
            className="text-sm font-medium text-[#2B4B8C] hover:opacity-70 flex items-center gap-1"
          >
            <span className="text-xs">✎</span> {t("edit")}
          </button>
        )}
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl w-full mx-auto">
        {/* emoji + title */}
        {(item.secondary || hasTitle) && (
          <div className="flex items-start gap-3 mb-4">
            {item.secondary && <span className="text-3xl shrink-0 leading-none">{item.secondary}</span>}
            {hasTitle && (
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-snug">{item.name}</h1>
            )}
          </div>
        )}

        {/* full body */}
        {body ? (
          <p className="text-gray-800 dark:text-gray-200 text-base leading-relaxed whitespace-pre-wrap">{body}</p>
        ) : (
          !hasTitle && <p className="text-gray-400 dark:text-gray-500 italic text-sm">{t("textEmptyNote")}</p>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">{dateStr}</p>

        {/* photos — after the writing */}
        {item.photos.length > 0 && (
          <div className="mt-5 space-y-3">
            {item.photos.map((photo, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.url}
                alt=""
                onClick={() => setZoomIndex(i)}
                className="w-full rounded-xl border border-gray-100 dark:border-gray-800 cursor-zoom-in"
              />
            ))}
          </div>
        )}

        {/* reactions + comments — logged-in only */}
        {userDisplayName !== null && (
          <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-4">
              <button
                onClick={() => onReact(item.id, "miemie")}
                className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-[#2B4B8C] transition-colors"
              >
                <span>咩~</span><span className="tabular-nums">{item.miemieCount}</span>
              </button>
              <button
                onClick={() => onReact(item.id, "aowu")}
                className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-[#2B4B8C] transition-colors"
              >
                <span>嗷～</span><span className="tabular-nums">{item.aowuCount}</span>
              </button>
            </div>

            <div className="mt-4">
              <CommentThread
                listId={listId}
                itemId={item.id}
                comments={itemComments}
                userDisplayName={userDisplayName}
                currentUserId={currentUserId}
                onCommentAdded={onCommentAdded}
                compact
              />
            </div>
          </div>
        )}
      </div>

      {zoomIndex !== null && (
        <Lightbox
          items={[{ photos: item.photos }]}
          itemIndex={0}
          photoIndex={zoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </div>
  );
}

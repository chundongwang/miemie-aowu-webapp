"use client";

import { useState } from "react";
import { useT } from "@/context/LocaleContext";
import type { Comment } from "@/types";

type Props = {
  listId: string;
  itemId?: string | null;
  comments: Comment[];
  userDisplayName: string | null;
  currentUserId: string | null;
  onCommentAdded: (c: Comment) => void;
  compact?: boolean;
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(ts).toLocaleDateString();
}

export default function CommentThread({
  listId, itemId, comments, userDisplayName, currentUserId, onCommentAdded, compact,
}: Props) {
  const t = useT();
  const [body, setBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Local edits: commentId → { body, updatedAt }
  const [localEdits, setLocalEdits] = useState<Map<string, { body: string; updatedAt: number }>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const canPost = body.trim() !== "" && (userDisplayName !== null || guestName.trim() !== "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canPost) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lists/${listId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          authorName: guestName.trim() || undefined,
          itemId: itemId ?? undefined,
        }),
      });
      if (res.ok) {
        const comment = await res.json() as Comment;
        onCommentAdded(comment);
        setBody("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(c: Comment) {
    setEditingId(c.id);
    setEditDraft(localEdits.get(c.id)?.body ?? c.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit(commentId: string) {
    if (!editDraft.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/lists/${listId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editDraft.trim() }),
      });
      if (res.ok) {
        const { body: newBody, updatedAt } = await res.json() as { body: string; updatedAt: number };
        setLocalEdits((prev) => new Map(prev).set(commentId, { body: newBody, updatedAt }));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      {comments.length === 0 && (
        <p className="text-gray-400 dark:text-gray-500 text-xs mb-3">{t("noComments")}</p>
      )}
      <div className="space-y-3 mb-3">
        {comments.map((c) => {
          const edit = localEdits.get(c.id);
          const displayBody = edit?.body ?? c.body;
          const isEdited = !!(edit?.updatedAt ?? c.updatedAt);
          const isEditing = editingId === c.id;
          const isOwn = currentUserId !== null && c.userId === currentUserId;

          return (
            <div key={c.id}>
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-gray-800 dark:text-gray-200 text-xs">{c.authorName}</span>
                {c.itemName && !itemId && (
                  <span className="text-[10px] text-[#2B4B8C] bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                    {t("itemCommentHint", { item: c.itemName })}
                  </span>
                )}
                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto flex items-center gap-1.5">
                  {isEdited && <span className="italic">edited</span>}
                  {timeAgo(c.createdAt)}
                  {isOwn && !isEditing && (
                    <button
                      onClick={() => startEdit(c)}
                      className="text-gray-300 dark:text-gray-600 hover:text-[#2B4B8C] dark:hover:text-blue-400 transition-colors"
                      title="Edit comment"
                    >
                      ✎
                    </button>
                  )}
                </span>
              </div>

              {isEditing ? (
                <div className="mt-1 space-y-1">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(c.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                    rows={2}
                    className="w-full border border-[#2B4B8C] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(c.id)}
                      disabled={saving || !editDraft.trim()}
                      className="bg-[#2B4B8C] text-white rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-40"
                    >
                      {saving ? "…" : "Save"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-gray-400 dark:text-gray-500 text-xs px-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-gray-700 dark:text-gray-300 mt-0.5 text-xs leading-snug">{displayBody}</p>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="space-y-1.5">
        {userDisplayName === null && (
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={t("yourName")}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
        )}
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("addComment")}
            className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={submitting || !canPost}
            className="shrink-0 bg-[#2B4B8C] text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {submitting ? t("posting") : t("postComment")}
          </button>
        </div>
      </form>
    </div>
  );
}

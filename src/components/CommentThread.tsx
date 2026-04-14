"use client";

import { useState } from "react";
import { useT } from "@/context/LocaleContext";
import type { Comment } from "@/types";

type Props = {
  listId: string;
  itemId?: string | null;
  comments: Comment[];
  userDisplayName: string | null;
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
  listId, itemId, comments, userDisplayName, onCommentAdded, compact,
}: Props) {
  const t = useT();
  const [body, setBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      {comments.length === 0 && (
        <p className="text-gray-400 text-xs mb-3">{t("noComments")}</p>
      )}
      <div className="space-y-3 mb-3">
        {comments.map((c) => (
          <div key={c.id}>
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-gray-800 text-xs">{c.authorName}</span>
              {c.itemName && !itemId && (
                <span className="text-[10px] text-[#2B4B8C] bg-blue-50 px-1.5 py-0.5 rounded-full">
                  {t("itemCommentHint", { item: c.itemName })}
                </span>
              )}
              <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(c.createdAt)}</span>
            </div>
            <p className="text-gray-700 mt-0.5 text-xs leading-snug">{c.body}</p>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-1.5">
        {userDisplayName === null && (
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={t("yourName")}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#2B4B8C]"
          />
        )}
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("addComment")}
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#2B4B8C]"
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

"use client";

import { useState, useEffect, useRef } from "react";
import { useT } from "@/context/LocaleContext";
import type { Comment } from "@/types";

// Deterministic color from a name string
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 45%, 55%)`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const COIN_CSS = `
@keyframes coinFloat {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-36px) scale(1.15); }
}
.coin-float { animation: coinFloat 1s ease-out forwards; }
`;

type Props = {
  listId: string;
  itemId?: string | null;
  comments: Comment[];
  userDisplayName: string | null;
  currentUserId: string | null;
  onCommentAdded: (c: Comment) => void;
  compact?: boolean;
};

function Avatar({ name, size }: { name: string; size: "sm" | "md" }) {
  const cls = size === "sm" ? "w-6 h-6 text-[10px]" : "w-7 h-7 text-xs";
  return (
    <div
      className={`shrink-0 ${cls} rounded-full flex items-center justify-center text-white font-semibold leading-none`}
      style={{ backgroundColor: avatarColor(name) }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function CommentThread({
  listId, itemId, comments, userDisplayName, currentUserId, onCommentAdded, compact,
}: Props) {
  const t = useT();
  const draftKey = `comment-draft-${listId}-${itemId ?? "list"}`;

  const [body, setBody]           = useState("");
  const [guestName, setGuestName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCoin, setShowCoin]   = useState(false);

  const [localEdits, setLocalEdits] = useState<Map<string, { body: string; updatedAt: number }>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving]       = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore draft
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) setBody(saved);
  }, [draftKey]);

  // Persist draft
  useEffect(() => {
    if (body) localStorage.setItem(draftKey, body);
    else localStorage.removeItem(draftKey);
  }, [body, draftKey]);

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  const canPost = body.trim() !== "" && (userDisplayName !== null || guestName.trim() !== "");

  function triggerCoin() {
    setShowCoin(true);
    setTimeout(() => setShowCoin(false), 1100);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canPost || submitting) return;
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
        localStorage.removeItem(draftKey);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        triggerCoin();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(c: Comment) {
    setEditingId(c.id);
    setEditDraft(localEdits.get(c.id)?.body ?? c.body);
  }

  function cancelEdit() { setEditingId(null); setEditDraft(""); }

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

  const avatarSize = compact ? "sm" : "md" as "sm" | "md";
  const bubblePad  = compact ? "px-3 py-2" : "px-3.5 py-2.5";
  const gap        = compact ? "space-y-2 mb-3" : "space-y-3 mb-4";

  return (
    <div>
      <style>{COIN_CSS}</style>

      {comments.length === 0 && (
        <p className="text-gray-400 dark:text-gray-500 text-xs mb-3">{t("noComments")}</p>
      )}

      {/* Comment bubbles */}
      <div className={gap}>
        {comments.map((c) => {
          const edit        = localEdits.get(c.id);
          const displayBody = edit?.body ?? c.body;
          const isEdited    = !!(edit?.updatedAt ?? c.updatedAt);
          const isEditing   = editingId === c.id;
          const isOwn       = currentUserId !== null && c.userId === currentUserId;

          return (
            <div key={c.id} className="flex gap-2 items-start">
              <Avatar name={c.authorName} size={avatarSize} />
              <div className="flex-1 min-w-0">
                <div className={`bg-gray-50 dark:bg-gray-800 rounded-2xl ${bubblePad}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-xs text-gray-700 dark:text-gray-200 leading-none">
                      {c.authorName}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 flex items-center gap-1.5">
                      {isEdited && <span className="italic">edited</span>}
                      {timeAgo(c.createdAt)}
                      {isOwn && !isEditing && (
                        <button
                          onClick={() => startEdit(c)}
                          className="text-gray-400 hover:text-[#2B4B8C] dark:hover:text-blue-400 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </span>
                  </div>

                  {c.itemName && !itemId && (
                    <span className="inline-block text-[10px] text-[#2B4B8C] bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full mb-1.5">
                      {t("itemCommentHint", { item: c.itemName })}
                    </span>
                  )}

                  {isEditing ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={editDraft}
                        onChange={(e) => { setEditDraft(e.target.value); autoGrow(e.target); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(c.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        autoFocus
                        rows={2}
                        className="w-full border border-[#2B4B8C] rounded-xl px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#2B4B8C] dark:bg-gray-700 dark:text-white resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(c.id)}
                          disabled={saving || !editDraft.trim()}
                          className="bg-[#2B4B8C] text-white rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-40"
                        >
                          {saving ? "…" : "Save"}
                        </button>
                        <button onClick={cancelEdit} className="text-gray-400 text-xs px-1">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                      {displayBody}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compose — logged-in */}
      {userDisplayName !== null && (
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-2 items-start">
            <div className="mt-1">
              <Avatar name={userDisplayName} size={avatarSize} />
            </div>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => { setBody(e.target.value); autoGrow(e.target); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (canPost && !submitting) submit(e as unknown as React.FormEvent);
                }
              }}
              placeholder={t("addComment")}
              rows={1}
              className="flex-1 border border-gray-200 dark:border-gray-700 rounded-2xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4B8C]/30 focus:border-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 resize-none overflow-hidden transition-shadow"
              style={{ minHeight: "38px" }}
            />
          </div>

          {canPost && (
            <div className="flex justify-end pl-9">
              <div className="relative">
                {showCoin && (
                  <span className="coin-float absolute -top-1 left-1/2 text-sm font-bold text-yellow-500 pointer-events-none whitespace-nowrap z-10">
                    💰 +1
                  </span>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#2B4B8C] text-white rounded-xl px-4 py-1.5 text-sm font-medium hover:bg-[#1e3a70] disabled:opacity-40 transition-colors"
                >
                  {submitting ? t("posting") : t("postComment")}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Compose — guest */}
      {userDisplayName === null && (
        <form onSubmit={submit} className="space-y-1.5">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder={t("yourName")}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("addComment")}
              className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#2B4B8C] dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={submitting || !canPost}
              className="shrink-0 bg-[#2B4B8C] text-white rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40"
            >
              {submitting ? t("posting") : t("postComment")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

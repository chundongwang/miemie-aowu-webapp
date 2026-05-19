#!/usr/bin/env bash
# Backfill check-in records from historical activity data (items created, comments, reactions).
# One 🫥 check-in per user per unique activity date. Safe to run multiple times (INSERT OR IGNORE).
#
# Usage:
#   bash scripts/backfill-checkins.sh          # production (--remote)
#   bash scripts/backfill-checkins.sh --local  # local dev DB

MODE="${1:---remote}"

SQL="
INSERT OR IGNORE INTO check_ins (id, user_id, date_str, emoji, created_at)
SELECT lower(hex(randomblob(8))), user_id, date_str, '🫥', min_ts
FROM (
  SELECT user_id, date_str, MIN(ts) AS min_ts
  FROM (
    -- Items created by list owners
    SELECT l.owner_id AS user_id,
           date(datetime(i.created_at/1000, 'unixepoch')) AS date_str,
           i.created_at AS ts
    FROM items i JOIN lists l ON l.id = i.list_id
    WHERE l.owner_id IS NOT NULL

    UNION ALL

    -- Items visible to list recipients
    SELECT l.recipient_id AS user_id,
           date(datetime(i.created_at/1000, 'unixepoch')) AS date_str,
           i.created_at AS ts
    FROM items i JOIN lists l ON l.id = i.list_id
    WHERE l.recipient_id IS NOT NULL

    UNION ALL

    -- Comments authored by users
    SELECT user_id,
           date(datetime(created_at/1000, 'unixepoch')) AS date_str,
           created_at AS ts
    FROM comments
    WHERE user_id IS NOT NULL

    UNION ALL

    -- Reactions
    SELECT user_id,
           date(datetime(created_at/1000, 'unixepoch')) AS date_str,
           created_at AS ts
    FROM reactions
    WHERE user_id IS NOT NULL
  )
  WHERE user_id IS NOT NULL AND date_str IS NOT NULL
  GROUP BY user_id, date_str
)
"

echo "Running backfill ($MODE)…"
npx wrangler d1 execute miemie-aowu-db $MODE --command="$SQL"
echo "Done."

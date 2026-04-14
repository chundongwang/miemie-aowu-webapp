import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId } from "@/lib/auth";
import { getDB } from "@/lib/db";
import { getT } from "@/lib/i18n";

type PublicList = {
  id: string;
  title: string;
  emoji: string;
  ownerDisplayName: string;
  itemCount: number;
};

export default async function RootPage() {
  const userId = await getAuthUserId();
  if (userId) redirect("/lists");

  const { t, locale } = await getT();

  const db = await getDB();
  const rows = await db
    .prepare(
      `SELECT l.id, l.title, l.emoji,
              o.display_name AS owner_display_name,
              COUNT(i.id) AS item_count
       FROM lists l
       JOIN users o ON o.id = l.owner_id
       LEFT JOIN items i ON i.list_id = l.id
       WHERE l.is_public = 1
       GROUP BY l.id
       ORDER BY RANDOM()
       LIMIT 12`
    )
    .all();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lists: PublicList[] = rows.results.map((r: any) => ({
    id: r.id,
    title: r.title,
    emoji: r.emoji,
    ownerDisplayName: r.owner_display_name,
    itemCount: r.item_count,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold">{t("appName")}</h1>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-800">{t("signIn")}</Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-[#2B4B8C] text-white px-3 py-1.5 rounded-lg"
            >
              {t("getStarted")}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <p className="text-gray-500 text-sm">{t("tagline")}</p>
        </div>

        {lists.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm mb-4">{t("noPublicLists")}</p>
            <Link
              href="/register"
              className="inline-block bg-[#2B4B8C] text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {t("beFirst")}
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              {t("communityLists")}
            </h2>
            <ul className="space-y-3">
              {lists.map((list) => {
                const count = list.itemCount;
                const countLabel = count === 1 ? t("itemSingular") : t("itemPlural");
                const byPrefix = t("by");
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
                            {byPrefix ? `${byPrefix} ` : ""}{list.ownerDisplayName} · {count} {countLabel}
                          </p>
                        </div>
                        <span className="text-gray-300 text-lg">›</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="text-center mt-8">
              <Link
                href="/register"
                className="inline-block bg-[#2B4B8C] text-white text-sm font-medium px-5 py-2.5 rounded-lg"
              >
                {t("createYours")}
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

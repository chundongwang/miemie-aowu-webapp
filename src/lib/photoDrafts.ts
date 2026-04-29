/**
 * IndexedDB-backed draft storage for pending photo uploads.
 * Key: itemId  →  Value: { photos: [{ blob, name }], savedAt }
 * Drafts survive page reloads and are cleared only after server-side
 * verification confirms the photo was persisted.
 */

const DB_NAME = "miemie_photo_drafts";
const STORE   = "drafts";
const VERSION = 1;

export type DraftPhoto = { blob: Blob; name: string };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx  = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      })
  );
}

export async function saveDraft(itemId: string, photos: DraftPhoto[]): Promise<void> {
  await run("readwrite", (s) => s.put({ photos, savedAt: Date.now() }, itemId));
}

export async function loadDraft(itemId: string): Promise<DraftPhoto[] | null> {
  const entry = await run<{ photos: DraftPhoto[] } | undefined>("readonly", (s) => s.get(itemId));
  return entry?.photos ?? null;
}

export async function clearDraft(itemId: string): Promise<void> {
  await run("readwrite", (s) => s.delete(itemId));
}

/**
 * After a successful upload, verify the photo is reachable on the server
 * by fetching its URL. Clears the draft on success, leaves it on failure.
 */
export async function verifyAndClear(itemId: string, photoUrl: string): Promise<boolean> {
  try {
    const res = await fetch(photoUrl);
    if (res.ok) {
      await clearDraft(itemId);
      return true;
    }
  } catch { /* network issue — keep draft */ }
  return false;
}

import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDB(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return (env as unknown as Cloudflare.Env).miemie_aowu_db;
}

export async function getPhotoBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return (env as unknown as Cloudflare.Env).miemie_aowu_photos;
}

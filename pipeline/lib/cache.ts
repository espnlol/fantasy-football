import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.join(__dirname, '..', '.cache');

function keyToFile(key: string): string {
  const safe = key.replace(/[^a-z0-9._-]+/gi, '_');
  return path.join(CACHE_DIR, safe);
}

/**
 * Fetches a text resource with an on-disk cache. If the network fetch fails
 * (e.g. the data source is briefly unreachable) but a stale copy exists on
 * disk, the stale copy is served rather than failing the request outright —
 * a fantasy tool that's a day stale beats one that's down on Sunday morning.
 */
export async function fetchTextCached(
  url: string,
  opts: { key: string; ttlMs: number },
): Promise<{ text: string; fromCache: boolean; fetchedAt: number; stale: boolean }> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = keyToFile(opts.key);
  const metaFile = `${file}.meta.json`;

  let cached: { fetchedAt: number } | null = null;
  if (fs.existsSync(file) && fs.existsSync(metaFile)) {
    try {
      cached = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    } catch {
      cached = null;
    }
  }

  const isFresh = !!cached && Date.now() - cached.fetchedAt < opts.ttlMs;
  if (isFresh) {
    return { text: fs.readFileSync(file, 'utf8'), fromCache: true, fetchedAt: cached!.fetchedAt, stale: false };
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    const text = await res.text();
    const fetchedAt = Date.now();
    fs.writeFileSync(file, text);
    fs.writeFileSync(metaFile, JSON.stringify({ fetchedAt, url }));
    return { text, fromCache: false, fetchedAt, stale: false };
  } catch (err) {
    if (cached && fs.existsSync(file)) {
      console.warn(`[cache] refresh failed for ${url}: ${(err as Error).message}. Serving stale cache.`);
      return { text: fs.readFileSync(file, 'utf8'), fromCache: true, fetchedAt: cached.fetchedAt, stale: true };
    }
    throw err;
  }
}

/** Same as fetchTextCached but for binary payloads (e.g. gzipped CSVs) — stores raw bytes on disk. */
export async function fetchBufferCached(
  url: string,
  opts: { key: string; ttlMs: number },
): Promise<{ buffer: Buffer; fromCache: boolean; fetchedAt: number; stale: boolean }> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = keyToFile(opts.key);
  const metaFile = `${file}.meta.json`;

  let cached: { fetchedAt: number } | null = null;
  if (fs.existsSync(file) && fs.existsSync(metaFile)) {
    try {
      cached = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    } catch {
      cached = null;
    }
  }

  const isFresh = !!cached && Date.now() - cached.fetchedAt < opts.ttlMs;
  if (isFresh) {
    return { buffer: fs.readFileSync(file), fromCache: true, fetchedAt: cached!.fetchedAt, stale: false };
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const fetchedAt = Date.now();
    fs.writeFileSync(file, buffer);
    fs.writeFileSync(metaFile, JSON.stringify({ fetchedAt, url }));
    return { buffer, fromCache: false, fetchedAt, stale: false };
  } catch (err) {
    if (cached && fs.existsSync(file)) {
      console.warn(`[cache] refresh failed for ${url}: ${(err as Error).message}. Serving stale cache.`);
      return { buffer: fs.readFileSync(file), fromCache: true, fetchedAt: cached.fetchedAt, stale: true };
    }
    throw err;
  }
}

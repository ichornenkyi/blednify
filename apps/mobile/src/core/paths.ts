import { Directory, File, Paths } from 'expo-file-system';

import { fileStorageSupported } from './platform';

/**
 * Files are stored in the DB relative to the document directory, because the absolute container
 * path can change between app updates (iOS). Resolve with `absUri` at read time.
 */
export const DIRS = { local: 'local', art: 'art', music: 'music' } as const;

let docUriCache: string | null = null;

export function docUri(): string {
  if (docUriCache === null) {
    // Web has no document directory (and no local files): a prefix that no real URI starts with.
    if (!fileStorageSupported) return (docUriCache = 'blednify-no-files:/');
    const u = Paths.document.uri;
    docUriCache = u.endsWith('/') ? u : `${u}/`;
  }
  return docUriCache;
}

export const absUri = (rel: string): string => docUri() + rel;

/** Inverse of `absUri` for URIs inside the document directory; other URIs are returned unchanged. */
export const relUri = (uri: string): string => (uri.startsWith(docUri()) ? uri.slice(docUri().length) : uri);

export function ensureDir(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export const fileAt = (rel: string): File => new File(absUri(rel));

export function deleteQuietly(rel: string | null | undefined): void {
  if (!rel) return;
  try {
    const f = fileAt(rel);
    if (f.exists) f.delete();
  } catch {
    // Already gone or not removable; nothing else references it.
  }
}

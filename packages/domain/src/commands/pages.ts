/** A page of a cursor-paged list and where the next one begins. */
export interface CursorPage {
  /** The cursor of the next page; null on the last one. */
  readonly nextCursor: string | null;
}

/**
 * Reads a cursor-paged list page by page: every page, or the first `pages`
 * of them. Says where the rest begins (null when nothing is left), so a
 * caller can offer more. A page that cannot be read (null) ends the list.
 */
export async function collectPages<P extends CursorPage, T>(
  read: (cursor: string | undefined) => Promise<P | null>,
  items: (page: P) => readonly T[],
  pages = Number.POSITIVE_INFINITY,
): Promise<{ items: T[]; nextCursor: string | null }> {
  const collected: T[] = [];
  let cursor: string | undefined;

  for (let count = 0; count < pages; count += 1) {
    const page = await read(cursor);

    if (!page) {
      return { items: collected, nextCursor: null };
    }

    collected.push(...items(page));

    if (page.nextCursor === null) {
      return { items: collected, nextCursor: null };
    }

    cursor = page.nextCursor;
  }

  return { items: collected, nextCursor: cursor ?? null };
}

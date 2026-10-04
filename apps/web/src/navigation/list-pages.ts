/** A page's search parameters, as Next.js gives them. */
export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * How many pages of a list the address asks for (`?<key>=n`), 1 unless it
 * names a positive whole number. A list is never longer than what the
 * caller has, so a large number only costs their own data.
 */
export function pagesShown(params: SearchParams, key: string): number {
  const value = params[key];
  const pages = typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isSafeInteger(pages) && pages > 0 ? pages : 1;
}

/**
 * The address that shows one more page of the list `key`, keeping every
 * other choice on the page and returning to the list (`#anchor`). Lists
 * grow in place, so the address can be shared and works without script.
 */
export function morePagesHref(
  pathname: string,
  params: SearchParams,
  key: string,
  anchor: string,
): string {
  const search = new URLSearchParams();

  for (const [name, value] of Object.entries(params)) {
    for (const each of [value ?? []].flat()) search.append(name, each);
  }

  search.set(key, String(pagesShown(params, key) + 1));

  return `${pathname}?${search.toString()}#${anchor}`;
}

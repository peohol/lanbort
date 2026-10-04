import { describe, expect, it, vi } from "vitest";
import { collectPages } from "./pages";

/** A list of `total` numbers served `size` at a time; the cursor is an offset. */
function pagedList(total: number, size: number) {
  return vi.fn(async (cursor: string | undefined) => {
    const start = Number(cursor ?? 0);
    const end = Math.min(start + size, total);

    return {
      values: Array.from({ length: end - start }, (_, index) => start + index),
      nextCursor: end < total ? String(end) : null,
    };
  });
}

describe("collectPages", () => {
  it("reads every page when no limit is given", async () => {
    const read = pagedList(7, 3);

    expect(await collectPages(read, (page) => page.values)).toEqual({
      items: [0, 1, 2, 3, 4, 5, 6],
      nextCursor: null,
    });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("stops after the given number of pages and says where the rest begins", async () => {
    const read = pagedList(7, 3);

    expect(await collectPages(read, (page) => page.values, 2)).toEqual({
      items: [0, 1, 2, 3, 4, 5],
      nextCursor: "6",
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("has nothing more when the last page is exactly the limit", async () => {
    expect(
      await collectPages(pagedList(6, 3), (page) => page.values, 2),
    ).toEqual({ items: [0, 1, 2, 3, 4, 5], nextCursor: null });
  });

  it("ends the list at a page that cannot be read", async () => {
    const pages = [{ values: [1], nextCursor: "1" }, null];
    const read = vi.fn(async () => pages.shift() ?? null);

    expect(await collectPages(read, (page) => page.values)).toEqual({
      items: [1],
      nextCursor: null,
    });
    expect(read).toHaveBeenCalledTimes(2);
  });
});

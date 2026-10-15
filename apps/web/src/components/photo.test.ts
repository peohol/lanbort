import { afterEach, describe, expect, it, vi } from "vitest";
import { photoFormat, readPhoto } from "./photo";

/** The start of an ISO-BMFF file: an `ftyp` box with these brands. */
function ftyp(major: string, ...compatible: string[]) {
  const brands = [major, "\0\0\0\0", ...compatible].join("");
  const size = 8 + brands.length;
  const bytes = new Uint8Array(size + 8);
  new DataView(bytes.buffer).setUint32(0, size);
  bytes.set(new TextEncoder().encode(`ftyp${brands}`), 4);
  return bytes;
}

const startingWith = (...start: number[]) =>
  Uint8Array.from([...start, ...new Array(20).fill(0)]);

describe("photoFormat", () => {
  it("knows a HEIC photo by its bytes, whatever it is called", () => {
    expect(photoFormat(ftyp("heic", "mif1", "heic"))).toBe("heif");
    expect(photoFormat(ftyp("mif1", "heic"))).toBe("heif");
  });

  it("tells AVIF, which shares the box, from HEIC", () => {
    expect(photoFormat(ftyp("avif", "mif1", "miaf"))).toBe("avif");
    expect(photoFormat(ftyp("mif1", "avif"))).toBe("avif");
    expect(photoFormat(ftyp("isom", "mp41"))).toBeNull();
  });

  it("knows the formats browsers draw", () => {
    expect(photoFormat(startingWith(0xff, 0xd8, 0xff, 0xe1))).toBe("jpeg");
    expect(photoFormat(startingWith(0x89, 0x50, 0x4e, 0x47))).toBe("png");
    expect(photoFormat(new TextEncoder().encode("GIF89a"))).toBe("gif");
    expect(photoFormat(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe(
      "webp",
    );
  });

  it("knows nothing of anything else", () => {
    expect(photoFormat(new TextEncoder().encode("not a photo"))).toBeNull();
    expect(photoFormat(new Uint8Array())).toBeNull();
  });
});

describe("readPhoto", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A chosen file that cannot be read the first `failures` times. */
  function arrivingFile(failures: number) {
    let reads = 0;
    return {
      reads: () => reads,
      file: {
        arrayBuffer: async () => {
          reads += 1;
          if (reads <= failures) throw new DOMException("", "NotReadableError");
          return startingWith(0xff, 0xd8, 0xff).buffer;
        },
      } as Blob,
    };
  }

  const read = async (file: Blob) => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "createImageBitmap",
      async () => ({ width: 40, height: 30, close() {} }) as ImageBitmap,
    );
    const result = readPhoto(file, 2048);
    await vi.runAllTimersAsync();
    return result;
  };

  it("reads a photo again when it was not all there at first", async () => {
    const { file, reads } = arrivingFile(2);

    expect(await read(file)).toMatchObject({ ok: true, photo: { width: 40 } });
    expect(reads()).toBe(3);
  });

  it("says the photo could not be fetched when it never arrives", async () => {
    const { file, reads } = arrivingFile(Infinity);

    expect(await read(file)).toEqual({ ok: false, problem: "unreadable" });
    expect(reads()).toBe(3);
  });
});

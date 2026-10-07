import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeImage, storedImageMaxSide } from "./images";

const photo = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: "#336699" },
  });

describe("normalizeImage (PS-OBJ-002, malicious uploads)", () => {
  it("re-encodes a photo as WebP without EXIF or GPS metadata", async () => {
    const upload = await photo(800, 600)
      .jpeg()
      .withExif({
        IFD0: { Copyright: "owner name" },
        IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "E" },
      })
      .toBuffer();
    expect((await sharp(upload).metadata()).exif).toBeDefined();

    const image = await normalizeImage(upload);

    expect(image).toMatchObject({
      contentType: "image/webp",
      width: 800,
      height: 600,
    });
    const stored = await sharp(image!.bytes).metadata();
    expect(stored.format).toBe("webp");
    expect(stored.exif).toBeUndefined();
    expect(stored.icc).toBeUndefined();
    expect(stored.xmp).toBeUndefined();
  });

  it("applies the camera orientation before dropping it", async () => {
    const upload = await photo(300, 100)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    expect(await normalizeImage(upload)).toMatchObject({
      width: 100,
      height: 300,
    });
  });

  it("scales large photos down and never enlarges small ones", async () => {
    const large = await normalizeImage(
      await photo(4000, 3000).png().toBuffer(),
    );
    const small = await normalizeImage(await photo(64, 32).webp().toBuffer());

    expect(large).toMatchObject({ width: storedImageMaxSide, height: 1536 });
    expect(small).toMatchObject({ width: 64, height: 32 });
  });

  it("keeps no more than a smaller longest side when asked", async () => {
    const picture = await normalizeImage(
      await photo(1000, 800).jpeg().toBuffer(),
      { maxSide: 384 },
    );

    expect(picture).toMatchObject({ width: 384, height: 307 });
  });

  it.each([
    [
      "an SVG with script",
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    ],
    ["an HTML page", Buffer.from("<!doctype html><script>alert(1)</script>")],
    ["random bytes", Buffer.from("not an image at all")],
    ["an empty body", Buffer.alloc(0)],
  ])("refuses %s", async (_name, bytes) => {
    expect(await normalizeImage(new Uint8Array(bytes))).toBeNull();
  });

  it("refuses formats outside the allowlist", async () => {
    const gif = await photo(10, 10).gif().toBuffer();
    const tiff = await photo(10, 10).tiff().toBuffer();

    expect(await normalizeImage(gif)).toBeNull();
    expect(await normalizeImage(tiff)).toBeNull();
  });

  it("refuses a truncated image", async () => {
    const jpeg = await photo(400, 300).jpeg().toBuffer();

    expect(await normalizeImage(jpeg.subarray(0, jpeg.length / 2))).toBeNull();
  });

  it("refuses images with too many pixels before decoding them", async () => {
    const huge = await photo(10_000, 6_000)
      .png({ compressionLevel: 9 })
      .toBuffer();

    expect(await normalizeImage(huge)).toBeNull();
  });
});

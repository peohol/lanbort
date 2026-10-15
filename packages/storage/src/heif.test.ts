import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { heifToJpeg } from "./heif";

/** A 480×320 HEIC photo, red on the left and green on the right. */
const heic = () => readFile(new URL("./fixtures/photo.heic", import.meta.url));

describe("heifToJpeg", () => {
  it("turns a HEIC photo into a JPEG without metadata", async () => {
    const jpeg = await heifToJpeg(await heic());

    const { format, width, height, exif, icc } = await sharp(jpeg!).metadata();
    expect({ format, width, height, exif, icc }).toEqual({
      format: "jpeg",
      width: 480,
      height: 320,
      exif: undefined,
      icc: undefined,
    });
    const { data } = await sharp(jpeg!).raw().toBuffer({
      resolveWithObject: true,
    });
    expect(data[0]).toBeGreaterThan(150);
    expect(data[1]).toBeLessThan(110);
  });

  it("keeps no more than the longest side asked for", async () => {
    const jpeg = await heifToJpeg(await heic(), { maxSide: 120 });

    expect(await sharp(jpeg!).metadata()).toMatchObject({
      width: 120,
      height: 80,
    });
  });

  it("refuses anything that is not a HEIF photo", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();

    expect(await heifToJpeg(png)).toBeNull();
    expect(await heifToJpeg(new TextEncoder().encode("ftypheic"))).toBeNull();
  });
});

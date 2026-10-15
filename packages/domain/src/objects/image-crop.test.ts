import { describe, expect, it } from "vitest";
import { cropPixels, cropShares, storedCrop } from "./image-crop";

const picture = { width: 400, height: 300 };

describe("a picture's square (PS-OBJ-002)", () => {
  it("is kept in the picture's pixels and given as shares of it", () => {
    const pixels = cropPixels(picture, {
      x: 0.25,
      y: 0,
      width: 0.75,
      height: 1,
    });

    expect(pixels).toEqual({ left: 100, top: 0, side: 300 });
    expect(cropShares(picture, pixels)).toEqual({
      x: 0.25,
      y: 0,
      width: 0.75,
      height: 1,
    });
  });

  it("stays a square inside the picture, whatever it was asked to be", () => {
    expect(
      cropPixels(picture, { x: 0.9, y: 0.9, width: 1, height: 1 }),
    ).toEqual({ left: 100, top: 0, side: 300 });
    // Shares from a scaled copy round to a square a pixel apart.
    expect(
      cropPixels(picture, { x: 0.1, y: 0.1, width: 0.5, height: 0.668 }),
    ).toEqual({ left: 40, top: 30, side: 200 });
    expect(
      cropPixels(picture, { x: 0, y: 0, width: 0.0001, height: 0.0001 }),
    ).toEqual({ left: 0, top: 0, side: 1 });
  });

  it("is the middle where none is stored", () => {
    expect(
      storedCrop({
        ...picture,
        crop_left: null,
        crop_top: null,
        crop_side: null,
      }),
    ).toBeNull();
    expect(
      storedCrop({ ...picture, crop_left: 0, crop_top: 0, crop_side: 300 }),
    ).toEqual({ x: 0, y: 0, width: 0.75, height: 1 });
  });
});

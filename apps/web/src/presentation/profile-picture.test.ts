import { describe, expect, it } from "vitest";
import {
  clampCrop,
  type Crop,
  cropScale,
  maxZoom,
  pictureFrameStyle,
  pictureOutputSize,
} from "./profile-picture";

const photo = { width: 800, height: 600 };
const square = { aspectRatio: 1, cornerRadius: 0 };
const portrait = { aspectRatio: 0.8, cornerRadius: 0.1 };

/**
 * Whether every corner of the frame (one frame wide) lies on the photo as
 * the crop places it, so the picture has no empty corner.
 */
function covers(crop: Crop, shape = square) {
  const scale = cropScale(photo, crop, shape);
  const angle = (crop.rotation * Math.PI) / 180;
  const half = { x: 0.5, y: 0.5 / shape.aspectRatio };

  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].every(([sx, sy]) => {
    // The corner relative to the photo's centre, along the photo's axes.
    const dx = sx! * half.x - crop.x;
    const dy = sy! * half.y - crop.y;
    const u = dx * Math.cos(angle) + dy * Math.sin(angle);
    const v = -dx * Math.sin(angle) + dy * Math.cos(angle);
    const slack = 1e-9;

    return (
      Math.abs(u) <= (scale * photo.width) / 2 + slack &&
      Math.abs(v) <= (scale * photo.height) / 2 + slack
    );
  });
}

describe("the picture's shape (OD-0027)", () => {
  it("draws a circle, a square or rounded corners from the same setting", () => {
    expect(pictureFrameStyle({ aspectRatio: 1, cornerRadius: 0.5 })).toEqual({
      aspectRatio: "1",
      borderRadius: "50% / 50%",
    });
    expect(pictureFrameStyle(square).borderRadius).toBe("0% / 0%");
    // Circular corners of a tenth of the shorter side on a 4:5 portrait.
    expect(pictureFrameStyle(portrait)).toEqual({
      aspectRatio: "0.8",
      borderRadius: "10% / 8%",
    });
  });

  it("uploads the picture no larger than the server keeps", () => {
    expect(pictureOutputSize(square)).toEqual({ width: 384, height: 384 });
    expect(pictureOutputSize(portrait)).toEqual({ width: 307, height: 384 });
    expect(pictureOutputSize({ aspectRatio: 2, cornerRadius: 0 })).toEqual({
      width: 384,
      height: 192,
    });
  });
});

describe("cropping a photo to the frame", () => {
  it("starts with the photo just covering the frame", () => {
    expect(cropScale(photo, { zoom: 1, rotation: 0, x: 0, y: 0 }, square)).toBe(
      1 / 600,
    );
    expect(covers({ zoom: 1, rotation: 0, x: 0, y: 0 })).toBe(true);
  });

  it("keeps the zoom between covering the frame and the closest view", () => {
    expect(clampCrop(photo, { zoom: 0.2, rotation: 0, x: 0, y: 0 }).zoom).toBe(
      1,
    );
    expect(clampCrop(photo, { zoom: 99, rotation: 0, x: 0, y: 0 }).zoom).toBe(
      maxZoom,
    );
  });

  it("moves the photo only as far as it still fills the frame", () => {
    const moved = clampCrop(
      photo,
      { zoom: 1, rotation: 0, x: 3, y: -3 },
      square,
    );

    expect(moved.x).toBeCloseTo(800 / 600 / 2 - 0.5);
    expect(moved.y).toBeCloseTo(0);
    expect(covers(moved)).toBe(true);
  });

  it("turns a rotation into one within a half turn either way", () => {
    expect(clampCrop(photo, { zoom: 1, rotation: 270, x: 0, y: 0 })).toEqual(
      expect.objectContaining({ rotation: -90 }),
    );
    expect(
      clampCrop(photo, { zoom: 1, rotation: -450, x: 0, y: 0 }).rotation,
    ).toBe(-90);
  });

  it("leaves no empty corner, however the photo is turned, zoomed and moved", () => {
    for (const shape of [square, portrait]) {
      for (let rotation = -180; rotation <= 180; rotation += 15) {
        for (const zoom of [1, 1.7, 4]) {
          for (const [x, y] of [
            [0, 0],
            [2, 2],
            [-2, 0.4],
            [0.1, -5],
          ]) {
            const crop = clampCrop(
              photo,
              { zoom, rotation, x: x!, y: y! },
              shape,
            );
            expect(covers(crop, shape), JSON.stringify(crop)).toBe(true);
          }
        }
      }
    }
  });
});

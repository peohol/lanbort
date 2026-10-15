import { describe, expect, it } from "vitest";
import {
  clampCrop,
  type Crop,
  cropFromSquare,
  cropScale,
  cropToSquare,
  initialCrop,
  maxZoom,
} from "./picture-crop";

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

describe("cropping a photo to the frame", () => {
  it("starts with the photo just covering the frame", () => {
    expect(cropScale(photo, { zoom: 1, rotation: 0, x: 0, y: 0 }, square)).toBe(
      1 / 600,
    );
    expect(covers({ zoom: 1, rotation: 0, x: 0, y: 0 })).toBe(true);
  });

  it("keeps the zoom between covering the frame and the closest view", () => {
    expect(
      clampCrop(photo, { zoom: 0.2, rotation: 0, x: 0, y: 0 }, square).zoom,
    ).toBe(1);
    expect(
      clampCrop(photo, { zoom: 99, rotation: 0, x: 0, y: 0 }, square).zoom,
    ).toBe(maxZoom);
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
    expect(
      clampCrop(photo, { zoom: 1, rotation: 270, x: 0, y: 0 }, square),
    ).toEqual(expect.objectContaining({ rotation: -90 }));
    expect(
      clampCrop(photo, { zoom: 1, rotation: -450, x: 0, y: 0 }, square)
        .rotation,
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

describe("a square crop as the part of the photo it shows (PS-OBJ-002)", () => {
  it("starts with the middle of the photo", () => {
    expect(cropToSquare(photo, initialCrop)).toEqual({
      x: 100 / 800,
      y: 0,
      width: 600 / 800,
      height: 1,
    });
  });

  it("gives the same crop back from the part it shows", () => {
    for (const crop of [
      { zoom: 1, rotation: 0, x: 1 / 6, y: 0 },
      { zoom: 2.5, rotation: 0, x: -0.4, y: 0.3 },
    ]) {
      const placed = clampCrop(photo, crop, square);
      const back = cropFromSquare(photo, cropToSquare(photo, placed));

      expect(back.zoom).toBeCloseTo(placed.zoom);
      expect(back.x).toBeCloseTo(placed.x);
      expect(back.y).toBeCloseTo(placed.y);
    }
  });

  it("is the same part at any size the photo is read at", () => {
    const placed = clampCrop(
      photo,
      { zoom: 2, rotation: 0, x: 0.3, y: -0.2 },
      square,
    );
    const smaller = { width: 400, height: 300 };
    const shown = cropToSquare(photo, placed);
    const again = cropToSquare(smaller, cropFromSquare(smaller, shown));

    expect(again.x).toBeCloseTo(shown.x);
    expect(again.y).toBeCloseTo(shown.y);
    expect(again.width).toBeCloseTo(shown.width);
  });
});

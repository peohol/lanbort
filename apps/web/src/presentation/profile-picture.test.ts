import { describe, expect, it } from "vitest";
import { pictureFrameStyle, pictureOutputSize } from "./profile-picture";

const square = { aspectRatio: 1, cornerRadius: 0 };
const portrait = { aspectRatio: 0.8, cornerRadius: 0.1 };

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

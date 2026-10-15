import { describe, expect, it } from "vitest";
import {
  cropChanged,
  croppedStyle,
  thingPictureHref,
  thingPictureImage,
} from "./object-images";

const imageId = "00000000-0000-4000-8000-0000000000a1";
const id = "00000000-0000-4000-8000-0000000000b1";
const crop = null;

describe("a thing's picture in a list (PS-OBJ-021)", () => {
  it("is read the way the reader sees the thing there", () => {
    expect(
      thingPictureHref({ through: "loan", loanId: id, imageId, crop }),
    ).toBe(`/api/loans/${id}/images/${imageId}`);
    expect(
      thingPictureHref({
        through: "loan_request",
        requestId: id,
        imageId,
        crop,
      }),
    ).toBe(`/api/loan-requests/${id}/images/${imageId}`);
    expect(
      thingPictureHref({ through: "owner", objectId: id, imageId, crop }),
    ).toBe(`/api/objects/${id}/images/${imageId}`);
  });

  it("is nothing without a picture", () => {
    expect(thingPictureHref(null)).toBeNull();
    expect(thingPictureImage(null)).toBeNull();
  });

  it("is shown in the square the owners chose (PS-OBJ-002)", () => {
    const square = { x: 0.25, y: 0, width: 0.75, height: 1 };

    expect(
      thingPictureImage({
        through: "owner",
        objectId: id,
        imageId,
        crop: square,
      }),
    ).toEqual({ src: `/api/objects/${id}/images/${imageId}`, crop: square });
  });
});

describe("a picture shown in its square (PS-OBJ-002)", () => {
  it("fills the box with the square and moves the rest out of view", () => {
    // A 4:3 picture whose right-hand square is chosen.
    expect(croppedStyle({ x: 0.25, y: 0, width: 0.75, height: 1 })).toEqual({
      width: "133.3333%",
      height: "100%",
      left: "-33.3333%",
      top: "0%",
    });
    // A 3:4 picture's middle square.
    expect(croppedStyle({ x: 0, y: 0.125, width: 1, height: 0.75 })).toEqual({
      width: "100%",
      height: "133.3333%",
      left: "0%",
      top: "-16.6667%",
    });
  });
});

describe("a square chosen in the thing's form (PS-OBJ-002)", () => {
  const square = { x: 0.25, y: 0, width: 0.75, height: 1 };

  it("is saved when chosen for a new photo or changed for a saved one", () => {
    expect(cropChanged({ kind: "new", crop: null })).toBe(false);
    expect(cropChanged({ kind: "new", crop: square })).toBe(true);
    expect(
      cropChanged({ kind: "saved", crop: { ...square }, savedCrop: square }),
    ).toBe(false);
    expect(cropChanged({ kind: "saved", crop: null, savedCrop: square })).toBe(
      true,
    );
    expect(
      cropChanged({
        kind: "saved",
        crop: { ...square, x: 0 },
        savedCrop: square,
      }),
    ).toBe(true);
  });
});

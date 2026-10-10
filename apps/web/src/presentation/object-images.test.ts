import { describe, expect, it } from "vitest";
import { thingPictureHref } from "./object-images";

const imageId = "00000000-0000-4000-8000-0000000000a1";
const id = "00000000-0000-4000-8000-0000000000b1";

describe("a thing's picture in a list (PS-OBJ-021)", () => {
  it("is read the way the reader sees the thing there", () => {
    expect(thingPictureHref({ through: "loan", loanId: id, imageId })).toBe(
      `/api/loans/${id}/images/${imageId}`,
    );
    expect(
      thingPictureHref({ through: "loan_request", requestId: id, imageId }),
    ).toBe(`/api/loan-requests/${id}/images/${imageId}`);
    expect(thingPictureHref({ through: "owner", objectId: id, imageId })).toBe(
      `/api/objects/${id}/images/${imageId}`,
    );
  });

  it("is nothing without a picture", () => {
    expect(thingPictureHref(null)).toBeNull();
  });
});

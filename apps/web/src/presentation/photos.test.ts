import { describe, expect, it } from "vitest";
import { photoProblemText } from "./photos";

describe("photoProblemText", () => {
  it("says nothing when every photo could be used", () => {
    expect(photoProblemText([], 3)).toBeNull();
  });

  it("speaks of a photo chosen alone as the photo", () => {
    expect(photoProblemText(["heif"], 1)).toBe(
      "Bildet er i HEIC-format, som denne nettleseren ikke kan åpne. Lagre det som JPEG og velg det på nytt.",
    );
  });

  it("counts the photos among several, one sentence per problem", () => {
    expect(
      photoProblemText(["undecodable", "unreadable", "unreadable"], 4),
    ).toBe(
      "2 bilder kunne ikke hentes fra enheten, kanskje fordi de fortsatt lastes ned fra en skytjeneste. Vent litt og velg dem på nytt. Ett bilde kunne ikke åpnes. Velg det på nytt, eller velg et bilde i JPEG, PNG eller WebP.",
    );
    expect(photoProblemText(["heif", "heif"], 2)).toContain(
      "Lagre dem som JPEG og velg dem på nytt.",
    );
  });
});

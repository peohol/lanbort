import { profilePictureMaxSide } from "@lanbort/contracts";
import type { CSSProperties } from "react";
import type { PictureShape } from "./picture-crop";

/**
 * The shape profile pictures are shown in (PS-USR-002), in one place: a
 * circle (OD-0027). The picture editor crops to the same frame, so what a
 * person frames is exactly what others see.
 */
export const pictureShape: PictureShape = { aspectRatio: 1, cornerRadius: 0.5 };

/** The initials of a name, where a person shows no picture. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** The address of a picture the reader may see, behind the API's policy. */
export const pictureSrc = (pictureId: string) =>
  `/api/people/pictures/${pictureId}`;

/**
 * The frame's own CSS: its proportions, and corners that stay circular arcs
 * whatever the proportions (horizontal and vertical radius apart).
 */
export function pictureFrameStyle(
  shape: PictureShape = pictureShape,
): CSSProperties {
  const { aspectRatio, cornerRadius } = shape;
  const percent = (share: number) => `${+(share * 100).toFixed(3)}%`;
  // The shorter side as a share of the width, and of the height.
  const ofWidth = Math.min(1, 1 / aspectRatio);
  const ofHeight = Math.min(aspectRatio, 1);

  return {
    aspectRatio: String(aspectRatio),
    borderRadius: `${percent(cornerRadius * ofWidth)} / ${percent(cornerRadius * ofHeight)}`,
  };
}

/** The size of the cropped picture that is uploaded, in pixels. */
export function pictureOutputSize(shape: PictureShape = pictureShape) {
  const { aspectRatio } = shape;

  return aspectRatio >= 1
    ? {
        width: profilePictureMaxSide,
        height: Math.round(profilePictureMaxSide / aspectRatio),
      }
    : {
        width: Math.round(profilePictureMaxSide * aspectRatio),
        height: profilePictureMaxSide,
      };
}

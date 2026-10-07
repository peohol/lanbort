import { profilePictureMaxSide } from "@lanbort/contracts";
import type { CSSProperties } from "react";

/**
 * The shape profile pictures are shown in (PS-USR-002), in one place:
 * whether it is a circle, a square, a square with rounded corners or
 * another rectangle is not decided yet (OD-0027). `aspectRatio` is width
 * to height; `cornerRadius` is the corners' radius as a share of the
 * shorter side, so 0.5 with a ratio of 1 is a circle and 0 a square. The
 * picture editor crops to the same frame, so what a person frames is
 * exactly what others see.
 */
export const pictureShape = { aspectRatio: 1, cornerRadius: 0.5 } as const;

export type PictureShape = { aspectRatio: number; cornerRadius: number };

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

/** A photo's size in pixels, upright. */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * How the photo lies in the frame. `zoom` is 1 when the photo just covers
 * the frame and grows from there; `rotation` is in degrees, clockwise;
 * `x` and `y` move the photo's centre from the frame's centre, in frame
 * widths, so a crop means the same at any size it is drawn.
 */
export interface Crop {
  readonly zoom: number;
  readonly rotation: number;
  readonly x: number;
  readonly y: number;
}

export const initialCrop: Crop = { zoom: 1, rotation: 0, x: 0, y: 0 };

/** How far one can zoom in from just covering the frame. */
export const maxZoom = 5;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Half the frame's extent along the photo's own axes, rotated. */
function frameReach(rotation: number, shape: PictureShape) {
  const width = 1;
  const height = 1 / shape.aspectRatio;
  const cos = Math.abs(Math.cos(radians(rotation)));
  const sin = Math.abs(Math.sin(radians(rotation)));

  return {
    x: (width * cos + height * sin) / 2,
    y: (width * sin + height * cos) / 2,
  };
}

/**
 * Frame widths per photo pixel, so the photo covers the frame at this
 * rotation and zoom: no empty corner, whatever the rotation.
 */
export function cropScale(
  image: ImageSize,
  crop: Crop,
  shape: PictureShape = pictureShape,
): number {
  const reach = frameReach(crop.rotation, shape);

  return (
    Math.max((2 * reach.x) / image.width, (2 * reach.y) / image.height) *
    crop.zoom
  );
}

const clamp = (value: number, limit: number) =>
  Math.min(limit, Math.max(-limit, value));

/** Rotates `point` by `degrees`, clockwise on screen (y grows downwards). */
function rotate(point: { x: number; y: number }, degrees: number) {
  const cos = Math.cos(radians(degrees));
  const sin = Math.sin(radians(degrees));

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

/**
 * The crop within its limits: zoom between covering the frame and
 * {@link maxZoom}, rotation within a half turn either way, and the photo
 * moved only as far as it still covers the whole frame.
 */
export function clampCrop(
  image: ImageSize,
  crop: Crop,
  shape: PictureShape = pictureShape,
): Crop {
  const zoom = Math.min(maxZoom, Math.max(1, crop.zoom));
  const rotation = ((((crop.rotation + 180) % 360) + 360) % 360) - 180;
  const scale = cropScale(image, { ...crop, zoom, rotation }, shape);
  const reach = frameReach(rotation, shape);
  // The offset along the photo's axes, where its edges are straight.
  const along = rotate({ x: crop.x, y: crop.y }, -rotation);
  const limited = rotate(
    {
      x: clamp(along.x, Math.max(0, (scale * image.width) / 2 - reach.x)),
      y: clamp(along.y, Math.max(0, (scale * image.height) / 2 - reach.y)),
    },
    rotation,
  );

  return { zoom, rotation, x: limited.x, y: limited.y };
}

/** Where a frame lies on a canvas, in pixels. */
export interface FrameBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

/**
 * Draws the photo as the crop places it in `frame` (the same for the
 * editor's view and for the picture that is uploaded).
 */
export function drawCrop(
  context: CanvasRenderingContext2D,
  photo: CanvasImageSource,
  image: ImageSize,
  crop: Crop,
  frame: FrameBox,
  shape: PictureShape = pictureShape,
): void {
  const height = frame.width / shape.aspectRatio;
  const scale = cropScale(image, crop, shape) * frame.width;

  context.save();
  context.translate(
    frame.left + frame.width / 2 + crop.x * frame.width,
    frame.top + height / 2 + crop.y * frame.width,
  );
  context.rotate(radians(crop.rotation));
  context.scale(scale, scale);
  context.imageSmoothingQuality = "high";
  context.drawImage(photo, -image.width / 2, -image.height / 2);
  context.restore();
}

/** Adds the frame's outline to the current path, corners and all. */
export function traceFrame(
  context: CanvasRenderingContext2D,
  frame: FrameBox,
  shape: PictureShape = pictureShape,
): void {
  const { left, top, width } = frame;
  const height = width / shape.aspectRatio;
  const radius = shape.cornerRadius * Math.min(width, height);

  context.moveTo(left + radius, top);
  context.arcTo(left + width, top, left + width, top + height, radius);
  context.arcTo(left + width, top + height, left, top + height, radius);
  context.arcTo(left, top + height, left, top, radius);
  context.arcTo(left, top, left + width, top, radius);
  context.closePath();
}

import type { ObjectImageCrop } from "@lanbort/contracts";

/**
 * Placing a photo in a frame, the same for a profile picture (PS-USR-002)
 * and a thing's main picture (PS-OBJ-002): the editor's view and what is
 * kept are drawn and measured by the same code.
 */

/**
 * A frame's shape: `aspectRatio` is width to height; `cornerRadius` is the
 * corners' radius as a share of the shorter side, so 0.5 with a ratio of 1
 * is a circle and 0 a square.
 */
export type PictureShape = {
  readonly aspectRatio: number;
  readonly cornerRadius: number;
};

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

/** The longest side a photo is read at to frame it; more is never needed. */
export const cropReadMaxSide = 2048;

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
  shape: PictureShape,
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
  shape: PictureShape,
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
  shape: PictureShape,
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
  shape: PictureShape,
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

/**
 * A crop in a square frame, without rotation, as the square part of the
 * photo it shows: shares of the photo's width (`x`, `width`) and height
 * (`y`, `height`), whatever size the photo is read at.
 */
export function cropToSquare(image: ImageSize, crop: Crop): ObjectImageCrop {
  const shorter = Math.min(image.width, image.height);
  // The frame's side and centre, in photo pixels from its top left corner.
  const side = shorter / crop.zoom;
  const centre = {
    x: image.width / 2 - crop.x * side,
    y: image.height / 2 - crop.y * side,
  };
  const share = (value: number) => Math.min(1, Math.max(0, value));

  return {
    x: share((centre.x - side / 2) / image.width),
    y: share((centre.y - side / 2) / image.height),
    width: share(side / image.width),
    height: share(side / image.height),
  };
}

/** The crop that shows `square` of the photo in a square frame. */
export function cropFromSquare(
  image: ImageSize,
  square: ObjectImageCrop,
): Crop {
  const shorter = Math.min(image.width, image.height);
  const side = Math.min(
    square.width * image.width,
    square.height * image.height,
  );

  return {
    zoom: shorter / side,
    rotation: 0,
    x: (image.width / 2 - (square.x * image.width + side / 2)) / side,
    y: (image.height / 2 - (square.y * image.height + side / 2)) / side,
  };
}

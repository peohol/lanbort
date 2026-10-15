import type { ThingPicture } from "@lanbort/contracts";
import type { CSSProperties, ReactNode } from "react";
import {
  croppedStyle,
  type ThingImage,
  thingPictureImage,
} from "@/presentation/object-images";
import styles from "./thing-thumbnail.module.css";

/**
 * Where the picture stands: at the start of a row, in the place of its icon
 * (`row`); beside a page's title (`title`, KF7); in a thing's card in a
 * list (`card`, Tomat kjerneflyt 2 and 3); at the top of the owners' page
 * (`cover`); or as wide as its place (`fill`).
 */
export type ThumbnailSize = "row" | "title" | "card" | "cover" | "fill";

/**
 * A thing's first picture (PS-OBJ-021), read the way the reader sees the
 * thing: `image` where the page knows it, or `picture` from a list. It is
 * shown square, in the square the owners chose of it or else its middle
 * (PS-OBJ-002). Without one it is `fallback`, usually the row's icon, or
 * with `placeholder` a quiet square of the same size. Decorative unless
 * given an `alt`: the page names the thing in words.
 */
export function ThingThumbnail({
  picture = null,
  image = thingPictureImage(picture),
  size = "row",
  alt = "",
  placeholder = false,
  fallback = placeholder ? (
    <span className={`${styles.thumbnail} ${styles[size]} image-placeholder`} />
  ) : null,
}: {
  picture?: ThingPicture | null;
  image?: ThingImage | null;
  size?: ThumbnailSize;
  alt?: string;
  placeholder?: boolean;
  fallback?: ReactNode;
}) {
  if (!image) return fallback;

  const box = `${styles.thumbnail} ${styles[size]} ${styles.picture}`;
  // A private file behind the API's policy, not a static asset.
  const shown = (className: string | undefined, style?: CSSProperties) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      style={style}
      src={image.src}
      alt={alt}
      // A title's picture is seen at once; a list's as it scrolls in.
      loading={size === "title" || size === "cover" ? undefined : "lazy"}
    />
  );

  return image.crop ? (
    <span className={`${box} ${styles.cropped}`}>
      {shown(styles.square, croppedStyle(image.crop))}
    </span>
  ) : (
    shown(box)
  );
}

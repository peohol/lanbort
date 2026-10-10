import type { ThingPicture } from "@lanbort/contracts";
import type { ReactNode } from "react";
import { thingPictureHref } from "@/presentation/object-images";
import styles from "./thing-thumbnail.module.css";

/**
 * Where the picture stands: at the start of a row, in the place of its icon
 * (`row`); beside a page's title (`title`, KF7); or in a thing's card in a
 * list (`card`, Tomat kjerneflyt 2 and 3).
 */
export type ThumbnailSize = "row" | "title" | "card";

/**
 * A thing's first picture (PS-OBJ-021), read the way the reader sees the
 * thing: `src` where the page knows the address, or `picture` from a list.
 * Without one it is `fallback`, usually the row's icon, or with
 * `placeholder` a quiet square of the same size. Decorative: the page names
 * the thing in words.
 */
export function ThingThumbnail({
  picture = null,
  src = thingPictureHref(picture),
  size = "row",
  placeholder = false,
  fallback = placeholder ? (
    <span className={`${styles.thumbnail} ${styles[size]} image-placeholder`} />
  ) : null,
}: {
  picture?: ThingPicture | null;
  src?: string | null;
  size?: ThumbnailSize;
  placeholder?: boolean;
  fallback?: ReactNode;
}) {
  return src ? (
    // A private file behind the API's policy, not a static asset.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`${styles.thumbnail} ${styles[size]} ${styles.picture}`}
      src={src}
      alt=""
      // A title's picture is seen at once; a list's as it scrolls in.
      loading={size === "title" ? undefined : "lazy"}
    />
  ) : (
    fallback
  );
}

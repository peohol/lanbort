import type { ThingPicture } from "@lanbort/contracts";
import type { ReactNode } from "react";
import { thingPictureHref } from "@/presentation/object-images";
import styles from "./thing-thumbnail.module.css";

/**
 * The first picture of the thing a list entry names (PS-OBJ-021), in the
 * place of the entry's icon; `fallback`, usually that icon, when the thing
 * has none. Decorative: the entry names the thing in words.
 */
export function ThingThumbnail({
  picture,
  fallback = null,
}: {
  picture: ThingPicture | null;
  fallback?: ReactNode;
}) {
  const src = thingPictureHref(picture);

  return src ? (
    // A private file behind the API's policy, not a static asset.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.thumbnail} src={src} alt="" loading="lazy" />
  ) : (
    fallback
  );
}

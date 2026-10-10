import { firstImageHref } from "@/presentation/object-images";
import styles from "./loan.module.css";

/**
 * The thing's first picture beside the title of its loan or request (KF7),
 * read the way the reader sees the thing (PS-OBJ-021); a quiet square
 * when it has none.
 */
export function ThingPicture({
  images,
  href,
}: {
  images: readonly { readonly id: string }[];
  href: (imageId: string) => string;
}) {
  const src = firstImageHref(images, href);

  return src ? (
    // A private file behind the API's policy, not a static asset.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.thing} src={src} alt="" />
  ) : (
    <span className={`${styles.thing} image-placeholder`} />
  );
}

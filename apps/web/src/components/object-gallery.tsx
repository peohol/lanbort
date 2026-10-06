import styles from "./object-gallery.module.css";

/**
 * A thing's pictures in their order (PS-OBJ-002), side by side and swiped
 * through on a phone. `src` gives each picture's address, read through the
 * policy of the place the thing is seen in.
 */
export function ObjectGallery({
  title,
  images,
  src,
}: {
  title: string;
  images: readonly { id: string; width: number; height: number }[];
  src: (imageId: string) => string;
}) {
  if (images.length === 0) return null;

  return (
    <ul className={styles.gallery} aria-label={`Bilder av ${title}`}>
      {images.map((image, index) => (
        <li key={image.id}>
          {/* A private file behind the API's policy, not a static asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src(image.id)}
            width={image.width}
            height={image.height}
            alt={`Bilde ${index + 1} av ${images.length}`}
          />
        </li>
      ))}
    </ul>
  );
}

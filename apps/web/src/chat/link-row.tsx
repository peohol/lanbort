import type { ThingPicture } from "@lanbort/contracts";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ThingThumbnail } from "@/components/thing-thumbnail";
import styles from "./chat.module.css";

/**
 * A row that leads on from a conversation: to a loan, a request or a
 * profile. A loan or request shows its thing's picture (PS-OBJ-021), a
 * quiet square without one; `picture` left out shows none.
 */
export function LinkRow({
  href,
  title,
  detail,
  picture,
}: {
  href: string;
  title: string;
  detail: string;
  picture?: ThingPicture | null;
}) {
  return (
    <li>
      <Link href={href} className={styles.loanLink}>
        {picture !== undefined && (
          <ThingThumbnail
            picture={picture}
            fallback={
              <span className={`${styles.loanPicture} image-placeholder`} />
            }
          />
        )}
        <span>
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
        <Icon name="chevron" />
      </Link>
    </li>
  );
}

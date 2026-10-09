import { type ReactNode, useId } from "react";
import type { IconName } from "@/components/icon";
import { Tag, type Tone } from "@/components/tag";
import styles from "./chat.module.css";

/**
 * A card that says how something stands, in a short tag and words, with
 * what can be done about it: offline, a closed conversation, a code that
 * ran out (Tomat).
 */
export function Notice({
  tag,
  tone = "neutral",
  icon,
  title,
  role,
  children,
}: {
  /** The state in a word or two, such as «Utløpt». */
  tag?: string;
  tone?: Tone;
  /** Another icon than the tone's. */
  icon?: IconName | null;
  title?: ReactNode;
  role?: "status" | "alert";
  children: ReactNode;
}) {
  const titleId = useId();
  const Element = title ? "section" : "div";
  return (
    <Element
      className={styles.notice}
      role={role}
      aria-labelledby={title ? titleId : undefined}
    >
      {tag && (
        <Tag tone={tone} {...(icon !== undefined ? { icon } : {})}>
          {tag}
        </Tag>
      )}
      {title && <h2 id={titleId}>{title}</h2>}
      {children}
    </Element>
  );
}

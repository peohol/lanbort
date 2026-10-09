import type { ReactNode } from "react";
import styles from "./chat.module.css";
import { AnyIcon, type AnyIconName } from "./chat-icon";

export interface Point {
  icon: AnyIconName;
  text: ReactNode;
}

/**
 * What something means, one short point per line with an icon beside it
 * (Tomat: what encryption protects against, what removing a device does).
 */
export function Points({
  heading,
  points,
}: {
  heading?: string;
  points: readonly Point[];
}) {
  return (
    <>
      {heading && <h3 className={styles.pointsHeading}>{heading}</h3>}
      <ul className={styles.points}>
        {points.map((point, index) => (
          <li key={index}>
            <AnyIcon name={point.icon} />
            <span>{point.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

import type { ReactNode } from "react";
import styles from "./chat.module.css";

/** The card a first step on a device stands in (05, 08, R1). */
export function Intro({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${styles.intro}`} aria-label={title}>
      <span className={styles.introIcon}>{icon}</span>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

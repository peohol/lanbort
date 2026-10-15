"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import styles from "./pill-list.module.css";

/**
 * A list of pills that wrap into rows (Tomat). With `rows`, only so many
 * rows are shown, the last fading out, and «Vis alle» shows the rest and
 * becomes «Vis færre». What lies beyond the rows is out of reach for the
 * keyboard and assistive technology until the list is open. When
 * everything fits, there is no button.
 */
export function PillList({
  label,
  rows,
  children,
}: {
  /** What the list is, said to assistive technology. */
  label: string;
  /** How many rows to show before «Vis alle»; all of them without. */
  rows?: number | undefined;
  children: ReactNode;
}) {
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = list.current;

    if (!element || rows === undefined) return;

    // Measured again whenever the width changes the rows.
    const measure = () => {
      const limit = element.clientHeight;
      const beyond = [...element.children].filter(
        (item) => (item as HTMLElement).offsetTop >= limit,
      );

      setOverflows(open || beyond.length > 0);
      for (const item of element.children) {
        (item as HTMLElement).inert = !open && beyond.includes(item);
      }
    };
    const observer = new ResizeObserver(measure);

    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [open, rows]);

  return (
    <>
      <ul
        ref={list}
        id={id}
        aria-label={label}
        className={styles.list}
        style={{ "--rows": rows } as CSSProperties}
        data-clamped={(rows !== undefined && !open) || undefined}
        data-overflows={overflows || undefined}
      >
        {children}
      </ul>
      {overflows && (
        <button
          type="button"
          className={`button-quiet ${styles.toggle}`}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? "Vis færre" : "Vis alle"}
        </button>
      )}
    </>
  );
}

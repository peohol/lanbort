"use client";

import { type ReactNode, useId, useRef } from "react";
import { Icon } from "@/components/icon";
import styles from "./chat.module.css";

/**
 * A sheet over the page (Tomat: from the bottom of a phone, in the middle
 * of a wider screen), opened by a button. The native dialog keeps focus
 * inside, closes on Escape and gives focus back to the button.
 */
export function Sheet({
  label,
  title,
  className,
  children,
}: {
  /** The button that opens it. */
  label: ReactNode;
  title: string;
  /** The opening button's class, such as `button-quiet`. */
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={titleId}>
        <div className={styles.sheetHeading}>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className={styles.roundButton}
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" />
            <span className="visually-hidden">Lukk</span>
          </button>
        </div>
        {children}
      </dialog>
    </>
  );
}

"use client";

import { type ReactNode, useId, useRef, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { Icon } from "@/components/icon";
import styles from "./chat.module.css";
import { chatErrorMessage } from "./messages";
import { type Point, Points } from "./points";

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

/**
 * A chat step that cannot be undone, such as removing a device (UX-INT-007,
 * Tomat): the button is drawn in outline, and the sheet says what happens
 * before the filled button that does it.
 */
export function ConfirmSheet({
  label,
  title,
  points,
  confirmLabel,
  confirm,
  first,
}: {
  label: string;
  title: string;
  points: readonly Point[];
  /** What can be done first, before what cannot be undone. */
  first?: ReactNode;
  /** Names what happens, such as «Fjern enheten». */
  confirmLabel: string;
  /** Does it; a failure is shown in the sheet, which then stays open. */
  confirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await confirm();
      dialog.current?.close();
    } catch (problem) {
      setError(chatErrorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button-danger"
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="trash" />
        {label}
      </button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby={titleId}
        onClose={() => setError(null)}
      >
        <h2 id={titleId}>{title}</h2>
        <Points points={points} />
        {first}
        <div className="dialog-actions">
          <button type="button" onClick={() => dialog.current?.close()}>
            Avbryt
          </button>
          <BusyButton
            type="button"
            className="button-danger"
            busy={busy}
            onClick={() => void run()}
          >
            <Icon name="trash" />
            {confirmLabel}
          </BusyButton>
        </div>
        <ErrorText>{error}</ErrorText>
      </dialog>
    </>
  );
}

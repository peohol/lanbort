"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { announce } from "@/components/announcer";
import { type ApiFailureCode, postJson } from "@/components/api-client";
import { BusyButton } from "@/components/busy-button";
import { announceDataChanged } from "@/components/data-changed";
import { errorMessage } from "@/components/error-messages";
import { ErrorText } from "@/components/error-text";
import { Icon } from "@/components/icon";
import { ThingThumbnail } from "@/components/thing-thumbnail";
import styles from "./add-things.module.css";

/** One of the user's own things that can be added here. */
export interface AddableThing {
  readonly objectId: string;
  readonly title: string;
  /** The address of its first photo, if it has one. */
  readonly image: string | null;
}

/** Titles as they are searched: without case, and words in any order. */
const searchable = (text: string) => text.toLocaleLowerCase("nb").trim();

const matches = (title: string, query: string) =>
  searchable(query)
    .split(/\s+/)
    .every((word) => searchable(title).includes(word));

/**
 * «Legg til ting du har fra før» (Tomat): the user's own things that can
 * be added to the environment, in a dialog over the page on a larger
 * screen and as a screen of its own on a phone. A search narrows the list,
 * «Velg alle» ticks every thing shown, and each ticked thing is published
 * here with its own command (PS-OBJ-006), so one that fails is left ticked
 * to try again while the others are done.
 */
export function AddThings({
  environmentId,
  environmentName,
  approval,
  things,
}: {
  environmentId: string;
  environmentName: string;
  /** New things wait for the administrators (PS-ENV-011). */
  approval: boolean;
  things: readonly AddableThing[];
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailureCode | null>(null);
  // One key per thing until it is added, so a retry cannot add it twice.
  const keys = useRef(new Map<string, string>());
  const keyFor = (objectId: string) => {
    const key = keys.current.get(objectId) ?? crypto.randomUUID();
    keys.current.set(objectId, key);
    return key;
  };

  // Things added meanwhile, here or elsewhere, are no longer offered.
  const offered = new Set(things.map(({ objectId }) => objectId));
  const selected = [...chosen].filter((objectId) => offered.has(objectId));
  const shown = things.filter(({ title }) => matches(title, query));
  const allShown =
    shown.length > 0 && shown.every(({ objectId }) => chosen.has(objectId));

  function toggle(objectIds: readonly string[], on: boolean) {
    const next = new Set(chosen);
    for (const objectId of objectIds) {
      if (on) next.add(objectId);
      else next.delete(objectId);
    }
    setChosen(next);
  }

  function close() {
    dialog.current?.close();
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || selected.length === 0) return;
    setPending(true);
    setFailure(null);

    const failed: { objectId: string; code: ApiFailureCode }[] = [];
    // One at a time: each locks the environment while it publishes.
    for (const objectId of selected) {
      const result = await postJson(
        `/api/objects/${objectId}/publications`,
        { environmentId },
        { idempotencyKey: keyFor(objectId) },
      );

      if (result.ok) {
        keys.current.delete(objectId);
      } else {
        if (result.code === "idempotency_key_reused") {
          keys.current.delete(objectId);
        }
        failed.push({ objectId, code: result.code });
      }
    }

    setPending(false);
    const added = selected.length - failed.length;
    if (added > 0) {
      announce(`Ferdig: ${added} ting lagt til i ${environmentName}`);
      announceDataChanged();
    }
    router.refresh();

    if (failed.length === 0) {
      setChosen(new Set());
      setQuery("");
      close();
    } else {
      setChosen(new Set(failed.map(({ objectId }) => objectId)));
      setFailure(failed[0]!.code);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button-secondary"
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="plus" /> Legg til ting du har fra før
      </button>
      <dialog
        ref={dialog}
        className={`dialog ${styles.dialog}`}
        aria-labelledby={titleId}
      >
        <form className={styles.form} onSubmit={(event) => void add(event)}>
          <div className={styles.top}>
            <h2 id={titleId}>Legg til ting</h2>
            <button
              type="button"
              className={`button-quiet ${styles.close}`}
              onClick={close}
            >
              <Icon name="close" />
              <span className="visually-hidden">Lukk</span>
            </button>
          </div>
          <div className={`search-field ${styles.search}`}>
            <label htmlFor={searchId} className="visually-hidden">
              Søk blant tingene dine
            </label>
            <Icon name="find" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              // Enter in the field searches; it never adds the things.
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              maxLength={100}
              autoComplete="off"
              placeholder="Søk blant tingene dine"
            />
          </div>
          <div className={styles.bar}>
            <span className={styles.count} aria-live="polite">
              {selected.length > 0 ? `${selected.length} valgt` : ""}
            </span>
            {shown.length > 0 && (
              <button
                type="button"
                className="button-quiet"
                onClick={() =>
                  toggle(
                    shown.map(({ objectId }) => objectId),
                    !allShown,
                  )
                }
              >
                {allShown ? "Velg ingen" : "Velg alle"}
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <p className={`quiet ${styles.list}`}>
              Ingen av tingene dine passer med søket.
            </p>
          ) : (
            <ul className={styles.list} aria-label="Tingene dine">
              {shown.map(({ objectId, title, image }) => (
                <li key={objectId}>
                  <label className={styles.thing}>
                    <input
                      type="checkbox"
                      checked={chosen.has(objectId)}
                      onChange={(event) =>
                        toggle([objectId], event.target.checked)
                      }
                    />
                    <ThingThumbnail src={image} placeholder />
                    <span className={styles.title}>{title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.bottom}>
            {approval && (
              <p className="help">
                Administratorene godkjenner tingene før de andre medlemmene ser
                dem.
              </p>
            )}
            <ErrorText>
              {failure &&
                `Noen av tingene ble ikke lagt til. ${errorMessage(failure)}`}
            </ErrorText>
            <div className="dialog-actions">
              <button type="button" onClick={close}>
                Avbryt
              </button>
              <BusyButton
                type="submit"
                className="button-primary"
                busy={pending}
              >
                {selected.length > 0
                  ? `Legg til ${selected.length} ting`
                  : "Legg til"}
              </BusyButton>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

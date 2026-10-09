"use client";

import type { EnvironmentSummary, ObjectCategory } from "@lanbort/contracts";
import type { ReactNode, RefObject } from "react";
import { describedBy, Field, helpId } from "@/components/field";
import { Icon } from "@/components/icon";
import { PilotObjectPolicy } from "@/components/pilot-object-policy";
import { formatDay } from "@/presentation/dates";
import {
  type AvailabilityMode,
  type DraftInterval,
  type ObjectDraft,
  objectFieldLabels,
} from "@/presentation/object-form";
import { categoryLabel } from "@/presentation/objects";
import {
  type FormImage,
  ImagesField,
  PeriodsField,
} from "./object-form-fields";
import styles from "./object-form.module.css";

/**
 * An environment the user may publish in: one they are an active member
 * of, and whether its administrators approve new things first (PS-ENV-011).
 */
export type PublishTarget = Pick<
  EnvironmentSummary,
  "id" | "name" | "requiresObjectApproval"
>;

type Change = (change: Partial<ObjectDraft>) => void;

/**
 * Step 1, about the thing (UX-JRN-003 1–2): its name and category with the
 * pilot's limit beside it (PS-OBJ-019), photos and a description.
 */
export function AboutStep({
  draft,
  set,
  categories,
  editing,
  images,
  onAddImages,
  onRemoveImage,
  titleField,
}: {
  draft: ObjectDraft;
  set: Change;
  categories: readonly ObjectCategory[];
  editing: boolean;
  images: readonly FormImage[];
  onAddImages: (images: FormImage[]) => void;
  onRemoveImage: (image: FormImage) => void;
  titleField: RefObject<HTMLInputElement | null>;
}) {
  const categoryHelp = "kategori-grense";

  return (
    <>
      <Field id="tittel" label={objectFieldLabels.title}>
        <input
          id="tittel"
          ref={titleField}
          required
          maxLength={120}
          value={draft.title}
          onChange={(event) => set({ title: event.target.value })}
        />
      </Field>
      <div className="field">
        <label htmlFor="kategori">{objectFieldLabels.categoryId}</label>
        <select
          id="kategori"
          required
          aria-describedby={categoryHelp}
          value={draft.categoryId}
          onChange={(event) => set({ categoryId: event.target.value })}
        >
          <option value="">Velg kategori</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
          {editing && !categories.some(({ id }) => id === draft.categoryId) && (
            <option value={draft.categoryId}>
              {categoryLabel(categories, draft.categoryId)}
            </option>
          )}
        </select>
        <details className={styles.policy}>
          <summary>Noen ting kan ikke lånes ut her. Se hvilke</summary>
          <PilotObjectPolicy id={categoryHelp} />
        </details>
      </div>
      <ImagesField
        images={images}
        onAdd={onAddImages}
        onRemove={onRemoveImage}
      />
      <Field id="beskrivelse" label={objectFieldLabels.description}>
        <textarea
          id="beskrivelse"
          required
          maxLength={5000}
          placeholder="For eksempel merke, tilstand og hva som følger med"
          value={draft.description}
          onChange={(event) => set({ description: event.target.value })}
        />
      </Field>
    </>
  );
}

/**
 * Step 2, when and on what terms (UX-JRN-003 3–4, PS-OBJ-003): any time
 * from today, or only in given periods, and optional terms.
 */
export function WhenStep({
  draft,
  set,
  today,
  mode,
  onMode,
  overlapping,
  termsNotice,
}: {
  draft: ObjectDraft;
  set: Change;
  today: string;
  mode: AvailabilityMode;
  onMode: (mode: AvailabilityMode) => void;
  overlapping: readonly number[];
  /** Said under the terms when changing them affects open requests. */
  termsNotice: string | null;
}) {
  const start = mode === "anytime" ? draft.availability[0]?.start : today;
  const from =
    !start || start === today
      ? `Fra i dag, ${formatDay(today)}, uten sluttdato`
      : `Fra ${formatDay(start)}, uten sluttdato`;
  const termsHelp =
    "Den som vil låne, ser vilkårene før hen ber om det. De blir en del av avtalen når du godkjenner.";

  return (
    <>
      <fieldset className={styles.choices}>
        <legend className="visually-hidden">Når den kan lånes</legend>
        <Choice
          name="nar"
          id="nar-alltid"
          checked={mode === "anytime"}
          onCheck={() => onMode("anytime")}
          label="Når som helst"
          detail={from}
        />
        <Choice
          name="nar"
          id="nar-perioder"
          checked={mode === "periods"}
          onCheck={() => onMode("periods")}
          label="Bare i bestemte perioder"
          detail={
            mode === "periods"
              ? "Andre kan bare be om dager innenfor periodene."
              : "Velg én eller flere perioder"
          }
        >
          {mode === "periods" && (
            <PeriodsField
              periods={draft.availability}
              overlapping={overlapping}
              onChange={(availability: DraftInterval[]) =>
                set({ availability })
              }
            />
          )}
        </Choice>
      </fieldset>
      <p className={styles.note}>
        <Icon name="info" />
        Du godkjenner hver forespørsel selv. Når du har godkjent et lån, er
        tingen opptatt i den perioden for alle andre.
      </p>
      <Field id="vilkar" label="Vilkår for lånet (valgfritt)" help={termsHelp}>
        <textarea
          id="vilkar"
          maxLength={2000}
          placeholder="For eksempel at den skal rengjøres før den leveres tilbake"
          {...describedBy("vilkar", termsHelp)}
          value={draft.loanTerms}
          onChange={(event) => set({ loanTerms: event.target.value })}
        />
      </Field>
      {termsNotice && <p className="waiting">{termsNotice}</p>}
    </>
  );
}

/**
 * Step 3, who can borrow it (UX-JRN-003 5): the user's environments and
 * «Venner», each a choice of its own. Friends are off unless chosen
 * (PS-OBJ-020); the environment the user started from is chosen already.
 */
export function WhoStep({
  environments,
  published,
  onPublished,
  friends,
  onFriends,
  preselected,
}: {
  environments: readonly PublishTarget[];
  published: readonly string[];
  onPublished: (published: string[]) => void;
  friends: boolean;
  onFriends: (friends: boolean) => void;
  preselected: string | undefined;
}) {
  return (
    <>
      <p className="page-lead">
        Tingen er den samme overalt. Du godkjenner hver forespørsel selv.
      </p>
      <fieldset className={styles.choices}>
        <legend>Dine miljøer</legend>
        {environments.length === 0 ? (
          <p className="help">
            Du er ikke med i noen miljøer ennå. Du kan publisere tingen der
            senere.
          </p>
        ) : (
          environments.map((environment) => (
            <Choice
              key={environment.id}
              type="checkbox"
              name="miljo"
              id={`miljo-${environment.id}`}
              checked={published.includes(environment.id)}
              onCheck={(checked) =>
                onPublished(
                  checked
                    ? [...published, environment.id]
                    : published.filter((id) => id !== environment.id),
                )
              }
              label={environment.name}
              detail={[
                environment.id === preselected
                  ? "Valgt fordi du startet her."
                  : `Medlemmer i ${environment.name}.`,
                environment.requiresObjectApproval &&
                  "Administratorene godkjenner nye ting før de vises.",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          ))
        )}
      </fieldset>
      <fieldset className={styles.choices}>
        <legend>Venner</legend>
        <Choice
          type="checkbox"
          name="venner"
          id="venner"
          checked={friends}
          onCheck={onFriends}
          label="Venner"
          detail="Vennene dine ser den på profilen din og kan be om å låne direkte."
        >
          {friends && (
            <p className="help">
              Ved direkte lån mellom venner godtar du og den som låner en
              ansvarserklæring for hvert lån.
            </p>
          )}
        </Choice>
      </fieldset>
    </>
  );
}

/** A choice drawn as a card: a radio button or a box, its name and detail. */
function Choice({
  type = "radio",
  name,
  label,
  id,
  checked,
  onCheck,
  detail,
  children,
}: {
  type?: "radio" | "checkbox";
  name: string;
  label: string;
  id: string;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.choice} data-checked={checked || undefined}>
      <input
        id={id}
        type={type}
        name={name}
        checked={checked}
        aria-describedby={helpId(id)}
        onChange={(event) => onCheck(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      <p id={helpId(id)} className={styles.choiceDetail}>
        {detail}
      </p>
      {children && <div className={styles.choiceMore}>{children}</div>}
    </div>
  );
}

/** One group of the review, with the way back to the step it came from. */
export function ReviewGroup({
  heading,
  onChange,
  rows,
}: {
  heading: string;
  onChange: () => void;
  rows: readonly (readonly [string, ReactNode])[];
}) {
  return (
    <section className={styles.group} aria-label={heading}>
      <div className={styles.groupTop}>
        <h2>{heading}</h2>
        <button
          type="button"
          className="button-quiet"
          aria-label={`Endre ${heading.toLowerCase()}`}
          onClick={onChange}
        >
          Endre
        </button>
      </div>
      <dl className={styles.rows}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

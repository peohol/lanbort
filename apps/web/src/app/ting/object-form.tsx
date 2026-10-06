"use client";

import type {
  ObjectCategory,
  ObjectImageAdded,
  ObjectVersion,
  OwnObject,
} from "@lanbort/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { announce } from "@/components/announcer";
import {
  type ApiFailureCode,
  type ApiResult,
  getJson,
  postFile,
  postJson,
} from "@/components/api-client";
import { BusyButton } from "@/components/busy-button";
import { announceDataChanged } from "@/components/data-changed";
import { errorMessage } from "@/components/error-messages";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field, helpId } from "@/components/field";
import { PilotObjectPolicy } from "@/components/pilot-object-policy";
import { objectHref } from "@/navigation/routes";
import {
  changedFields,
  changedTermsNotice,
  contentOf,
  draftOf,
  editOf,
  newDraft,
  type ObjectDraft,
  objectFieldLabels,
  overlappingPeriods,
  rebaseDraft,
} from "@/presentation/object-form";
import { categoryLabel, formatInterval } from "@/presentation/objects";
import {
  type FormImage,
  ImagesField,
  PeriodsField,
} from "./object-form-fields";

/** An environment the user may publish in: one they are an active member of. */
export interface PublishTarget {
  readonly id: string;
  readonly name: string;
}

export type ObjectFormProps = {
  readonly categories: readonly ObjectCategory[];
  readonly today: string;
} & (
  | {
      readonly mode: "create";
      readonly environments: readonly PublishTarget[];
      /** The environment the user started from (UX-JRN-003). */
      readonly preselected?: string | undefined;
    }
  | { readonly mode: "edit"; readonly object: OwnObject }
);

/** What the form is based on when editing: the saved thing it was opened on. */
interface Base {
  readonly draft: ObjectDraft;
  readonly version: number;
}

const imageSrc = (objectId: string, imageId: string) =>
  `/api/objects/${objectId}/images/${imageId}`;

const savedImages = (object: OwnObject): FormImage[] =>
  object.images.map(({ id }) => ({
    kind: "saved",
    id,
    src: imageSrc(object.id, id),
  }));

/**
 * The commands of one save, each with its own idempotency key, so a retry
 * after a network error cannot do anything twice (UX-INT-006). A step that
 * succeeded is not sent again; a step the API refused gets a new key, since
 * the user may change what it sends.
 */
function useSteps() {
  const keys = useRef(new Map<string, string>());
  const done = useRef(new Map<string, unknown>());

  return {
    async run<T>(
      step: string,
      send: (idempotencyKey: string) => Promise<ApiResult<T>>,
    ): Promise<ApiResult<T>> {
      if (done.current.has(step)) {
        return { ok: true, data: done.current.get(step) as T };
      }

      const key = keys.current.get(step) ?? crypto.randomUUID();
      keys.current.set(step, key);
      const result = await send(key);

      if (result.ok) done.current.set(step, result.data);
      if (result.ok || result.code !== "network") keys.current.delete(step);

      return result;
    },
    forget(step: string) {
      done.current.delete(step);
    },
  };
}

/**
 * One way to register and edit a thing, wherever the user starts
 * (UX-JRN-003): title and category, description and photos, when it can be
 * lent, optional terms, where it is shown, then a review before anything is
 * saved. Editing a thing others co-own finds out if someone saved in the
 * meantime and shows what they saved before the user decides (PS-OBJ-013).
 */
export function ObjectForm(props: ObjectFormProps) {
  const { categories, today } = props;
  const editing = props.mode === "edit" ? props.object : null;
  const router = useRouter();
  const steps = useSteps();
  const [base, setBase] = useState<Base | null>(
    editing && { draft: draftOf(editing), version: editing.version },
  );
  const [draft, setDraft] = useState<ObjectDraft>(
    editing ? draftOf(editing) : newDraft(today),
  );
  const [images, setImages] = useState<FormImage[]>(
    editing ? savedImages(editing) : [],
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [published, setPublished] = useState<string[]>(
    props.mode === "create" &&
      props.environments.some(({ id }) => id === props.preselected)
      ? [props.preselected!]
      : [],
  );
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailureCode | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [newer, setNewer] = useState<OwnObject | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const shownStep = useRef(reviewing);

  const overlapping = overlappingPeriods(draft.availability);
  const changed = base ? changedFields(base.draft, draft) : [];
  const imagesChanged =
    removed.length > 0 || images.some((image) => image.kind === "new");

  // Moving between filling in and reviewing moves focus with it.
  useEffect(() => {
    if (shownStep.current === reviewing) return;
    shownStep.current = reviewing;
    (reviewing ? reviewHeading : titleField).current?.focus();
  }, [reviewing]);

  // Local previews live as long as the form.
  const previews = useRef(images);
  useEffect(() => {
    previews.current = images;
  }, [images]);
  useEffect(
    () => () => {
      for (const image of previews.current) {
        if (image.kind === "new") URL.revokeObjectURL(image.src);
      }
    },
    [],
  );

  const set = (change: Partial<ObjectDraft>) =>
    setDraft((current) => ({ ...current, ...change }));

  function toReview(event: FormEvent) {
    event.preventDefault();
    if (overlapping.length > 0) return;
    setFailure(null);
    setReviewing(true);
  }

  function removeImage(image: FormImage) {
    setImages((current) => current.filter(({ id }) => id !== image.id));
    if (image.kind === "saved") {
      setRemoved((current) => [...current, image.id]);
    } else {
      URL.revokeObjectURL(image.src);
    }
  }

  /**
   * The photos to upload and the saved ones to remove, for `objectId`.
   * `saw` hears each version they make.
   */
  async function saveImages(
    objectId: string,
    saw: (version: number) => void = () => {},
  ): Promise<ApiResult<unknown>> {
    for (const imageId of removed) {
      const result = await steps.run<ObjectVersion>(
        `remove:${imageId}`,
        (idempotencyKey) =>
          postJson(
            imageSrc(objectId, imageId),
            {},
            { method: "DELETE", idempotencyKey },
          ),
      );
      if (result.ok) saw(result.data.version);
      // Someone else removed it already: what the user wanted holds.
      else if (result.code !== "not_found") return result;
    }

    for (const image of images) {
      if (image.kind !== "new") continue;
      const result = await steps.run<ObjectImageAdded>(
        `image:${image.id}`,
        (idempotencyKey) =>
          postFile(`/api/objects/${objectId}/images`, image.blob, {
            idempotencyKey,
          }),
      );
      if (!result.ok) return result;
      saw(result.data.version);
    }

    return { ok: true, data: null };
  }

  async function create(current: ObjectDraft): Promise<string | null> {
    const created = await steps.run<ObjectVersion>("create", (idempotencyKey) =>
      postJson("/api/objects", contentOf(current), { idempotencyKey }),
    );
    if (!created.ok) return fail(created.code);
    const { objectId } = created.data;
    setCreatedId(objectId);

    const saved = await saveImages(objectId);
    if (!saved.ok) return fail(saved.code);

    for (const environmentId of published) {
      const result = await steps.run(
        `publish:${environmentId}`,
        (idempotencyKey) =>
          postJson(
            `/api/objects/${objectId}/publications`,
            { environmentId },
            { idempotencyKey },
          ),
      );
      if (!result.ok) return fail(result.code);
    }

    return objectId;
  }

  async function update(
    object: OwnObject,
    from: Base,
    current: ObjectDraft,
  ): Promise<string | null> {
    let version = from.version;
    const saw = (made: number) => {
      version = Math.max(version, made);
    };

    if (changedFields(from.draft, current).length > 0) {
      const result = await steps.run<ObjectVersion>("edit", (idempotencyKey) =>
        postJson(
          `/api/objects/${object.id}`,
          editOf(from.draft, current, from.version),
          { method: "PATCH", idempotencyKey },
        ),
      );
      steps.forget("edit");

      if (!result.ok) {
        return result.code === "conflict"
          ? showNewer(object.id, result.code)
          : fail(result.code);
      }
      saw(result.data.version);
    } else {
      // Photos alone carry no version to the API: look first, so they are
      // never saved on top of a version the user has not seen.
      const latest = await getJson<OwnObject>(`/api/objects/${object.id}`);
      if (!latest.ok) return fail(latest.code);
      if (latest.data.version !== from.version) {
        setNewer(latest.data);
        return null;
      }
    }

    const saved = await saveImages(object.id, saw);
    // What is saved is the new base, so a retry sends only what is left.
    setBase({ draft: current, version });
    return saved.ok ? object.id : fail(saved.code);
  }

  /** What someone else saved, to decide on before saving over it. */
  async function showNewer(
    objectId: string,
    code: ApiFailureCode,
  ): Promise<null> {
    const latest = await getJson<OwnObject>(`/api/objects/${objectId}`);
    if (!latest.ok) return fail(code);
    setNewer(latest.data);
    return null;
  }

  function fail(code: ApiFailureCode): null {
    setFailure(code);
    return null;
  }

  async function save(from: Base | null = base, current: ObjectDraft = draft) {
    if (pending) return;
    setPending(true);
    setFailure(null);
    setNewer(null);
    const objectId =
      editing && from
        ? await update(editing, from, current)
        : await create(current);
    setPending(false);

    if (objectId) {
      announce(`Ferdig: ${submitLabel}`);
      announceDataChanged();
      router.push(objectHref(objectId));
    }
  }

  /** Keeps the user's own changes on top of what someone else saved. */
  function keepMine(latest: OwnObject) {
    const saved = draftOf(latest);
    const rebased = { draft: saved, version: latest.version };
    const merged = base ? rebaseDraft(base.draft, saved, draft) : draft;
    setBase(rebased);
    setDraft(merged);
    void save(rebased, merged);
  }

  /** Starts again from what is saved now. */
  function takeSaved(latest: OwnObject) {
    setBase({ draft: draftOf(latest), version: latest.version });
    setDraft(draftOf(latest));
    setImages(savedImages(latest));
    setRemoved([]);
    setNewer(null);
    setReviewing(false);
  }

  const submitLabel = editing
    ? "Lagre endringene"
    : published.length > 0
      ? "Registrer og publiser"
      : "Registrer tingen";
  const nothingToSave =
    editing !== null && changed.length === 0 && !imagesChanged;
  const content = contentOf(draft);
  const environmentNames =
    props.mode === "create"
      ? props.environments
          .filter(({ id }) => published.includes(id))
          .map(({ name }) => name)
      : [];

  if (reviewing) {
    return (
      <section aria-labelledby="gjennomga">
        <h2 id="gjennomga" ref={reviewHeading} tabIndex={-1}>
          Se over før du {editing ? "lagrer" : "registrerer"}
        </h2>
        <dl className="facts">
          <dt>Tittel</dt>
          <dd>{content.title}</dd>
          <dt>Kategori</dt>
          <dd>{categoryLabel(categories, content.categoryId)}</dd>
          <dt>Beskrivelse</dt>
          <dd className="message-text">{content.description}</dd>
          <dt>Bilder</dt>
          <dd>{images.length === 0 ? "Ingen" : images.length}</dd>
          <dt>Når den kan lånes</dt>
          <dd>
            {content.availability.length === 0
              ? "Ingen perioder. Den kan ikke lånes ut før du legger inn en."
              : content.availability.map(formatInterval).join(", ")}
          </dd>
          <dt>Vilkår</dt>
          <dd className="message-text">
            {content.loanTerms ?? "Ingen egne vilkår"}
          </dd>
          {props.mode === "create" && (
            <>
              <dt>Vises i</dt>
              <dd>
                {environmentNames.length === 0
                  ? "Ingen miljøer ennå. Du kan publisere den senere."
                  : environmentNames.join(", ")}
              </dd>
            </>
          )}
        </dl>
        {editing && (
          <p>
            {nothingToSave
              ? "Du har ikke endret noe."
              : `Du endrer: ${[
                  ...changed.map((field) => objectFieldLabels[field]),
                  ...(imagesChanged ? ["Bilder"] : []),
                ]
                  .join(", ")
                  .toLowerCase()}.`}
          </p>
        )}
        {changed.includes("loanTerms") && (
          <p className="waiting">{changedTermsNotice}</p>
        )}
        {newer && base && (
          <NewerVersion
            base={base.draft}
            latest={newer}
            categories={categories}
            busy={pending}
            onKeepMine={() => keepMine(newer)}
            onTakeSaved={() => takeSaved(newer)}
          />
        )}
        {!newer && (
          <div className="actions">
            {!nothingToSave && (
              <BusyButton
                type="button"
                className="button-primary"
                busy={pending}
                onClick={() => void save()}
              >
                {submitLabel}
              </BusyButton>
            )}
            {createdId ? (
              <Link className="button" href={objectHref(createdId)}>
                Gå til tingen
              </Link>
            ) : (
              <button type="button" onClick={() => setReviewing(false)}>
                Endre
              </button>
            )}
          </div>
        )}
        <ErrorText>
          {failure &&
            (createdId
              ? `Tingen er registrert, men ikke alt ble fullført. ${errorMessage(failure)}`
              : errorMessage(failure))}
        </ErrorText>
      </section>
    );
  }

  const categoryHelp = "kategori-grense";
  const descriptionHelp =
    "Skriv gjerne merke, modell, størrelse, tilstand og eventuelle mangler.";
  const termsHelp = "For eksempel at den skal vaskes før den leveres tilbake.";
  const periodsHelp =
    "Legg inn én eller flere perioder. Uten sluttdato kan den lånes fra startdatoen og fram til du endrer det.";

  return (
    <form onSubmit={toReview}>
      <fieldset>
        <legend>Tittel og kategori</legend>
        <Field id="tittel" label="Tittel">
          <input
            id="tittel"
            ref={titleField}
            required
            maxLength={120}
            value={draft.title}
            onChange={(event) => set({ title: event.target.value })}
          />
        </Field>
        <Field id="kategori" label="Kategori">
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
            {editing &&
              !categories.some(({ id }) => id === draft.categoryId) && (
                <option value={draft.categoryId}>
                  {categoryLabel(categories, draft.categoryId)}
                </option>
              )}
          </select>
        </Field>
        <PilotObjectPolicy id={categoryHelp} />
      </fieldset>

      <fieldset>
        <legend>Beskrivelse og bilder</legend>
        <Field id="beskrivelse" label="Beskrivelse" help={descriptionHelp}>
          <textarea
            id="beskrivelse"
            required
            maxLength={5000}
            {...describedBy("beskrivelse", descriptionHelp)}
            value={draft.description}
            onChange={(event) => set({ description: event.target.value })}
          />
        </Field>
        <ImagesField
          images={images}
          onAdd={(added) => setImages((current) => [...current, ...added])}
          onRemove={removeImage}
        />
      </fieldset>

      <fieldset aria-describedby={helpId("perioder")}>
        <legend>Når den kan lånes</legend>
        <p id={helpId("perioder")} className="help">
          {periodsHelp}
        </p>
        <PeriodsField
          periods={draft.availability}
          overlapping={overlapping}
          onChange={(availability) => set({ availability })}
        />
      </fieldset>

      <fieldset>
        <legend>Vilkår</legend>
        <Field id="vilkar" label="Vilkår for lån (valgfritt)" help={termsHelp}>
          <textarea
            id="vilkar"
            maxLength={2000}
            {...describedBy("vilkar", termsHelp)}
            value={draft.loanTerms}
            onChange={(event) => set({ loanTerms: event.target.value })}
          />
        </Field>
        {changed.includes("loanTerms") && (
          <p className="waiting">{changedTermsNotice}</p>
        )}
      </fieldset>

      {props.mode === "create" && (
        <fieldset>
          <legend>Hvor skal den vises?</legend>
          {props.environments.length === 0 ? (
            <p className="help">
              Du er ikke med i noen miljøer ennå. Tingen blir registrert hos
              deg, og du kan publisere den senere.
            </p>
          ) : (
            <>
              <p className="help">
                Tingen er din uansett hvor den vises. Medlemmene i miljøene du
                velger, kan finne den og be om å låne den.
              </p>
              {props.environments.map((environment) => (
                <div key={environment.id} className="checkbox">
                  <input
                    id={`miljo-${environment.id}`}
                    type="checkbox"
                    checked={published.includes(environment.id)}
                    onChange={(event) =>
                      setPublished((current) =>
                        event.target.checked
                          ? [...current, environment.id]
                          : current.filter((id) => id !== environment.id),
                      )
                    }
                  />
                  <label htmlFor={`miljo-${environment.id}`}>
                    {environment.name}
                  </label>
                </div>
              ))}
            </>
          )}
        </fieldset>
      )}

      <div className="actions">
        <button type="submit">Gå videre</button>
      </div>
    </form>
  );
}

/**
 * Someone else saved the thing after the form was opened (PS-OBJ-013,
 * «Samtidig redigering»): what they saved, next to what the form was based
 * on, before the user decides whether their own changes go on top.
 */
function NewerVersion({
  base,
  latest,
  categories,
  busy,
  onKeepMine,
  onTakeSaved,
}: {
  base: ObjectDraft;
  latest: OwnObject;
  categories: readonly ObjectCategory[];
  busy: boolean;
  onKeepMine: () => void;
  onTakeSaved: () => void;
}) {
  const saved = draftOf(latest);
  const fields = changedFields(base, saved);
  const shown = contentOf(saved);
  const value = (field: (typeof fields)[number]) =>
    field === "categoryId"
      ? categoryLabel(categories, shown.categoryId)
      : field === "availability"
        ? shown.availability.map(formatInterval).join(", ") || "Ingen perioder"
        : field === "loanTerms"
          ? (shown.loanTerms ?? "Ingen egne vilkår")
          : shown[field];

  return (
    <div className="status-card tone-warning" role="alert">
      <h3>Noen andre har lagret tingen</h3>
      <p>
        En annen eier lagret endringer etter at du åpnet skjemaet. Dette er
        lagret nå. Lagrer du dine endringer over, beholdes det du ikke selv har
        endret.
      </p>
      {fields.length > 0 ? (
        <dl className="facts">
          {fields.map((field) => (
            <Fragment key={field}>
              <dt>{objectFieldLabels[field]}</dt>
              <dd className="message-text">{value(field)}</dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <p>Bare bildene er endret.</p>
      )}
      <div className="actions">
        <BusyButton
          type="button"
          className="button-primary"
          busy={busy}
          onClick={onKeepMine}
        >
          Lagre mine endringer over
        </BusyButton>
        <button type="button" onClick={onTakeSaved}>
          Start fra det som er lagret
        </button>
      </div>
    </div>
  );
}

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
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import type { AreaId } from "@/navigation/areas";
import { objectHref } from "@/navigation/routes";
import {
  type AvailabilityMode,
  changedFields,
  changedTermsNotice,
  contentOf,
  type DraftInterval,
  draftOf,
  editOf,
  type FormStep,
  formStepNames,
  formSteps,
  isAnytime,
  newDraft,
  type ObjectDraft,
  objectFieldLabels,
  overlappingPeriods,
  publishLabel,
  publishOutcome,
  rebaseDraft,
} from "@/presentation/object-form";
import { ownImageHref } from "@/presentation/object-images";
import {
  availabilityLine,
  categoryLabel,
  formatInterval,
} from "@/presentation/objects";
import { type FormImage } from "./object-form-fields";
import {
  AboutStep,
  type PublishTarget,
  ReviewGroup,
  WhenStep,
  WhoStep,
} from "./object-form-steps";
import styles from "./object-form.module.css";

export type { PublishTarget } from "./object-form-steps";

export type ObjectFormProps = {
  readonly categories: readonly ObjectCategory[];
  readonly today: string;
  /** Where the form was started, which «Avbryt» leads back to (UX-IA-013). */
  readonly from: {
    readonly href: string;
    readonly label: string;
    /** Its home area, when `href` is not an area's own page. */
    readonly home?: AreaId;
  };
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

const savedImages = (object: OwnObject): FormImage[] =>
  object.images.map(({ id }) => ({
    kind: "saved",
    id,
    src: ownImageHref(object.id, id),
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

/** The question each step asks, as its heading (Tomat kjerneflyt 2). */
const questions: Record<FormStep, { create: string; edit: string }> = {
  about: { create: "Hva vil du låne bort?", edit: "Om tingen" },
  when: { create: "Når kan den lånes?", edit: "Når kan den lånes?" },
  who: { create: "Hvem kan låne den?", edit: "Hvem kan låne den?" },
  review: { create: "Se over og publiser", edit: "Se over og lagre" },
};

/**
 * One way to register and edit a thing, wherever the user starts
 * (UX-JRN-003), as a bounded task in short steps (UX-IA-013, Tomat
 * kjerneflyt 2): about the thing, when and on what terms, who can borrow
 * it, and a review before anything is saved, where each group leads back
 * to its step. Editing leaves where it is shown to the thing's page, and a
 * thing others co-own finds out if someone saved in the meantime and shows
 * what they saved before the user decides (PS-OBJ-013).
 */
export function ObjectForm(props: ObjectFormProps) {
  const { categories, today, from } = props;
  const editing = props.mode === "edit" ? props.object : null;
  const order = formSteps[props.mode];
  const router = useRouter();
  const steps = useSteps();
  const [base, setBase] = useState<Base | null>(
    editing && { draft: draftOf(editing), version: editing.version },
  );
  const [draft, setDraft] = useState<ObjectDraft>(
    editing ? draftOf(editing) : newDraft(today),
  );
  const modeOf = (availability: readonly DraftInterval[]): AvailabilityMode =>
    isAnytime(availability, today) ? "anytime" : "periods";
  const [mode, setMode] = useState(modeOf(draft.availability));
  // The periods last given, kept while «any time» is chosen.
  const [periods, setPeriods] = useState<readonly DraftInterval[]>(
    mode === "periods" ? draft.availability : [],
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
  const [friends, setFriends] = useState(false);
  const [at, setAt] = useState(0);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailureCode | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [newer, setNewer] = useState<OwnObject | null>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const discard = useRef<HTMLDialogElement>(null);
  const shownStep = useRef(at);
  const step = order[at]!;

  const overlapping = overlappingPeriods(draft.availability);
  const changed = base ? changedFields(base.draft, draft) : [];
  const imagesChanged =
    removed.length > 0 || images.some((image) => image.kind === "new");
  const dirty = editing
    ? changed.length > 0 || imagesChanged
    : changedFields(newDraft(today), draft).length > 0 || images.length > 0;

  // A new step is announced by moving focus to its heading.
  useEffect(() => {
    if (shownStep.current === at) return;
    shownStep.current = at;
    const heading = document.querySelector<HTMLElement>(".page-header h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [at]);

  // «Avbryt» asks first when something would be lost (Tomat kjerneflyt 2).
  const dirtyRef = useRef(dirty);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const leaveTo = useRef<string | null>(null);
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const cancel = (event.target as Element | null)?.closest?.(
        "a.task-cancel",
      );
      if (!cancel || !dirtyRef.current || pendingRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      leaveTo.current = cancel.getAttribute("href");
      discard.current?.showModal();
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, []);
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

  const set = (change: Partial<ObjectDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    if (change.availability && mode === "periods") {
      setPeriods(change.availability);
    }
  };

  function chooseMode(next: AvailabilityMode) {
    setMode(next);
    // Not through `set`: the periods given stay remembered.
    setDraft((current) => ({
      ...current,
      availability:
        next === "anytime"
          ? isAnytime(base?.draft.availability ?? [], today)
            ? base!.draft.availability
            : [{ start: today, end: "" }]
          : periods.length > 0
            ? periods
            : [{ start: "", end: "" }],
    }));
  }

  function go(to: number) {
    setFailure(null);
    setAt(to);
  }

  function next(event: FormEvent) {
    event.preventDefault();
    if (step === "when" && overlapping.length > 0) return;
    go(at + 1);
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
            ownImageHref(objectId, imageId),
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

  /**
   * Registers the thing, its photos and, when `publish`, where the user
   * chose to show it: each environment (PS-OBJ-006) and friends
   * (PS-OBJ-020).
   */
  async function create(
    current: ObjectDraft,
    publish: boolean,
  ): Promise<string | null> {
    const created = await steps.run<ObjectVersion>("create", (idempotencyKey) =>
      postJson("/api/objects", contentOf(current), { idempotencyKey }),
    );
    if (!created.ok) return fail(created.code);
    const { objectId } = created.data;
    setCreatedId(objectId);

    const saved = await saveImages(objectId);
    if (!saved.ok) return fail(saved.code);
    if (!publish) return objectId;
    // From here, saving without publishing would no longer be true.
    setPublishing(true);

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

    if (friends) {
      const result = await steps.run("friends", (idempotencyKey) =>
        postJson(`/api/objects/${objectId}/friends`, {}, { idempotencyKey }),
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

  async function save({
    from = base,
    current = draft,
    publish = true,
  }: { from?: Base | null; current?: ObjectDraft; publish?: boolean } = {}) {
    if (pending) return;
    setPending(true);
    setFailure(null);
    setNewer(null);
    const objectId =
      editing && from
        ? await update(editing, from, current)
        : await create(current, publish);
    setPending(false);

    if (objectId) {
      announce(
        `Ferdig: ${editing ? "Endringene er lagret" : "Tingen er registrert"}`,
      );
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
    void save({ from: rebased, current: merged });
  }

  /** Starts again from what is saved now. */
  function takeSaved(latest: OwnObject) {
    const saved = draftOf(latest);
    setBase({ draft: saved, version: latest.version });
    setDraft(saved);
    setMode(modeOf(saved.availability));
    setPeriods(
      modeOf(saved.availability) === "periods" ? saved.availability : [],
    );
    setImages(savedImages(latest));
    setRemoved([]);
    setNewer(null);
    go(0);
  }

  const content = contentOf(draft);
  const choice = {
    environments:
      props.mode === "create"
        ? props.environments
            .filter(({ id }) => published.includes(id))
            .map(({ name }) => name)
        : [],
    friends,
  };
  const publishAs = publishLabel(choice);
  const nothingToSave =
    editing !== null && changed.length === 0 && !imagesChanged;
  const stepOf = (name: FormStep) => order.indexOf(name as never);

  const header = (
    <PageHeader
      title={questions[step][props.mode]}
      kind={editing ? "Rediger tingen" : "Registrer en ting"}
      back={from}
      {...(from.home && { home: from.home })}
      task
    />
  );

  /** The way to the step before and how far the user has come. */
  const progress = (
    <div className={styles.progress}>
      {at > 0 && (
        <button
          type="button"
          className={styles.previous}
          onClick={() => go(at - 1)}
        >
          <Icon name="back" /> {formStepNames[order[at - 1]!]}
        </button>
      )}
      <p className={styles.count}>
        Steg {at + 1} av {order.length}
      </p>
      <nav className={styles.steps} aria-label="Steg">
        <ol>
          {order.map((name, index) => (
            <li
              key={name}
              aria-current={index === at ? "step" : undefined}
              data-done={index < at || undefined}
            >
              {index < at ? (
                <button type="button" onClick={() => go(index)}>
                  <Icon name="check" /> {formStepNames[name]}
                </button>
              ) : (
                <span>
                  <span className={styles.number}>{index + 1}</span>{" "}
                  {formStepNames[name]}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );

  const discardDialog = (
    <dialog ref={discard} className="dialog" aria-labelledby="forkast-tittel">
      <h2 id="forkast-tittel">
        {editing
          ? "Forkaste endringene?"
          : `Forkaste ${content.title || "tingen"}?`}
      </h2>
      <p>
        {editing
          ? "Det du har endret, forsvinner. Tingen er som før."
          : "Det du har skrevet og bildene du har lagt til, forsvinner. Ingenting er publisert."}
      </p>
      <div className="dialog-actions">
        <button type="button" onClick={() => discard.current?.close()}>
          {editing ? "Fortsett å redigere" : "Fortsett å registrere"}
        </button>
        <button
          type="button"
          className="button-danger"
          onClick={() => {
            discard.current?.close();
            dirtyRef.current = false;
            router.push(leaveTo.current ?? from.href);
          }}
        >
          Forkast
        </button>
      </div>
    </dialog>
  );

  if (step === "review") {
    return (
      <>
        {header}
        <div className={styles.form}>
          {progress}
          <ReviewGroup
            heading={formStepNames.about}
            onChange={() => go(stepOf("about"))}
            rows={[
              [objectFieldLabels.title, content.title],
              [
                objectFieldLabels.categoryId,
                categoryLabel(categories, content.categoryId),
              ],
              ["Bilder", images.length === 0 ? "Ingen" : images.length],
              [
                objectFieldLabels.description,
                <span key="beskrivelse" className="message-text">
                  {content.description}
                </span>,
              ],
            ]}
          />
          <ReviewGroup
            heading={formStepNames.when}
            onChange={() => go(stepOf("when"))}
            rows={[
              [
                "Ledig",
                content.availability.length === 0
                  ? "Ingen perioder. Den kan ikke lånes ut før du legger inn en."
                  : availabilityLine(content.availability, today),
              ],
              [
                "Vilkår",
                <span key="vilkar" className="message-text">
                  {content.loanTerms ?? "Ingen egne vilkår"}
                </span>,
              ],
            ]}
          />
          {props.mode === "create" && (
            <ReviewGroup
              heading={formStepNames.who}
              onChange={() => go(stepOf("who"))}
              rows={[
                ...props.environments.map(
                  (environment) =>
                    [
                      environment.name,
                      published.includes(environment.id)
                        ? "Publiseres"
                        : "Ikke valgt",
                    ] as const,
                ),
                ["Venner", friends ? "Publiseres" : "Ikke valgt"] as const,
              ]}
            />
          )}
          {editing ? (
            <>
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
              {changed.includes("loanTerms") && (
                <p className="waiting">{changedTermsNotice}</p>
              )}
            </>
          ) : (
            <p className={styles.outcome}>
              {publishAs
                ? publishOutcome(choice, content.title)
                : "Ingen kan se den ennå. Uten miljø eller venner lagres tingen bare for deg. Du kan publisere den senere fra tingens side."}
            </p>
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
          {!newer && !nothingToSave && (
            <div className={styles.submit}>
              <BusyButton
                type="button"
                className="button-primary"
                busy={pending}
                busyNote={editing ? "lagrer …" : "publiserer …"}
                onClick={() => void save()}
              >
                {editing
                  ? "Lagre endringene"
                  : (publishAs ?? "Lagre uten å publisere")}
              </BusyButton>
              {!editing && publishAs && !publishing && (
                <p className={styles.private}>
                  <button
                    type="button"
                    className="button-quiet"
                    aria-describedby="bare-for-deg"
                    onClick={() => void save({ publish: false })}
                  >
                    Lagre uten å publisere
                  </button>
                  <span id="bare-for-deg" className="help">
                    Da er den bare synlig for deg.
                  </span>
                </p>
              )}
              {createdId && failure && (
                <Link className="button" href={objectHref(createdId)}>
                  Gå til tingen
                </Link>
              )}
            </div>
          )}
          <ErrorText>
            {failure &&
              (createdId
                ? `Tingen er registrert, men ikke alt ble fullført. ${errorMessage(failure)}`
                : errorMessage(failure))}
          </ErrorText>
          {discardDialog}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className={styles.form}>
        {progress}
        <form onSubmit={next}>
          {step === "about" && (
            <AboutStep
              draft={draft}
              set={set}
              categories={categories}
              editing={editing !== null}
              images={images}
              onAddImages={(added) =>
                setImages((current) => [...current, ...added])
              }
              onRemoveImage={removeImage}
              titleField={titleField}
            />
          )}
          {step === "when" && (
            <WhenStep
              draft={draft}
              set={set}
              today={today}
              mode={mode}
              onMode={chooseMode}
              overlapping={overlapping}
              termsNotice={
                changed.includes("loanTerms") ? changedTermsNotice : null
              }
            />
          )}
          {step === "who" && props.mode === "create" && (
            <WhoStep
              environments={props.environments}
              published={published}
              onPublished={setPublished}
              friends={friends}
              onFriends={setFriends}
              preselected={props.preselected}
            />
          )}
          <button type="submit" className={styles.next}>
            Videre
          </button>
        </form>
        {discardDialog}
      </div>
    </>
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

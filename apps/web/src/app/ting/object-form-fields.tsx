"use client";

import { type ObjectImageCrop, objectImageMaxCount } from "@lanbort/contracts";
import { type ChangeEvent, type ReactNode, useEffect, useState } from "react";
import { describedBy, helpId } from "@/components/field";
import { Icon } from "@/components/icon";
import { PictureCropper } from "@/components/picture-cropper";
import { readPhoto } from "@/components/read-photo";
import { ThingThumbnail } from "@/components/thing-thumbnail";
import type { DraftInterval } from "@/presentation/object-form";
import { thingPictureShape } from "@/presentation/object-images";
import {
  cropFromSquare,
  cropToSquare,
  initialCrop,
} from "@/presentation/picture-crop";
import styles from "./object-form.module.css";
import { prepareImage } from "./prepare-image";

/**
 * A photo in the form: one already saved, or one chosen to upload, with
 * the square it is shown in where it is shown square (PS-OBJ-002).
 */
export type FormImage = {
  readonly src: string;
  /** Null shows its middle. */
  readonly crop: ObjectImageCrop | null;
} & (
  | {
      readonly kind: "saved";
      readonly id: string;
      /** The square saved now, to tell whether it changed. */
      readonly savedCrop: ObjectImageCrop | null;
    }
  | {
      readonly kind: "new";
      /** Also the upload's step, so a retry sends it once (UX-INT-006). */
      readonly id: string;
      readonly blob: Blob;
    }
);

/** The photo being framed, read from its file or from the API. */
interface Framing {
  readonly image: FormImage;
  readonly photo: ImageBitmap;
}

/**
 * Up to five photos (PS-OBJ-002): what is there, a way to remove each, a
 * way to add more, and a way to choose the square the main photo is shown
 * in, as for a profile picture. Photos are prepared for upload as they are
 * chosen, so the same bytes are sent however often a retry is needed.
 */
export function ImagesField({
  images,
  onAdd,
  onRemove,
  onCrop,
}: {
  images: readonly FormImage[];
  onAdd: (images: FormImage[]) => void;
  onRemove: (image: FormImage) => void;
  onCrop: (image: FormImage, crop: ObjectImageCrop) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [framing, setFraming] = useState<Framing | null>(null);

  useEffect(() => () => framing?.photo.close(), [framing]);

  async function frame(image: FormImage) {
    setProblem(null);
    const file =
      image.kind === "new"
        ? image.blob
        : await fetch(image.src)
            .then((response) => (response.ok ? response.blob() : null))
            .catch(() => null);
    const photo = file && (await readPhoto(file));
    if (photo) setFraming({ image, photo });
    else setProblem("Bildet kunne ikke åpnes. Prøv igjen.");
  }

  const room = objectImageMaxCount - images.length;
  const help = `Valgfritt, inntil ${objectImageMaxCount} bilder. Bildene lagres uten posisjon og andre opplysninger fra kameraet.`;

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    const prepared = await Promise.all(files.slice(0, room).map(prepareImage));
    const added = prepared.flatMap((blob): FormImage[] =>
      blob
        ? [
            {
              kind: "new",
              id: crypto.randomUUID(),
              blob,
              src: URL.createObjectURL(blob),
              crop: null,
            },
          ]
        : [],
    );

    setProblem(
      files.length > room
        ? `Bare ${objectImageMaxCount} bilder er med.`
        : added.length < files.length
          ? "Noen av filene kunne ikke brukes. Velg bilder i JPEG, PNG eller WebP."
          : null,
    );
    onAdd(added);
  }

  const picker = (label: ReactNode) => (
    <label className={styles.picker}>
      <input
        type="file"
        accept="image/*"
        multiple
        className={styles.file}
        {...describedBy("bilder", help)}
        onChange={(event) => void choose(event)}
      />
      <Icon name="plus" />
      {label}
    </label>
  );

  if (framing) {
    const { image, photo } = framing;

    return (
      <div className="field">
        <p className={styles.imagesLabel}>Velg utsnitt av hovedbildet</p>
        <p className="help">
          Utsnittet vises der bildet vises som et kvadrat, som på kortet for
          tingen. De som kan låne den, ser også hele bildet.
        </p>
        <PictureCropper
          photo={photo}
          shape={thingPictureShape}
          rotatable={false}
          initial={image.crop ? cropFromSquare(photo, image.crop) : initialCrop}
          saveLabel="Bruk utsnittet"
          onSave={(crop) => {
            onCrop(image, cropToSquare(photo, crop));
            setFraming(null);
          }}
          onCancel={() => setFraming(null)}
        />
      </div>
    );
  }

  return (
    <div className="field">
      {images.length === 0 ? (
        <div className={styles.dropzone}>
          <p className={styles.dropzoneTitle}>Vis fram tingen</p>
          <p className="help">
            Et bilde gjør det lettere å se hva det er og hvilken stand den er i.
          </p>
          {picker("Legg til bilder")}
          <p id={helpId("bilder")} className="help">
            {help}
          </p>
        </div>
      ) : (
        <>
          <p className={styles.imagesLabel}>
            Bilder{" "}
            <span className="help">
              (valgfritt, inntil {objectImageMaxCount})
            </span>
          </p>
          <ul className={styles.images} aria-label="Bilder">
            {images.map((image, index) => (
              <li key={image.id}>
                <ThingThumbnail
                  image={image}
                  size="fill"
                  alt={`Bilde ${index + 1}`}
                />
                {index === 0 && (
                  <>
                    <span className={styles.main}>Hovedbilde</span>
                    <button
                      type="button"
                      className="button-quiet"
                      onClick={() => void frame(image)}
                    >
                      Velg utsnitt
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="button-quiet"
                  onClick={() => onRemove(image)}
                >
                  Fjern bilde {index + 1}
                </button>
              </li>
            ))}
            {room > 0 && (
              <li>
                {picker(
                  <>
                    Legg til<span className="visually-hidden"> bilder</span>
                  </>,
                )}
              </li>
            )}
          </ul>
          <p id={helpId("bilder")} className="help">
            {help}
          </p>
        </>
      )}
      {problem && (
        <p role="alert" className="error">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * When the thing can be lent, in given periods (PS-OBJ-003): one or more,
 * each from a day and with or without an end. Periods that share a day are
 * pointed out here; the API refuses them too. With none, nobody can ask to
 * borrow it until the owner adds one.
 */
export function PeriodsField({
  periods,
  overlapping,
  onChange,
}: {
  periods: readonly DraftInterval[];
  overlapping: readonly number[];
  onChange: (periods: DraftInterval[]) => void;
}) {
  const update = (index: number, change: Partial<DraftInterval>) =>
    onChange(
      periods.map((period, at) =>
        at === index ? { ...period, ...change } : period,
      ),
    );
  const overlapId = "perioder-overlapper";

  return (
    <>
      {periods.length > 0 && (
        <ol className={styles.periods}>
          {periods.map((period, index) => {
            const number = index + 1;
            const invalid = overlapping.includes(index);
            const errorProps = invalid
              ? { "aria-invalid": true, "aria-describedby": overlapId }
              : {};

            return (
              <li key={index}>
                <fieldset>
                  <legend>Periode {number}</legend>
                  <div className="field">
                    <label htmlFor={`fra-${index}`}>Fra</label>
                    <input
                      id={`fra-${index}`}
                      type="date"
                      required
                      value={period.start}
                      {...errorProps}
                      onChange={(event) =>
                        update(index, { start: event.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`til-${index}`}>Til (valgfritt)</label>
                    <input
                      id={`til-${index}`}
                      type="date"
                      min={period.start || undefined}
                      value={period.end}
                      {...errorProps}
                      onChange={(event) =>
                        update(index, { end: event.target.value })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="button-quiet"
                    onClick={() =>
                      onChange(periods.filter((_, at) => at !== index))
                    }
                  >
                    Fjern periode {number}
                  </button>
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}
      {overlapping.length > 0 && (
        <p id={overlapId} role="alert" className="error">
          Periodene {overlapping.map((index) => index + 1).join(" og ")} har
          dager felles. Slå dem sammen eller endre datoene.
        </p>
      )}
      {periods.length === 0 && (
        <p className="help">
          Ingen perioder ennå. Den kan ikke lånes ut før du legger inn en.
        </p>
      )}
      <button
        type="button"
        className="button-secondary"
        onClick={() => onChange([...periods, { start: "", end: "" }])}
      >
        <Icon name="plus" /> Legg til periode
      </button>
    </>
  );
}

"use client";

import { objectImageMaxCount } from "@lanbort/contracts";
import { type ChangeEvent, useState } from "react";
import { describedBy, helpId } from "@/components/field";
import type { DraftInterval } from "@/presentation/object-form";
import { prepareImage } from "./prepare-image";

/** A photo in the form: one already saved, or one chosen to upload. */
export type FormImage =
  | { readonly kind: "saved"; readonly id: string; readonly src: string }
  | {
      readonly kind: "new";
      /** Also the upload's step, so a retry sends it once (UX-INT-006). */
      readonly id: string;
      readonly blob: Blob;
      readonly src: string;
    };

/**
 * Up to five photos (PS-OBJ-002): what is there, a way to remove each, and
 * a way to add more. Photos are prepared for upload as they are chosen, so
 * the same bytes are sent however often a retry is needed.
 */
export function ImagesField({
  images,
  onAdd,
  onRemove,
}: {
  images: readonly FormImage[];
  onAdd: (images: FormImage[]) => void;
  onRemove: (image: FormImage) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const room = objectImageMaxCount - images.length;
  const help = `Du kan legge til opptil ${objectImageMaxCount} bilder. Bildene lagres uten posisjon og andre opplysninger fra kameraet.`;

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

  return (
    <div className="field">
      {images.length > 0 && (
        <ul className="image-list" aria-label="Bilder">
          {images.map((image, index) => (
            <li key={image.id}>
              {/* The API's own address or a local preview; nothing to optimize. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt={`Bilde ${index + 1}`} />
              <button type="button" onClick={() => onRemove(image)}>
                Fjern bilde {index + 1}
              </button>
            </li>
          ))}
        </ul>
      )}
      {room > 0 && (
        <>
          <label htmlFor="bilder">Legg til bilder</label>
          <p id={helpId("bilder")} className="help">
            {help}
          </p>
          <input
            id="bilder"
            type="file"
            accept="image/*"
            multiple
            {...describedBy("bilder", help)}
            onChange={(event) => void choose(event)}
          />
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
 * When the thing can be lent (PS-OBJ-003): one or more periods, each from a
 * day and with or without an end. Periods that share a day are pointed out
 * here; the API refuses them too.
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
      {periods.map((period, index) => {
        const number = index + 1;
        const invalid = overlapping.includes(index);
        const errorProps = invalid
          ? { "aria-invalid": true, "aria-describedby": overlapId }
          : {};

        return (
          <fieldset key={index}>
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
                onChange={(event) => update(index, { end: event.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(periods.filter((_, at) => at !== index))}
            >
              Fjern periode {number}
            </button>
          </fieldset>
        );
      })}
      {overlapping.length > 0 && (
        <p id={overlapId} role="alert" className="error">
          Periodene {overlapping.map((index) => index + 1).join(" og ")} har
          dager felles. Slå dem sammen eller endre datoene.
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          onClick={() => onChange([...periods, { start: "", end: "" }])}
        >
          Legg til periode
        </button>
      </div>
    </>
  );
}

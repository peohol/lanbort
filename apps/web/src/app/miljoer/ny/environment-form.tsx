"use client";

import {
  type EnvironmentType,
  maxRequirements,
  type RequirementKind,
} from "@lanbort/contracts";
import { useId, useState } from "react";
import { AreaField } from "@/components/area-field";
import { CommandForm } from "@/components/command-form";
import { describedBy, Field } from "@/components/field";
import { environmentHref } from "@/navigation/routes";
import {
  environmentTypeExplanations,
  environmentTypeNames,
} from "@/presentation/environments";

const types: readonly EnvironmentType[] = ["open", "closed", "hidden"];

const help = {
  name: "Navnet trenger ikke være unikt.",
  audience: "For eksempel «Beboere i Solsiden borettslag».",
  objectFocus: "For eksempel «Verktøy, hage og sport».",
  location: "Et stedsnavn folk kjenner igjen, ikke en adresse.",
};

const requirementLabels: Record<RequirementKind, string> = {
  information: "Spørsmål nye medlemmer svarer på",
  acceptance: "Regel nye medlemmer godtar",
};

interface Draft {
  readonly key: string;
  readonly kind: RequirementKind;
  readonly text: string;
}

/**
 * A new environment (PS-ENV-001–003): name, type in plain words, what it
 * is for, where it is, and what new members answer or accept. The creator
 * becomes its owner and is led to its page.
 */
export function EnvironmentForm() {
  const id = useId();
  const [drafts, setDrafts] = useState<readonly Draft[]>([]);
  const add = (kind: RequirementKind) =>
    setDrafts((current) => [
      ...current,
      { key: crypto.randomUUID(), kind, text: "" },
    ]);
  const change = (key: string, text: string) =>
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, text } : draft)),
    );
  const remove = (key: string) =>
    setDrafts((current) => current.filter((draft) => draft.key !== key));

  return (
    <CommandForm
      path="/api/environments"
      submitLabel="Opprett miljøet"
      next={environmentHref("{environmentId}")}
      fixed={{
        requirements: drafts
          .filter((draft) => draft.text.trim() !== "")
          .map(({ kind, text }) => ({ kind, text })),
      }}
    >
      <Field id="miljo-navn" label="Navn" help={help.name}>
        <input
          id="miljo-navn"
          name="name"
          required
          maxLength={100}
          autoComplete="off"
          {...describedBy("miljo-navn", help.name)}
        />
      </Field>

      <fieldset>
        <legend>Hvem kan finne og bli med?</legend>
        {types.map((type) => (
          <div key={type} className="checkbox">
            <input
              id={`miljo-type-${type}`}
              type="radio"
              name="type"
              value={type}
              required
              aria-describedby={`miljo-type-${type}-hjelp`}
            />
            <label htmlFor={`miljo-type-${type}`}>
              {environmentTypeNames[type]}
            </label>
            <p id={`miljo-type-${type}-hjelp`} className="help">
              {environmentTypeExplanations[type]}
            </p>
          </div>
        ))}
      </fieldset>

      <Field id="miljo-beskrivelse" label="Beskrivelse (valgfritt)">
        <textarea
          id="miljo-beskrivelse"
          name="description"
          maxLength={2000}
          rows={3}
        />
      </Field>
      <Field
        id="miljo-for-hvem"
        label="For hvem (valgfritt)"
        help={help.audience}
      >
        <textarea
          id="miljo-for-hvem"
          name="audience"
          maxLength={500}
          rows={2}
          {...describedBy("miljo-for-hvem", help.audience)}
        />
      </Field>
      <Field
        id="miljo-ting"
        label="Hva slags ting (valgfritt)"
        help={help.objectFocus}
      >
        <textarea
          id="miljo-ting"
          name="objectFocus"
          maxLength={500}
          rows={2}
          {...describedBy("miljo-ting", help.objectFocus)}
        />
      </Field>
      <Field id="miljo-sted" label="Sted (valgfritt)" help={help.location}>
        <input
          id="miljo-sted"
          name="location"
          maxLength={200}
          {...describedBy("miljo-sted", help.location)}
        />
      </Field>
      <AreaField />

      <fieldset>
        <legend>Krav til nye medlemmer (valgfritt)</legend>
        <p className="help">
          Svarene går bare til administratorene, som bruker dem når de behandler
          medlemskapet.
        </p>
        {drafts.map((draft, index) => {
          const fieldId = `${id}-krav-${draft.key}`;

          return (
            <div key={draft.key} className="field">
              <label htmlFor={fieldId}>
                {`${index + 1}. ${requirementLabels[draft.kind]}`}
              </label>
              <textarea
                id={fieldId}
                value={draft.text}
                maxLength={2000}
                rows={2}
                onChange={(event) => change(draft.key, event.target.value)}
              />
              <div className="actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => remove(draft.key)}
                >
                  {`Fjern krav ${index + 1}`}
                </button>
              </div>
            </div>
          );
        })}
        {drafts.length < maxRequirements && (
          <div className="actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => add("information")}
            >
              Legg til et spørsmål
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => add("acceptance")}
            >
              Legg til en regel
            </button>
          </div>
        )}
      </fieldset>
    </CommandForm>
  );
}

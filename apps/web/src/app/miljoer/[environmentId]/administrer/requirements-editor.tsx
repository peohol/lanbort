"use client";

import {
  type Environment,
  maxRequirements,
  type RequirementKind,
} from "@lanbort/contracts";
import { useId, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { useCommand } from "@/components/use-command";

type Requirement = Environment["requirements"][number];

/** A requirement kept as it is, or a new one written here. */
type Draft =
  | {
      readonly key: string;
      readonly id: string;
      readonly kind: RequirementKind;
      readonly text: string;
    }
  | {
      readonly key: string;
      readonly id?: undefined;
      readonly kind: RequirementKind;
      readonly text: string;
    };

const kindLabels: Record<RequirementKind, string> = {
  information: "Opplysning medlemmet gir",
  acceptance: "Noe medlemmet godtar, som regler eller en egenerklæring",
};

const textHelp =
  "Spør bare om det miljøet trenger. Svarene er bare synlige for administratorene.";

/**
 * The membership requirements as one list (PS-ENV-005–006): keep, remove
 * and add, then save the whole list against the revision the administrator
 * saw. A changed wording is a new requirement, so it is removed and added
 * again, and every member sees the words that bind them.
 */
export function RequirementsEditor({
  environmentId,
  revision,
  requirements,
  changeNote,
}: {
  environmentId: string;
  revision: number;
  requirements: readonly Requirement[];
  /** What a change means for current members. */
  changeNote: string;
}) {
  const ids = useId();
  const initial = (): Draft[] =>
    requirements.map((requirement) => ({
      key: requirement.id,
      ...requirement,
    }));
  const [drafts, setDrafts] = useState(initial);
  const [kind, setKind] = useState<RequirementKind>("information");
  const [text, setText] = useState("");
  const command = useCommand({
    path: "/api/environments/requirements",
    done: "Kravene er lagret",
  });
  const changed =
    drafts.length !== requirements.length ||
    drafts.some((draft, index) => draft.id !== requirements[index]?.id);

  function add() {
    const wording = text.trim();
    if (!wording || drafts.length >= maxRequirements) return;
    setDrafts([
      ...drafts,
      { key: `ny-${crypto.randomUUID()}`, kind, text: wording },
    ]);
    setText("");
  }

  async function save() {
    // The page reads the new revision, which starts the editor afresh.
    await command.run({
      environmentId,
      expectedRevision: revision,
      requirements: drafts.map((draft) =>
        draft.id ? { id: draft.id } : { kind: draft.kind, text: draft.text },
      ),
    });
  }

  return (
    <>
      {drafts.length === 0 ? (
        <p className="quiet">
          Ingen krav. Alle som får bli med, blir med uten å svare på noe.
        </p>
      ) : (
        <ol className="entries">
          {drafts.map((draft) => (
            <li key={draft.key} className="entry">
              <span className="message-text" id={`${ids}-${draft.key}`}>
                {draft.text}
              </span>
              <span className="entry-detail">
                {kindLabels[draft.kind]}
                {draft.id ? "" : " (nytt, ikke lagret)"}
              </span>
              <div className="actions">
                <button
                  type="button"
                  aria-describedby={`${ids}-${draft.key}`}
                  onClick={() =>
                    setDrafts(drafts.filter((other) => other.key !== draft.key))
                  }
                >
                  Fjern kravet
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {drafts.length < maxRequirements && (
        <fieldset>
          <legend>Nytt krav</legend>
          <Field id={`${ids}-type`} label="Hva slags krav">
            <select
              id={`${ids}-type`}
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as RequirementKind)
              }
            >
              {(Object.keys(kindLabels) as RequirementKind[]).map((option) => (
                <option key={option} value={option}>
                  {kindLabels[option]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={`${ids}-tekst`}
            label="Teksten medlemmet ser"
            help={textHelp}
          >
            <textarea
              id={`${ids}-tekst`}
              value={text}
              maxLength={2000}
              rows={3}
              onChange={(event) => setText(event.target.value)}
              {...describedBy(`${ids}-tekst`, textHelp)}
            />
          </Field>
          <div className="actions">
            <button type="button" onClick={add}>
              Legg til kravet
            </button>
          </div>
        </fieldset>
      )}
      <p className="help">{changeNote}</p>
      {changed && (
        <div className="actions">
          <BusyButton
            type="button"
            className="button-primary"
            busy={command.pending}
            onClick={() => void save()}
          >
            Lagre kravene
          </BusyButton>
          <button type="button" onClick={() => setDrafts(initial())}>
            Angre endringene
          </button>
        </div>
      )}
      <ErrorText>{command.error}</ErrorText>
    </>
  );
}

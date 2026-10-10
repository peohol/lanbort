"use client";

import {
  basisSchema,
  type OpenPlatformInquiry,
  type PlatformInquiryOpened,
  type PlatformLookupResult,
} from "@lanbort/contracts";
import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { postJson } from "@/components/api-client";
import { BusyButton } from "@/components/busy-button";
import { ConsequenceRows } from "@/components/consequence-rows";
import { errorMessage } from "@/components/error-messages";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { useCeremony } from "@/components/passkey-actions";
import { confirmWithPasskey, passkeyErrorMessage } from "@/components/passkeys";
import { Stepper } from "@/components/stepper";
import { useCommand } from "@/components/use-command";
import { caseHref } from "@/navigation/routes";
import { lookupOf, stewardshipHref } from "@/navigation/stewardship";
import {
  foundText,
  inquiryConsequences,
  type InquiryKind,
  inquiryKinds,
} from "@/presentation/inquiry";
import styles from "../../saker/cases.module.css";

type Found = NonNullable<PlatformLookupResult["found"]>;

const steps = ["Gjelder", "Grunnlag", "Bekreft"];

/** The inquiry's target, as the command takes it. */
const targetOf = (found: Found): OpenPlatformInquiry["target"] =>
  found.kind === "user"
    ? { kind: "user", userId: found.userId }
    : { kind: "object", objectId: found.objectId };

/**
 * «Åpne saksgrunnlag» (PS-ADM-015, «Plattformforvaltning v1»): what the
 * inquiry is about, found from its full e-mail address or the link to its
 * page (OD-0055), then the basis and a last look. Opening it confirms with
 * a passkey first when this session's confirmation no longer counts; the
 * steward then holds the case.
 */
export function InquiryFlow({ freshUntil }: { freshUntil: string | null }) {
  const id = useId();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<InquiryKind>("user");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [basis, setBasis] = useState("");
  const ceremony = useCeremony();
  const command = useCommand<PlatformInquiryOpened>({
    path: "/api/cases/platform-inquiries",
    done: "Saksgrunnlaget er åpnet, og du har det.",
    after: ({ caseId }) => caseHref(caseId),
    replace: true,
  });
  // Read when the page is drawn; a stale confirmation is asked for again.
  const [fresh, setFresh] = useState(
    () => freshUntil !== null && new Date(freshUntil).getTime() > Date.now(),
  );

  /** A passkey confirmation now, which counts for the rest of the flow. */
  async function confirm() {
    const confirmed = await ceremony.run(confirmWithPasskey);
    if (confirmed) setFresh(true);
    return confirmed;
  }
  const texts = inquiryKinds[kind];

  function choose(next: InquiryKind) {
    setKind(next);
    setFound(null);
    setLookupNote(null);
  }

  async function lookUp(event: FormEvent) {
    event.preventDefault();
    setFound(null);
    const lookup = lookupOf(kind, query);

    if (!lookup) {
      setLookupNote(texts.unreadable);
      return;
    }

    setLooking(true);
    setLookupNote(null);
    const send = () =>
      postJson<PlatformLookupResult>("/api/platform/lookups", lookup);
    let result = await send();
    // The confirmation ran out since the page was drawn: confirm, then once more.
    if (
      !result.ok &&
      result.code === "stronger_authentication_required" &&
      (await confirm())
    ) {
      result = await send();
    }
    setLooking(false);

    if (!result.ok) {
      setLookupNote(passkeyErrorMessage(result.code));
    } else if (!result.data.found) {
      setLookupNote(texts.none);
    } else {
      setFound(result.data.found);
    }
  }

  async function open(event: FormEvent) {
    event.preventDefault();
    if (!found) return;
    if (!fresh && !(await confirm())) return;

    await command.run({ target: targetOf(found), basis });
  }

  const shown = found && foundText(found);
  const usable = found !== null && !found.involved;
  const error =
    (ceremony.failure && passkeyErrorMessage(ceremony.failure)) ??
    (command.failure &&
      passkeyErrorMessage(command.failure, {
        conflict_of_interest: texts.own,
        not_found: errorMessage("not_found"),
      }));

  return (
    <>
      <Stepper steps={steps} current={step - 1} />
      {step === 1 && (
        <>
          <form onSubmit={(event) => void lookUp(event)}>
            <h2>Hva gjelder saksgrunnlaget?</h2>
            <fieldset className={styles.options}>
              <legend>Gjelder</legend>
              {(Object.keys(inquiryKinds) as InquiryKind[]).map((each) => (
                <label key={each} className={styles.option}>
                  <input
                    type="radio"
                    name={`${id}-gjelder`}
                    checked={kind === each}
                    onChange={() => choose(each)}
                  />
                  <span>
                    <strong>{inquiryKinds[each].label}</strong>
                    <small>{inquiryKinds[each].detail}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <Field id={`${id}-finn`} label={texts.field} help={texts.help}>
              <input
                id={`${id}-finn`}
                type="text"
                inputMode={kind === "user" ? "email" : "url"}
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={2000}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFound(null);
                  setLookupNote(null);
                }}
                {...describedBy(`${id}-finn`, true)}
              />
            </Field>
            <div className="actions">
              <BusyButton type="submit" busy={looking} busyNote="finner …">
                Finn
              </BusyButton>
            </div>
          </form>
          <div role="status">
            {shown && (
              <div className="card">
                <p>
                  <strong>{shown.name}</strong>
                </p>
                <p className="help">
                  {found.involved ? texts.own : shown.detail}
                </p>
              </div>
            )}
            {lookupNote && <p className="help">{lookupNote}</p>}
          </div>
          <div className="actions">
            <button
              type="button"
              className="button-primary"
              disabled={!usable}
              onClick={() => setStep(2)}
            >
              Neste: grunnlag
            </button>
            <Link className="button" href={stewardshipHref}>
              Avbryt
            </Link>
          </div>
        </>
      )}
      {step === 2 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setStep(3);
          }}
        >
          <h2>Grunnlag</h2>
          <Field
            id={`${id}-grunnlag`}
            label="Hvorfor åpner du saken?"
            help="Det du har sett eller fått vite, og hvor."
          >
            <textarea
              id={`${id}-grunnlag`}
              rows={5}
              required
              maxLength={2000}
              value={basis}
              onChange={(event) => setBasis(event.target.value)}
              {...describedBy(`${id}-grunnlag`, true)}
            />
          </Field>
          <p className="help">
            Blir sakens første innlegg. Bare forvalterne som behandler, ser det.
          </p>
          <div className="actions">
            <button
              type="submit"
              className="button-primary"
              disabled={!basisSchema.safeParse(basis).success}
            >
              Neste: se over
            </button>
            <button type="button" onClick={() => setStep(1)}>
              Tilbake
            </button>
          </div>
        </form>
      )}
      {step === 3 && found && shown && (
        <form onSubmit={(event) => void open(event)}>
          <h2>Åpne saksgrunnlag om {shown.name}?</h2>
          <ConsequenceRows rows={inquiryConsequences(found)} />
          <dl className="facts card">
            <dt>Gjelder</dt>
            <dd>{shown.name}</dd>
            <dt>Grunnlaget</dt>
            <dd>{basis.trim()}</dd>
          </dl>
          {!fresh && (
            <p className="help" role="status">
              <Icon name="lock" /> Det er mer enn 10 minutter siden du
              bekreftet. Du bekrefter med passkey når du trykker.
            </p>
          )}
          <div className="actions">
            <BusyButton
              type="submit"
              className="button-primary"
              busy={ceremony.pending || command.pending}
              busyNote={ceremony.pending ? "venter på passkeyen …" : "sender …"}
            >
              <Icon name={fresh ? "edit" : "lock"} />
              Åpne saksgrunnlaget
            </BusyButton>
            <button type="button" onClick={() => setStep(2)}>
              Tilbake
            </button>
          </div>
          <ErrorText id={`${id}-feil`}>{error}</ErrorText>
        </form>
      )}
    </>
  );
}

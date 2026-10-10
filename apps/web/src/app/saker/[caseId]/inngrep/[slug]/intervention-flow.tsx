"use client";

import { basisSchema } from "@lanbort/contracts";
import { type FormEvent, useId, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ConsequenceRows } from "@/components/consequence-rows";
import Link from "next/link";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { useCeremony } from "@/components/passkey-actions";
import { confirmWithPasskey, passkeyErrorMessage } from "@/components/passkeys";
import { Stepper } from "@/components/stepper";
import { useCommand } from "@/components/use-command";
import { foundText } from "@/presentation/inquiry";
import {
  type InterventionFlowKey,
  type InterventionPick,
  type Subject,
  interventionChoice,
  interventionFlows,
  interventionVariant,
} from "@/presentation/interventions";
import {
  type Found,
  SubjectLookup,
} from "../../../../forvaltning/subject-lookup";
import styles from "../../../cases.module.css";
import { interventionSteps } from "../steps";

/** What a refused intervention means here. */
const failures = {
  forbidden:
    "Inngrepet kan ikke gjøres nå. Saken er lest på nytt og viser hvordan den står.",
  conflict_of_interest:
    "Du er involvert i det saken gjelder, så du kan ikke gjøre inngrep fra den.",
};

const basisHelp =
  "Lagres med inngrepet i saken. Bare forvalterne som behandler saken, ser den. Den står ikke i varsler eller logger.";

/**
 * Steps 2–4 of an intervention (PS-ADM-014–015, «Plattformforvaltning
 * v1»): the consequences, with what it is taken in or toward where it
 * needs that, the basis and a last look before it is done, confirming with
 * a passkey first when this session's confirmation no longer counts. The
 * command decides; the case shows what was done.
 */
export function InterventionFlow({
  path,
  flowKey,
  subject,
  record,
  caseTitle,
  freshUntil,
  back,
  after,
}: {
  path: string;
  flowKey: InterventionFlowKey;
  /** The account the case is about. */
  subject: Subject;
  /** What the case will record, as its handlers read it. */
  record: string;
  caseTitle: string;
  freshUntil: string | null;
  /** The choices of intervention, for «Velg et annet inngrep». */
  back: string;
  /** The case, where the steward lands once it is done. */
  after: string;
}) {
  const id = useId();
  const errorId = `${id}-feil`;
  const flow = interventionFlows[flowKey];
  const choice = interventionChoice(flowKey, subject);
  const open = choice?.options?.filter(({ disabled }) => !disabled) ?? [];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // A found account carries how it stands, as the steward checks it.
  const [pick, setPick] = useState<
    (InterventionPick & { readonly detail?: string }) | null
  >(open.length === 1 ? open[0]! : null);
  const [basis, setBasis] = useState("");
  const variant = interventionVariant(flowKey, subject, pick);
  const ready = !choice || pick !== null;
  const ceremony = useCeremony();
  const command = useCommand({
    path,
    done: variant.done,
    after: () => after,
    replace: true,
    // The confirmation ran out while the steward wrote; the next send asks
    // for it again, and what they wrote stays.
    onFailure: (code) => {
      if (code === "stronger_authentication_required") setFresh(false);
    },
  });
  // Read when the page is drawn; a stale confirmation is asked for again.
  const [fresh, setFresh] = useState(
    () => freshUntil !== null && new Date(freshUntil).getTime() > Date.now(),
  );
  const [passkeyStep] = useState(!fresh);
  const steps = interventionSteps(passkeyStep);
  const current =
    step === 3 ? steps.length - (passkeyStep && !fresh ? 2 : 1) : step;

  /** A passkey confirmation now, which counts for the rest of the flow. */
  async function confirm() {
    const confirmed = await ceremony.run(confirmWithPasskey);
    if (confirmed) setFresh(true);
    return confirmed;
  }

  async function run(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    if (!fresh && !(await confirm())) return;

    await command.run({ basis, ...variant.fields });
  }

  function next(event?: FormEvent) {
    event?.preventDefault();
    if (ready) setStep(step === 1 ? 2 : 3);
  }

  /** Why a found account cannot be picked here, or null once it is. */
  function found(account: Found): string | null {
    if (account.kind !== "user") return null;
    if (account.involved) return "Du kan ikke velge din egen konto.";
    if (account.userId === subject.account.userId) {
      return "Det er kontoen saken gjelder. Finn den andre kontoen.";
    }
    if (!choice?.usable(account.status)) {
      return "Den kontoen er ikke aktiv eller kan ikke brukes her.";
    }

    setPick({ id: account.userId, ...foundText(account) });
    return null;
  }

  const error =
    (ceremony.failure && passkeyErrorMessage(ceremony.failure)) ??
    (command.failure && passkeyErrorMessage(command.failure, failures));

  return (
    <>
      <Stepper steps={steps} current={current} />
      {step === 1 && (
        <>
          {(pick || !choice?.options) && (
            <>
              <h2>{variant.title}</h2>
              <ConsequenceRows rows={variant.rows} />
            </>
          )}
          {choice?.options && (
            <fieldset className={styles.options}>
              <legend>{choice.label}</legend>
              {choice.options.map((option) => (
                <label key={option.id} className={styles.option}>
                  <input
                    type="radio"
                    name={`${id}-valg`}
                    checked={pick?.id === option.id}
                    disabled={option.disabled}
                    onChange={() => setPick(option)}
                  />
                  <span>
                    <strong>{option.name}</strong>
                    <small>{option.detail}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {choice && !choice.options && (
            <section aria-labelledby={`${id}-velg`}>
              <h3 id={`${id}-velg`}>{choice.label}</h3>
              <SubjectLookup
                id={`${id}-finn`}
                kind="user"
                confirm={confirm}
                onFound={found}
                onChange={() => setPick(null)}
              />
              <div role="status">
                {pick && (
                  <div className="card">
                    <p>
                      <strong>{pick.name}</strong>
                    </p>
                    <p className="help">{pick.detail}</p>
                  </div>
                )}
              </div>
              {choice.hint && <p className="help">{choice.hint}</p>}
            </section>
          )}
          <div className="actions">
            <button
              type="button"
              className="button-primary"
              disabled={!ready}
              onClick={() => next()}
            >
              Neste: begrunnelse
            </button>
            <Link className="button" href={back}>
              Velg et annet inngrep
            </Link>
          </div>
        </>
      )}
      {step === 2 && (
        <form onSubmit={next}>
          <h2>Begrunnelse</h2>
          <Field
            id={`${id}-begrunnelse`}
            label="Begrunnelse"
            help="Kort og saklig: hva du har sett, og hvorfor dette inngrepet."
          >
            <textarea
              id={`${id}-begrunnelse`}
              rows={5}
              required
              maxLength={2000}
              value={basis}
              onChange={(event) => setBasis(event.target.value)}
              {...describedBy(`${id}-begrunnelse`, true)}
            />
          </Field>
          <p className="help">{basisHelp}</p>
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
      {step === 3 && ready && (
        <form onSubmit={(event) => void run(event)}>
          <h2>{variant.title}</h2>
          <dl className="facts card">
            <dt>Inngrep</dt>
            <dd>{record}</dd>
            <dt>Gjelder</dt>
            <dd>{variant.whom}</dd>
            <dt>Fra saken</dt>
            <dd>{caseTitle}</dd>
            <dt>Begrunnelse</dt>
            <dd>{basis.trim()}</dd>
          </dl>
          {fresh ? (
            <p className="help">
              Du har bekreftet med passkey de siste 10 minuttene.
            </p>
          ) : (
            <p className="help" role="status">
              <Icon name="lock" /> Det er mer enn 10 minutter siden du
              bekreftet. Når du trykker, bekrefter du med passkey, og så gjøres
              inngrepet. Begrunnelsen er tatt vare på.
            </p>
          )}
          <div className="actions">
            <BusyButton
              type="submit"
              className={flow.danger ? "button-danger" : "button-primary"}
              busy={ceremony.pending || command.pending}
              busyNote={ceremony.pending ? "venter på passkeyen …" : "sender …"}
            >
              <Icon name={fresh ? flow.icon : "lock"} />
              {variant.verb}
            </BusyButton>
            <button type="button" onClick={() => setStep(2)}>
              Tilbake
            </button>
          </div>
          <ErrorText id={errorId}>{error}</ErrorText>
        </form>
      )}
    </>
  );
}

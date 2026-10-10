"use client";

import { basisSchema } from "@lanbort/contracts";
import { type FormEvent, useId, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ConsequenceRows } from "@/components/consequence-rows";
import Link from "next/link";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { Icon, type IconName } from "@/components/icon";
import { useCeremony } from "@/components/passkey-actions";
import { confirmWithPasskey, passkeyErrorMessage } from "@/components/passkeys";
import { Stepper } from "@/components/stepper";
import { useCommand } from "@/components/use-command";
import type { ConsequenceRow } from "@/presentation/interventions";
import styles from "../../../cases.module.css";
import { interventionSteps } from "../steps";

/** One way the intervention can go: in which environment, for roles. */
export interface InterventionVariant {
  /** The environment it is taken in, where it needs one. */
  readonly environmentId: string | null;
  readonly label: string;
  readonly detail: string;
  readonly title: string;
  readonly rows: readonly ConsequenceRow[];
  readonly whom: string;
  readonly done: string;
}

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
 * v1»): the consequences, the basis and a last look before it is done,
 * confirming with a passkey first when this session's confirmation no
 * longer counts. The command decides; the case shows what was done.
 */
export function InterventionFlow({
  path,
  userId,
  record,
  caseTitle,
  icon,
  danger,
  verb,
  variants,
  choiceLabel,
  freshUntil,
  back,
  after,
}: {
  path: string;
  /** The account the case is about. */
  userId: string;
  /** What the case will record, as its handlers read it. */
  record: string;
  caseTitle: string;
  icon: IconName;
  danger: boolean;
  verb: string;
  variants: readonly InterventionVariant[];
  /** What the steward chooses between, where there is more than one. */
  choiceLabel: string | null;
  freshUntil: string | null;
  /** The choices of intervention, for «Velg et annet inngrep». */
  back: string;
  /** The case, where the steward lands once it is done. */
  after: string;
}) {
  const id = useId();
  const errorId = `${id}-feil`;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [chosen, setChosen] = useState(variants.length === 1 ? 0 : null);
  const [basis, setBasis] = useState("");
  const variant = chosen === null ? null : variants[chosen]!;
  const ceremony = useCeremony();
  const command = useCommand({
    path,
    done: variant?.done ?? record,
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

  async function run(event: FormEvent) {
    event.preventDefault();
    if (!variant) return;
    if (!fresh) {
      if (!(await ceremony.run(confirmWithPasskey))) return;
      setFresh(true);
    }

    await command.run({
      userId,
      basis,
      ...(variant.environmentId
        ? { environmentId: variant.environmentId }
        : {}),
    });
  }

  function next(event: FormEvent) {
    event.preventDefault();
    if (variant) setStep(step === 1 ? 2 : 3);
  }

  const error =
    (ceremony.failure && passkeyErrorMessage(ceremony.failure)) ??
    (command.failure && passkeyErrorMessage(command.failure, failures));

  return (
    <>
      <Stepper steps={steps} current={current} />
      {step === 1 && (
        <form onSubmit={next}>
          {variant && <h2>{variant.title}</h2>}
          {choiceLabel && (
            <fieldset className={styles.options}>
              <legend>{choiceLabel}</legend>
              {variants.map((each, index) => (
                <label key={each.label} className={styles.option}>
                  <input
                    type="radio"
                    name={`${id}-valg`}
                    checked={chosen === index}
                    onChange={() => setChosen(index)}
                    required
                  />
                  <span>
                    <strong>{each.label}</strong>
                    <small>{each.detail}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {variant && <ConsequenceRows rows={variant.rows} />}
          <div className="actions">
            <button type="submit" className="button-primary">
              Neste: begrunnelse
            </button>
            <Link className="button" href={back}>
              Velg et annet inngrep
            </Link>
          </div>
        </form>
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
      {step === 3 && variant && (
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
              className={danger ? "button-danger" : "button-primary"}
              busy={ceremony.pending || command.pending}
              busyNote={ceremony.pending ? "venter på passkeyen …" : "sender …"}
            >
              <Icon name={fresh ? icon : "lock"} />
              {verb}
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

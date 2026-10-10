import type {
  Case,
  ModerationMeasure,
  ModerationMeasureKind,
} from "@lanbort/contracts";
import { caseKinds } from "@lanbort/domain";
import { ActionButton } from "@/components/action-button";
import { CommandForm } from "@/components/command-form";
import { ConfirmAction } from "@/components/confirm-action";
import { describedBy, Field } from "@/components/field";
import { MoreActions } from "@/components/more-actions";
import { environmentCasesHref } from "@/navigation/cases";
import { casesHref } from "@/navigation/routes";
import {
  describeAction,
  handlerFunction,
  handlersInSentence,
  measureLabels,
  personIn,
} from "@/presentation/cases";
import { formatShortTime } from "@/presentation/dates";
import styles from "../cases.module.css";
import { CloseWithMessage } from "./close-case";
import { MeasureForm } from "./measure-form";

const casePath = (c: Case, action: string) => `/api/cases/${c.id}/${action}`;

/** The parties by name, as a closing sheet says who it affects. */
const partiesOf = (c: Case) => {
  const names = c.participants.map((participant) =>
    personIn(c.people, participant.userId),
  );

  return names.length > 0 ? names.join(" og ") : "Partene";
};

/** The handler takes the case while nobody has it (PS-COM-011). */
export function TakeCase({ c }: { c: Case }) {
  return (
    <ActionButton
      primary
      label="Ta saken"
      path={casePath(c, "claim")}
      body={{}}
    />
  );
}

/** PS-COM-012: the parties of a mediation see each other's statements. */
export function ShareStatements({ c }: { c: Case }) {
  return (
    <ConfirmAction
      primary
      label="Del forklaringene med partene"
      title="Dele forklaringene?"
      consequences={{
        affects: [
          `${partiesOf(c)} ser hverandres innlegg skrevet så langt.`,
          "Innlegg som kommer senere, venter til du deler igjen.",
        ],
        stays: ["Interne notater og innlegg til én part deles ikke."],
      }}
      confirmLabel="Del forklaringene"
      path={casePath(c, "share-statements")}
      body={{}}
    />
  );
}

/**
 * Closing decides nothing about the loan or the accounts (vision 06): the
 * sheet says so, and that everything written stays.
 */
export function CloseCase({
  c,
  primary = false,
}: {
  c: Case;
  primary?: boolean;
}) {
  const parties = partiesOf(c);
  const consequences = {
    gone: [`${parties} kan ikke skrive mer i saken.`],
    stays: [
      "Alt som er skrevet, blir stående.",
      c.kind === "loan_mediation"
        ? "Lukkingen avgjør ingenting om lånet eller kontoene. Lånet går videre etter det partene selv registrerer."
        : "Lukkingen avgjør ingenting om kontoene.",
    ],
    affects: [`${parties} får beskjed om at saken er lukket.`],
  };

  if (caseKinds[c.kind].closingMessage) {
    return (
      <CloseWithMessage
        caseId={c.id}
        consequences={consequences}
        primary={primary}
      />
    );
  }

  return (
    <ConfirmAction
      primary={primary}
      label="Lukk saken"
      title="Lukke saken?"
      consequences={consequences}
      confirmLabel="Lukk saken"
      path={casePath(c, "close")}
      body={{}}
    />
  );
}

/**
 * The handling of an open case the reader acts on (PS-COM-011,
 * UX-JRN-012): asking for new entries, a measure on what a report is
 * about, and closing. The server decides each step again.
 */
export function Handling({
  c,
  measures,
  environment,
  closeOffered,
}: {
  c: Case;
  measures: readonly ModerationMeasureKind[];
  environment: string | null;
  /** Whether «Lukk saken» belongs here, not in the status card. */
  closeOffered: boolean;
}) {
  const { turns } = caseKinds[c.kind];
  const name = (id: string) => personIn(c.people, id);

  return (
    <>
      {measures.length > 0 && (
        <MeasureForm
          caseId={c.id}
          measures={measures}
          environment={environment}
        />
      )}
      <section className={styles.section} aria-labelledby="behandling">
        <h2 id="behandling">Behandling</h2>
        {turns && c.participants.length > 0 && (
          <CommandForm
            path={casePath(c, "rounds")}
            submitLabel="Be om nytt innlegg"
            secondary
          >
            <Field
              id="runde"
              label="Hvem skal kunne skrive igjen"
              help="Partene skriver ett innlegg om gangen. De får beskjed om at det er deres tur."
            >
              <select id="runde" name="userId" {...describedBy("runde", true)}>
                {c.participants.length > 1 && (
                  <option value="">Begge parter</option>
                )}
                {c.participants.map((participant) => (
                  <option key={participant.userId} value={participant.userId}>
                    {name(participant.userId)}
                  </option>
                ))}
              </select>
            </Field>
          </CommandForm>
        )}
        {closeOffered && (
          <div className="actions">
            <CloseCase c={c} />
          </div>
        )}
      </section>
    </>
  );
}

/**
 * The rarer steps for a handler (UX-INT-009): giving the case back or on,
 * and stepping aside as not impartial (PS-USR-009). Taking a report on to
 * Lånbort is not offered until the platform stewards can handle it
 * (UX-EXC-011); the row says so where it would have been.
 */
export function HandlerMoreActions({ c, userId }: { c: Case; userId: string }) {
  const mine = c.assigneeUserId === userId;
  const acting = mine || c.assigneeUserId === null;
  const name = (id: string) => personIn(c.people, id);

  return (
    <MoreActions>
      {mine && (
        <ActionButton
          label="Legg saken tilbake i køen"
          path={casePath(c, "release")}
          body={{}}
        />
      )}
      {mine && c.handlers.length > 0 && (
        <CommandForm
          path={casePath(c, "transfer")}
          submitLabel="Gi saken videre"
          secondary
        >
          <Field id="overfor" label="Gi saken til">
            <select id="overfor" name="toUserId" required>
              {c.handlers.map((handler) => (
                <option key={handler} value={handler}>
                  {name(handler)}
                </option>
              ))}
            </select>
          </Field>
        </CommandForm>
      )}
      {acting && c.kind === "environment_report" && (
        <p className={styles.unavailable}>
          <strong>Send videre til Lånbort</strong>
          Ikke tilgjengelig ennå. Lånbort kan ikke ta imot rapporter i appen
          ennå.
        </p>
      )}
      <ConfirmAction
        label="Erklær deg inhabil"
        title="Erklære deg inhabil?"
        consequences={{
          gone: [
            "Du kan ikke behandle denne saken igjen, og du ser den ikke lenger.",
          ],
          stays: ["Det du har skrevet i saken, blir stående."],
          affects: mine
            ? [
                "Saken går tilbake i køen, og de andre administratorene får beskjed.",
              ]
            : [],
        }}
        confirmLabel="Erklær meg inhabil"
        path={casePath(c, "recuse")}
        body={{}}
        next={
          c.environmentId ? environmentCasesHref(c.environmentId) : casesHref
        }
        icon="block"
        danger
      />
    </MoreActions>
  );
}

/**
 * What the one who opened the case may do to end it (PS-COM-021), under
 * «Flere valg» as for a handler: close a contact, with nothing to confirm
 * since nothing disappears, or withdraw a report, which the sheet says
 * removes nothing and stops no assessment. In a mediation the row says why
 * neither party closes it.
 */
export function ParticipantMoreActions({
  c,
  environment,
}: {
  c: Case;
  environment: string | null;
}) {
  const ends = caseKinds[c.kind].openerEnds;
  const handlers = handlerFunction(c.kind, environment);

  if (ends === "withdraw" && c.withdrawnAt !== null) return null;

  return (
    <MoreActions>
      {ends === "close" && (
        <>
          <ActionButton
            label="Avslutt henvendelsen"
            path={casePath(c, "end")}
            body={{}}
          />
          <p className="quiet">
            Saken lukkes, og alt som er skrevet, blir stående.
          </p>
        </>
      )}
      {ends === "withdraw" && (
        <ConfirmAction
          label="Trekk rapporten"
          title="Trekke rapporten?"
          consequences={{
            stays: [
              "Det du har skrevet, blir stående i saken og slettes ikke.",
              `${handlers} kan likevel fullføre vurderingen og gjøre tiltak hvis det trengs.`,
            ],
            affects: [
              `${handlers} får beskjed om at du har trukket rapporten.`,
            ],
          }}
          confirmLabel="Trekk rapporten"
          path={casePath(c, "withdraw")}
          body={{}}
        />
      )}
      {ends === null && (
        <p className={styles.unavailable}>
          <strong>Lukke saken</strong>
          Bare {handlersInSentence(c.kind, environment)} kan lukke en mekling,
          fordi dere begge er parter.
        </p>
      )}
    </MoreActions>
  );
}

/** What was done in the case, for its handlers (UX-IA-008). */
export function History({
  c,
  taken,
}: {
  c: Case;
  taken: readonly ModerationMeasure[];
}) {
  if (c.history.length === 0) return null;

  return (
    <details id="historikk" className={styles.section}>
      <summary>Historikk</summary>
      <ol className={styles.entries} aria-label="Behandlingen, eldste først">
        {c.history.map((action, index) => (
          <li key={index} className={styles.entry}>
            <span>{describeAction(action, c)}</span>
            <time className="quiet" dateTime={action.at}>
              {formatShortTime(action.at)}
            </time>
          </li>
        ))}
        {taken.map((measure) => (
          <li key={measure.id} className={styles.entry}>
            <span>
              {personIn(c.people, measure.decidedByUserId, "En saksbehandler")}{" "}
              gjennomførte tiltaket «{measureLabels[measure.kind]}»
            </span>
            <time className="quiet" dateTime={measure.decidedAt}>
              {formatShortTime(measure.decidedAt)}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** The measures taken on the report (PS-TRUST-016): what, who, when, why. */
export function TakenMeasures({
  c,
  taken,
  environment,
}: {
  c: Case;
  taken: readonly ModerationMeasure[];
  environment: string | null;
}) {
  if (taken.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="tiltak">
      <h2 id="tiltak">Tiltak</h2>
      <ol className={styles.entries}>
        {taken.map((measure) => (
          <li key={measure.id} className={styles.entry}>
            <strong>
              {measureLabels[measure.kind]}
              {measure.scope === "environment" && environment
                ? ` i ${environment}`
                : ""}
            </strong>
            <span className="quiet">
              {personIn(c.people, measure.decidedByUserId, "En saksbehandler")}{" "}
              · {formatShortTime(measure.decidedAt)}
            </span>
            <p className={styles.body}>{measure.reason}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

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
import { caseHref } from "@/navigation/routes";
import { describeAction, measureLabels, personIn } from "@/presentation/cases";
import { formatTime } from "@/presentation/dates";

/** The handler's first step: take the case, or give it back (PS-COM-011). */
export function Assignment({ c, userId }: { c: Case; userId: string }) {
  const path = (action: string) => `/api/cases/${c.id}/${action}`;

  if (c.assigneeUserId === null) {
    return (
      <ActionButton primary label="Ta saken" path={path("claim")} body={{}} />
    );
  }

  return c.assigneeUserId === userId ? (
    <ActionButton
      label="Legg saken tilbake i køen"
      path={path("release")}
      body={{}}
    />
  ) : null;
}

/**
 * The rest of the handling of an open case (PS-COM-011, UX-JRN-012), for
 * the handler who has it, or anyone who may handle it while nobody does;
 * another handler may only step aside. The server decides each step again.
 */
export function Handling({
  c,
  userId,
  measures,
}: {
  c: Case;
  userId: string;
  measures: readonly ModerationMeasureKind[];
}) {
  const mine = c.assigneeUserId === userId;
  const acting = mine || c.assigneeUserId === null;
  const path = (action: string) => `/api/cases/${c.id}/${action}`;
  const name = (id: string) => personIn(c.people, id);
  const { turns, separateStatements } = caseKinds[c.kind];

  return (
    <section aria-labelledby="behandling">
      <h2 id="behandling">Saksbehandling</h2>
      {acting && turns && c.participants.length > 0 && (
        <CommandForm
          path={path("rounds")}
          submitLabel="Be om nytt innlegg"
          secondary
        >
          <Field
            id="runde"
            label="Hvem skal kunne skrive igjen"
            help="Partene skriver ett innlegg om gangen."
          >
            <select id="runde" name="userId" {...describedBy("runde", true)}>
              <option value="">Alle parter</option>
              {c.participants.map((participant) => (
                <option key={participant.userId} value={participant.userId}>
                  {name(participant.userId)}
                </option>
              ))}
            </select>
          </Field>
        </CommandForm>
      )}
      {acting && separateStatements && (
        <div className="actions">
          <ConfirmAction
            label="Del forklaringene med partene"
            title="Del forklaringene?"
            consequences={{
              affects: [
                "Partene ser hverandres innlegg skrevet så langt.",
                "Innlegg som kommer senere, venter til du deler igjen.",
              ],
              stays: ["Interne notater og innlegg til én part deles ikke."],
            }}
            confirmLabel="Del forklaringene"
            path={path("share-statements")}
            body={{}}
          />
        </div>
      )}
      {mine && c.handlers.length > 0 && (
        <CommandForm
          path={path("transfer")}
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
      {acting && measures.length > 0 && <Measures c={c} measures={measures} />}
      {acting && (
        <div className="actions">
          <ConfirmAction
            label="Lukk saken"
            title="Lukk saken?"
            consequences={{
              gone: ["Partene kan ikke skrive mer i saken."],
              stays: [
                "Alt som er skrevet, blir stående.",
                "Lukkingen avgjør ingenting om lånet eller kontoene.",
              ],
              affects: ["Partene får beskjed om at saken er lukket."],
            }}
            confirmLabel="Lukk saken"
            path={path("close")}
            body={{}}
          />
        </div>
      )}
      <MoreActions>
        {acting && c.kind === "environment_report" && (
          <CommandForm
            path={path("escalate")}
            next={caseHref("{caseId}")}
            submitLabel="Send rapporten videre til Lånbort"
            done="Rapporten er sendt til Lånbort"
            secondary
          >
            <Field
              id="eskaler"
              label="Hva Lånbort bør vite"
              help="For alvorlige brudd og det som gjelder hele Lånbort. Rapporten her fortsetter som før, og du blir den som melder den nye."
            >
              <textarea
                id="eskaler"
                name="body"
                rows={3}
                required
                {...describedBy("eskaler", true)}
              />
            </Field>
          </CommandForm>
        )}
        <ConfirmAction
          label="Erklær deg inhabil"
          title="Erklær deg inhabil?"
          consequences={{
            gone: ["Du kan ikke behandle denne saken igjen."],
            stays: ["Det du har skrevet i saken, blir stående."],
            affects: mine
              ? ["Saken går tilbake i køen til de andre saksbehandlerne."]
              : [],
          }}
          confirmLabel="Erklær meg inhabil"
          path={path("recuse")}
          body={{}}
          danger
        />
      </MoreActions>
    </section>
  );
}

/** PS-TRUST-013–016: a measure on what the report concerns, with a reason. */
function Measures({
  c,
  measures,
}: {
  c: Case;
  measures: readonly ModerationMeasureKind[];
}) {
  return (
    <CommandForm
      path={`/api/cases/${c.id}/measures`}
      submitLabel="Gjennomfør tiltaket"
      secondary
    >
      <Field id="tiltak" label="Tiltak">
        <select id="tiltak" name="measure" required>
          {measures.map((measure) => (
            <option key={measure} value={measure}>
              {measureLabels[measure]}
            </option>
          ))}
        </select>
      </Field>
      {measures.includes("review_score_removed") && (
        <Field
          id="dimensjon"
          label="Vurderingen som skal fjernes"
          help="Bare når tiltaket er å fjerne én vurdering."
        >
          <input
            id="dimensjon"
            name="dimension"
            {...describedBy("dimensjon", true)}
          />
        </Field>
      )}
      <Field
        id="begrunnelse"
        label="Begrunnelse"
        help="Lagres med tiltaket og vises bare for saksbehandlerne."
      >
        <textarea
          id="begrunnelse"
          name="reason"
          rows={3}
          required
          {...describedBy("begrunnelse", true)}
        />
      </Field>
    </CommandForm>
  );
}

/** What was done in the case, for its handlers (UX-IA-008). */
export function History({
  c,
  taken,
  measuresOffered,
}: {
  c: Case;
  taken: readonly ModerationMeasure[];
  measuresOffered: boolean;
}) {
  if (c.history.length === 0 && taken.length === 0) return null;

  return (
    <details id="historikk">
      <summary>Historikk</summary>
      {c.history.length > 0 && (
        <ol className="entries" aria-label="Behandlingen, eldste først">
          {c.history.map((action, index) => (
            <li key={index} className="entry">
              <span>{describeAction(action, c.people)}</span>
              <time className="entry-detail" dateTime={action.at}>
                {formatTime(action.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
      {(measuresOffered || taken.length > 0) && (
        <>
          <h3>Tiltak</h3>
          {taken.length === 0 ? (
            <p className="quiet">Ingen tiltak er gjennomført.</p>
          ) : (
            <ol className="entries" aria-label="Tiltak, eldste først">
              {taken.map((measure) => (
                <li key={measure.id} className="entry">
                  <span>{measureLabels[measure.kind]}</span>
                  <span className="entry-detail">
                    {personIn(
                      c.people,
                      measure.decidedByUserId,
                      "En saksbehandler",
                    )}{" "}
                    · {formatTime(measure.decidedAt)}
                  </span>
                  <span className="message-text">{measure.reason}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </details>
  );
}

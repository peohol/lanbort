import type { Environment } from "@lanbort/contracts";
import Link from "next/link";
import { Fragment } from "react";
import { ActionButton } from "@/components/action-button";
import { ConfirmAction } from "@/components/confirm-action";
import { StatusCard } from "@/components/status-card";
import type { Tone } from "@/components/tag";
import { newCaseHref } from "@/navigation/cases";
import {
  environmentHref,
  environmentJoinHref,
  environmentWelcomeHref,
} from "@/navigation/routes";
import { formatTime } from "@/presentation/dates";
import {
  answerCommand,
  describeMembership,
  describeTypeChange,
  environmentRoleNames,
  givenAnswers,
  leavingConsequences,
  membershipLabel,
  type MembershipStep,
  typeChangeAnswer,
} from "@/presentation/environments";
import { findEnvironmentsHref } from "@/presentation/search";
import { InformationQuestion } from "./information-question";

const leavePath = "/api/environments/membership/leave";

const stepTones: Record<MembershipStep["kind"], Tone> = {
  closed_to_new: "neutral",
  join: "neutral",
  apply: "neutral",
  accept_invitation: "waiting",
  awaiting_review: "waiting",
  information_requested: "warning",
  confirm: "waiting",
  passive: "warning",
  transition: "warning",
  member: "positive",
};

/**
 * The user's relation to the environment and the next step (UX-INT-001):
 * the way to joining, applying, accepting an invitation or meeting new
 * requirements (PS-ENV-004–006), a bounded task of its own; what a pending
 * application holds; answering a proposed weaker type (UX-PRIV-008); and
 * taking on a role. Right after joining, the card welcomes the new member.
 * Contact and leaving are on «Om miljøet» (`YourMembership`).
 */
export function Membership({
  environment,
  step,
  welcomed,
}: {
  environment: Environment;
  step: MembershipStep;
  /** The greeting, on the first visit after joining. */
  welcomed?: string | undefined;
}) {
  const { continuity } = environment;
  const welcome = step.kind === "member" ? welcomed : undefined;
  const given =
    step.kind === "awaiting_review" || step.kind === "information_requested"
      ? givenAnswers(environment)
      : [];

  return (
    <>
      <StatusCard
        label={membershipLabel(environment, step)}
        status={welcome ?? describeMembership(environment, step)}
        tone={stepTones[step.kind]}
        when={
          step.kind === "transition"
            ? `Frist ${formatTime(step.deadline)}`
            : continuity?.windDown
              ? `Miljøet avvikles ${formatTime(continuity.windDown.finalAt)}`
              : undefined
        }
        who={
          continuity && !continuity.administrationAvailable
            ? "Miljøet har ingen administrator som kan behandle noe akkurat nå."
            : undefined
        }
        actions={<StepActions environment={environment} step={step} />}
      >
        {welcome && (
          <p>
            Nå kan du låne av de andre medlemmene og legge ut dine egne ting
            her. Du finner miljøet under «Dine miljøer» i Hjem.
          </p>
        )}
        {step.kind === "information_requested" && (
          <AskedQuestion environment={environment} />
        )}
        {given.length > 0 && (
          <section aria-labelledby="soknaden-din">
            <h3 id="soknaden-din">Søknaden din</h3>
            <dl className="facts">
              {given.map(({ term, value }, index) => (
                <Fragment key={index}>
                  <dt>{term}</dt>
                  <dd className="message-text">{value}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        )}
      </StatusCard>
      <TypeChange environment={environment} />
      <RoleInvitations environment={environment} />
    </>
  );
}

/**
 * Steps taken from the card: the way to the step that sends answers (or the
 * step itself, when there is nothing to answer), and withdrawing or
 * declining. Administrators find their tasks under the card.
 */
function StepActions({
  environment,
  step,
}: {
  environment: Environment;
  step: MembershipStep;
}) {
  const command = answerCommand(environment, step);
  // After a rejection the way on is elsewhere first (Tomat kjerneflyt 3).
  const rejected = step.kind === "apply" && step.rejected;

  return (
    <>
      {rejected && (
        <Link className="button button-secondary" href={findEnvironmentsHref}>
          Finn andre miljøer
        </Link>
      )}
      {command &&
        (environment.requirements.length > 0 ? (
          <Link
            className={`button ${rejected ? "button-secondary" : "button-primary"}`}
            href={environmentJoinHref(environment.id)}
          >
            {command.opens}
          </Link>
        ) : (
          <ActionButton
            label={command.label}
            path={command.path}
            body={{ environmentId: environment.id, answers: [] }}
            primary={!rejected}
            {...(command.joins
              ? { next: environmentWelcomeHref(environment.id) }
              : {})}
          />
        ))}
      <StepAction environment={environment} step={step} />
    </>
  );
}

function StepAction({
  environment,
  step,
}: {
  environment: Environment;
  step: MembershipStep;
}) {
  const body = { environmentId: environment.id };

  switch (step.kind) {
    case "accept_invitation":
      return (
        <ActionButton label="Avslå invitasjonen" path={leavePath} body={body} />
      );
    case "awaiting_review":
    case "information_requested":
    case "confirm":
      return environment.membership?.state === "pending" ? (
        <ConfirmAction
          label="Trekk søknaden"
          title="Trekke søknaden?"
          consequences={{
            gone: ["Administratorene ser ikke lenger søknaden."],
            stays: [
              environment.type === "open"
                ? "Du kan bli med senere."
                : "Du kan søke på nytt senere.",
            ],
          }}
          confirmLabel="Trekk søknaden"
          path={leavePath}
          body={body}
          danger
        />
      ) : null;
    default:
      return null;
  }
}

/**
 * A proposed weaker type (PS-ENV-008, UX-PRIV-008): what it means, how it
 * is decided, the member's own answer, and the choice to accept, say no or
 * leave. Only the member's own answer is ever shown.
 */
function TypeChange({ environment }: { environment: Environment }) {
  const proposal = environment.typeChange;

  if (!proposal || environment.membership?.state !== "active") return null;

  const { heading, lines, accept } = describeTypeChange(proposal);
  const respond = (support: boolean) => ({
    environmentId: environment.id,
    proposalId: proposal.id,
    support,
  });

  return (
    <StatusCard
      id="typeendring"
      heading={heading}
      status={heading}
      tone="warning"
      who={typeChangeAnswer(proposal)}
      actions={
        <>
          {proposal.yourResponse !== true && (
            <ActionButton
              label={accept}
              path="/api/environments/type/respond"
              body={respond(true)}
              primary
            />
          )}
          {proposal.yourResponse !== false && (
            <ActionButton
              label="Ikke godta"
              path="/api/environments/type/respond"
              body={respond(false)}
            />
          )}
        </>
      }
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </StatusCard>
  );
}

/** An invitation to administer or to take over ownership (PS-ENV-003). */
function RoleInvitations({ environment }: { environment: Environment }) {
  if (environment.roleInvitations.length === 0) return null;

  return (
    <section aria-labelledby="rolleinvitasjoner">
      <h2 id="rolleinvitasjoner">Invitasjon til en rolle</h2>
      <ul className="entries">
        {environment.roleInvitations.map((invitation) => {
          const body = {
            environmentId: environment.id,
            invitationId: invitation.id,
          };
          const role = environmentRoleNames[invitation.role].toLowerCase();

          return (
            <li key={invitation.id} className="entry">
              <span id={`rolle-${invitation.id}`}>
                {invitation.role === "owner"
                  ? "Du er tilbudt å overta eierskapet til miljøet."
                  : "Du er invitert til å bli administrator i miljøet."}
              </span>
              <div
                className="actions"
                role="group"
                aria-labelledby={`rolle-${invitation.id}`}
              >
                <ActionButton
                  label={`Bli ${role}`}
                  path="/api/environments/roles/accept"
                  body={body}
                  primary
                />
                <ActionButton
                  label="Avslå"
                  path="/api/environments/roles/decline"
                  body={body}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The user's own membership, on «Om miljøet» (Tomat kjerneflyt 3): writing
 * to the administrators as a group (PS-COM-010), and leaving with what
 * goes and what stays (UX-INT-007). Administrators hand over their role
 * first (PS-ENV-003), and are told so.
 */
export function YourMembership({ environment }: { environment: Environment }) {
  const state = environment.membership?.state;

  if (state !== "active" && state !== "passive") return null;

  const administrator = environment.roles.includes("administrator");

  return (
    <section aria-labelledby="medlemskapet">
      <h2 id="medlemskapet">Medlemskapet ditt</h2>
      {state === "active" && !administrator && (
        <div className="field">
          <Link
            className="button button-secondary"
            href={newCaseHref({
              kind: "contact",
              environmentId: environment.id,
            })}
            aria-describedby="kontakt-hjelp"
          >
            Kontakt administratorene
          </Link>
          <p id="kontakt-hjelp" className="help">
            Går til administratorene som gruppe, ikke til én person. Du får et
            varsel når de svarer.
          </p>
        </div>
      )}
      {environment.roles.length > 0 ? (
        <p className="help">
          Du må gi fra deg rollen som{" "}
          {environment.roles.includes("owner")
            ? "eier og administrator"
            : "administrator"}{" "}
          før du kan forlate miljøet.
        </p>
      ) : (
        <div className="actions">
          <ConfirmAction
            label="Forlat miljøet"
            title={`Forlate ${environment.name}?`}
            consequences={leavingConsequences(environment)}
            confirmLabel={`Forlat ${environment.name}`}
            path={leavePath}
            body={{ environmentId: environment.id }}
            danger
            next={environmentHref(environment.id)}
          />
        </div>
      )}
      {state === "passive" && (
        <p className="help">
          Som passivt medlem er du fortsatt med i lån som allerede er avtalt.
        </p>
      )}
    </section>
  );
}

/**
 * PS-ENV-019: what the administrators asked, verbatim and from them as a
 * group, while the application waits on the applicant.
 */
export function AskedQuestion({ environment }: { environment: Environment }) {
  const question = environment.membership?.informationQuestion;

  return question ? (
    <InformationQuestion
      from={`Administratorene i ${environment.name}`}
      question={question}
    />
  ) : null;
}

import type { Environment } from "@lanbort/contracts";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { ConfirmAction } from "@/components/confirm-action";
import { RequirementAnswers } from "@/components/requirement-answers";
import { StatusCard } from "@/components/status-card";
import type { Tone } from "@/components/tag";
import { newCaseHref } from "@/navigation/cases";
import { environmentAdminHref, environmentHref } from "@/navigation/routes";
import { formatTime } from "@/presentation/dates";
import {
  answerCommand,
  describeMembership,
  describeTypeChange,
  environmentRoleNames,
  leavingConsequences,
  membershipLabel,
  type MembershipStep,
  typeChangeAnswer,
} from "@/presentation/environments";

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
 * joining, applying or accepting an invitation with the requirements that
 * apply now (PS-ENV-004–006), following an application, meeting new
 * requirements, answering a proposed weaker type (UX-PRIV-008), taking on
 * a role, and for administrators the way to their tasks. Contact and
 * leaving are on «Om miljøet» (`YourMembership`).
 */
export function Membership({
  environment,
  step,
}: {
  environment: Environment;
  step: MembershipStep;
}) {
  const { membership, continuity } = environment;
  const command = answerCommand(environment, step);
  return (
    <>
      <StatusCard
        label={membershipLabel(environment, step)}
        status={describeMembership(environment, step)}
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
      />
      {command && (
        <section aria-labelledby="medlemskap">
          <h2 id="medlemskap">{command.heading}</h2>
          <RequirementAnswers
            environmentId={environment.id}
            requirements={environment.requirements}
            given={membership?.answers ?? []}
            path={command.path}
            submitLabel={command.label}
          />
        </section>
      )}
      <TypeChange environment={environment} />
      <RoleInvitations environment={environment} />
    </>
  );
}

/**
 * Steps taken directly on the card: withdrawing or declining, and for an
 * administrator the way to administration whatever their own next step is
 * (new requirements do not take the role away).
 */
function StepActions({
  environment,
  step,
}: {
  environment: Environment;
  step: MembershipStep;
}) {
  return (
    <>
      <StepAction environment={environment} step={step} />
      {environment.roles.includes("administrator") && (
        // WP-85's page, built alongside this one: not fetched ahead.
        <Link
          className="button"
          href={environmentAdminHref(environment.id)}
          prefetch={false}
        >
          Administrer miljøet
        </Link>
      )}
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
        <ActionButton label="Trekk søknaden" path={leavePath} body={body} />
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

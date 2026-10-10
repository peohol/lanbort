import type { Environment } from "@lanbort/contracts";
import { ActionButton } from "@/components/action-button";
import { ConfirmAction } from "@/components/confirm-action";
import { StatusCard } from "@/components/status-card";
import { formatTime } from "@/presentation/dates";
import {
  environmentTypeExplanations,
  environmentTypeNames,
} from "@/presentation/environments";
import {
  environmentTypeAdjectives,
  proposalWaitsFor,
  typeChoices,
} from "@/presentation/environment-admin";

/**
 * The environment's type (PS-ENV-007–008, UX-PRIV-008): what it means now,
 * a proposal while the members decide, and the changes possible from here.
 * A stricter type applies at once; a weaker one is proposed to the members.
 * Only a stricter type is possible while the environment winds down.
 */
export function EnvironmentTypeChoices({
  environment,
}: {
  environment: Environment;
}) {
  const environmentId = environment.id;
  const proposal = environment.typeChange;
  const choices = typeChoices(environment.type).filter(
    (choice) => environment.state === "active" || choice.kind === "stricter",
  );

  return (
    <>
      <p>
        <strong>{environmentTypeNames[environment.type]}.</strong>{" "}
        {environmentTypeExplanations[environment.type]}
      </p>
      {proposal && (
        <StatusCard
          id="typeforslag"
          heading="Forslag om ny miljøtype"
          status={`Foreslått: ${environmentTypeNames[proposal.toType].toLocaleLowerCase("nb")}`}
          tone="waiting"
          when={`Medlemmene svarer innen ${formatTime(proposal.deadline)}`}
          who={proposalWaitsFor[proposal.process]}
          actions={
            <>
              {proposal.yourResponse !== true && (
                <ActionButton
                  label="Jeg godtar"
                  path="/api/environments/type/respond"
                  body={{
                    environmentId,
                    proposalId: proposal.id,
                    support: true,
                  }}
                />
              )}
              {proposal.yourResponse !== false && (
                <ActionButton
                  label="Jeg godtar ikke"
                  path="/api/environments/type/respond"
                  body={{
                    environmentId,
                    proposalId: proposal.id,
                    support: false,
                  }}
                />
              )}
              <ConfirmAction
                label="Trekk forslaget"
                title="Trekk forslaget om ny miljøtype"
                consequences={{
                  stays: [
                    `Miljøet forblir ${environmentTypeAdjectives[environment.type]}.`,
                  ],
                  affects: [
                    "Svarene medlemmene har gitt, gjelder ikke lenger.",
                  ],
                }}
                confirmLabel="Trekk forslaget"
                path="/api/environments/type/withdraw"
                body={{ environmentId, proposalId: proposal.id }}
              />
            </>
          }
        >
          <p>
            {proposal.yourResponse === null
              ? "Du har ikke svart selv ennå."
              : proposal.yourResponse
                ? "Du har godtatt."
                : "Du har sagt at du ikke godtar."}
          </p>
        </StatusCard>
      )}
      {!proposal && choices.length > 0 && (
        <section aria-labelledby="endre-miljotype">
          <h2 id="endre-miljotype">Endre miljøtype</h2>
          <div className="actions">
            {choices.map((choice) => {
              const label = environmentTypeAdjectives[choice.type];
              const proposed = choice.kind !== "stricter";

              return (
                <ConfirmAction
                  key={choice.type}
                  label={
                    proposed
                      ? `Foreslå ${label} miljø`
                      : `Gjør miljøet ${label}`
                  }
                  title={
                    proposed
                      ? `Foreslå at miljøet blir ${label}`
                      : `Gjør miljøet ${label}`
                  }
                  consequences={choice.consequences}
                  confirmLabel={
                    proposed
                      ? `Send forslaget til medlemmene`
                      : `Gjør miljøet ${label} nå`
                  }
                  path="/api/environments/type"
                  body={{
                    environmentId,
                    expectedType: environment.type,
                    type: choice.type,
                  }}
                />
              );
            })}
          </div>
          {environment.type === "hidden" && (
            <p className="help">
              Et skjult miljø blir åpent i to steg: først lukket, så åpent.
            </p>
          )}
        </section>
      )}
    </>
  );
}

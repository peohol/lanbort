import {
  type PilotCampaign,
  type PilotGate,
  type PilotReadiness,
  pilotPhases,
} from "@lanbort/contracts";
import { ActionButton } from "@/components/action-button";
import { pilotPhaseBlockers } from "@/presentation/pilot";
import styles from "./pilot.module.css";

/**
 * «Gå videre til fase N» for the open campaign's current phase: a button
 * only when nothing stops the phase from ending, and otherwise what does.
 * The server refuses it on the same grounds, whatever the page shows.
 */
export function ContinuePhase({
  campaign,
  gate,
  readiness,
}: {
  campaign: PilotCampaign;
  gate: PilotGate;
  readiness: PilotReadiness | null;
}) {
  const next = campaign.phase + 1;

  if (campaign.closedAt !== null || next >= pilotPhases.length) return null;

  const blockers = pilotPhaseBlockers(gate, readiness);
  const label = `Gå videre til fase ${next}`;

  if (blockers.length === 0) {
    return (
      <div className="actions">
        <ActionButton
          label={label}
          path={`/api/pilot/campaigns/${campaign.id}/phase`}
          body={{ phase: next }}
          primary
        />
      </div>
    );
  }

  return (
    <>
      <div className="actions">
        <button type="button" disabled>
          {label}
        </button>
      </div>
      <div className={styles.meta}>
        <p>Dette må være på plass først:</p>
        <ul>
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

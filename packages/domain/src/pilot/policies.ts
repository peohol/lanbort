import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireActiveAccount } from "../authorization/rules";

/**
 * Where the signed-in user stands in the closed pilot (pilot-ui.md
 * «Tilgang»): a lead, a participant, both or neither, read from the
 * journal's own tables on every request. The pilot role is its own: no
 * platform or environment role gives it, and it gives nothing outside the
 * pilot.
 */
export interface PilotViewer {
  readonly leadId: string | null;
  readonly participantId: string | null;
}

/** Every pilot operation decides on the viewer, and some on more. */
export interface PilotScope {
  readonly viewer: PilotViewer;
}

/**
 * Anyone outside the pilot gets the same answer as for something that does
 * not exist, so the pilot surface tells nobody else it is there.
 */
const isLead: ResourceRule<PilotScope, void> = ({ resource }) =>
  resource.viewer.leadId ? allow : deny("not_found");

const isParticipant: ResourceRule<PilotScope, void> = ({ resource }) =>
  resource.viewer.participantId ? allow : deny("not_found");

const isMember: ResourceRule<PilotScope, void> = ({ resource }) =>
  resource.viewer.leadId || resource.viewer.participantId
    ? allow
    : deny("not_found");

/** A participant's task, as their own reports and reads name it. */
export interface PilotTaskScope extends PilotScope {
  readonly participantId: string;
}

/** The task is the participant's own; anyone else's looks like none. */
const ownTask: ResourceRule<PilotTaskScope, void> = ({ resource }) =>
  resource.viewer.participantId === resource.participantId
    ? allow
    : deny("not_found");

/** The lead's journal: reading it and every change to it. */
function leadPolicy(action: string) {
  return definePolicy<PilotScope, void>({
    action,
    actor: [requireActiveAccount],
    resource: [isLead],
  });
}

export const readPilotRolePolicy = definePolicy<PilotScope, void>({
  action: "pilot.read_role",
  actor: [requireActiveAccount],
  resource: [isMember],
});

export const readPilotWorkspacePolicy = leadPolicy("pilot.read_workspace");
export const readPilotTestPolicy = leadPolicy("pilot.read_test");
export const exportPilotPolicy = leadPolicy("pilot.export");
export const startPilotCampaignPolicy = leadPolicy("pilot.start_campaign");
export const changePilotPhasePolicy = leadPolicy("pilot.change_phase");
export const checkPilotReadinessPolicy = leadPolicy("pilot.check_readiness");
export const confirmPilotRequirementPolicy = leadPolicy(
  "pilot.confirm_requirement",
);
export const withdrawPilotConfirmationPolicy = leadPolicy(
  "pilot.withdraw_confirmation",
);
export const closePilotCampaignPolicy = leadPolicy("pilot.close_campaign");
export const recordPilotRunPolicy = leadPolicy("pilot.record_run");
export const requestPilotRetestPolicy = leadPolicy("pilot.request_retest");
export const reportPilotDefectPolicy = leadPolicy("pilot.report_defect");
export const changePilotDefectPolicy = leadPolicy("pilot.change_defect");
export const addPilotParticipantPolicy = leadPolicy("pilot.add_participant");
export const removePilotParticipantPolicy = leadPolicy(
  "pilot.remove_participant",
);
export const assignPilotTaskPolicy = leadPolicy("pilot.assign_task");
export const withdrawPilotTaskPolicy = leadPolicy("pilot.withdraw_task");

export const readPilotTasksPolicy = definePolicy<PilotScope, void>({
  action: "pilot.read_tasks",
  actor: [requireActiveAccount],
  resource: [isParticipant],
});

export const reportPilotTaskPolicy = definePolicy<PilotTaskScope, void>({
  action: "pilot.report_task",
  actor: [requireActiveAccount],
  resource: [isParticipant, ownTask],
});

export const pilotPolicies = [
  readPilotRolePolicy,
  readPilotWorkspacePolicy,
  readPilotTestPolicy,
  exportPilotPolicy,
  startPilotCampaignPolicy,
  changePilotPhasePolicy,
  checkPilotReadinessPolicy,
  confirmPilotRequirementPolicy,
  withdrawPilotConfirmationPolicy,
  closePilotCampaignPolicy,
  recordPilotRunPolicy,
  requestPilotRetestPolicy,
  reportPilotDefectPolicy,
  changePilotDefectPolicy,
  addPilotParticipantPolicy,
  removePilotParticipantPolicy,
  assignPilotTaskPolicy,
  withdrawPilotTaskPolicy,
  readPilotTasksPolicy,
  reportPilotTaskPolicy,
];

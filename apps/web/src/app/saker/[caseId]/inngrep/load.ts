import { caseKinds, listCaseInterventions, readCase } from "@lanbort/domain";
import { notFound, redirect } from "next/navigation";
import { caseHref } from "@/navigation/routes";
import { subjectOf } from "@/presentation/interventions";
import { pageQuery, requirePageAccount } from "@/server/session";
import { requireStewardship, stewardPageQuery } from "@/server/stewardship";

/**
 * The case an intervention is taken from (PS-ADM-015), as its steps need
 * it: a platform case about an account, which the steward holds while it
 * is open. Anything else leads back to the case, which says why; anyone
 * else finds nothing. Each command decides again.
 */
export async function loadInterventionCase(caseId: string) {
  const account = await requirePageAccount();
  const steward = await requireStewardship();
  const c = await stewardPageQuery(readCase, { caseId });

  if (c === "confirm") redirect(caseHref(caseId));
  if (c.viewer !== "handler" || !caseKinds[c.kind].platform) notFound();

  const interventions =
    c.kind === "unavailability_report"
      ? null
      : await pageQuery(listCaseInterventions, { caseId });

  if (
    !interventions?.account ||
    c.status !== "open" ||
    c.assigneeUserId !== account.userId
  ) {
    redirect(caseHref(caseId));
  }

  return {
    c,
    steward,
    subject: subjectOf(c.people, interventions.account),
  };
}

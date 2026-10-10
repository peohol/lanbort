import { liftingMeasureKinds } from "@lanbort/contracts";
import { readMeasureNotice } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { notificationsHref } from "@/navigation/areas";
import { newCaseHref } from "@/navigation/cases";
import { loanHref, objectHref } from "@/navigation/routes";
import {
  measureNoticeEffect,
  measureNoticeHeading,
  measureNoticeLabel,
  measureNoticeSubject,
} from "@/presentation/measure-notice";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";
import styles from "../../cases.module.css";
import { environmentName } from "../../environment-name";

export const metadata: Metadata = { title: "Tiltak – Lånbort" };

/**
 * The notice to whoever a measure hits (PS-TRUST-018, Tomat kjerneflyt 8):
 * what was done to their thing, review, response or membership
 * (PS-ENV-021), where it applies, the reason, and the way to ask for a new
 * assessment: the environment's administrators for a local measure. Lånbort
 * cannot take requests in the app yet (UX-EXC-011), and the page says so.
 * When a block is lifted, the owners are told the thing can be lent again,
 * with nothing to ask about. Nothing on it tells that there was a report or
 * who sent it.
 */
export default async function MeasureNoticePage({
  params,
}: {
  params: Promise<{ measureId: string }>;
}) {
  await requirePageAccount();
  const { measureId } = await params;
  const notice = await pageQueryOrNotFound(readMeasureNotice, { measureId });
  // A former member may no longer see the environment, but knew its name.
  const environment =
    notice.environmentName ?? (await environmentName(notice.environmentId));
  const subject = measureNoticeSubject(notice, environment);
  const lifted = liftingMeasureKinds.has(notice.kind);
  const reassessment = !lifted && notice.scope;

  return (
    <main>
      <PageHeader
        title={subject.title}
        kind={subject.kind}
        back={{ href: notificationsHref, label: "Varsler" }}
      />
      <StatusCard
        label={measureNoticeLabel(notice, environment)}
        status={measureNoticeHeading(notice, environment)}
        tone={lifted ? "positive" : "danger"}
        actions={
          reassessment === "environment" && notice.environmentId ? (
            <Link
              className="button"
              href={newCaseHref({
                kind: "contact",
                environmentId: notice.environmentId,
              })}
            >
              Be om ny vurdering
            </Link>
          ) : undefined
        }
      >
        <p>{measureNoticeEffect(notice, environment)}</p>
        <p>
          <strong>Begrunnelse:</strong> {notice.reason}
        </p>
        {reassessment === "platform" && (
          <p className={styles.unavailable}>
            <strong>Be om ny vurdering</strong>
            Ikke tilgjengelig ennå. Lånbort kan ikke ta imot henvendelser i
            appen ennå.
          </p>
        )}
      </StatusCard>
      {notice.objectId && notice.objectTitle && (
        <p className="link-row">
          <Link href={objectHref(notice.objectId)}>Gå til tingen</Link>
        </p>
      )}
      {notice.loanId && (
        <p className="link-row">
          <Link href={loanHref(notice.loanId)}>Gå til lånet</Link>
        </p>
      )}
    </main>
  );
}

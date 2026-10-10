import type { CoOwnerLoanView } from "@lanbort/contracts";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { loansHref } from "@/navigation/areas";
import { calendarDay, formatPeriod } from "@/presentation/dates";
import {
  coOwnerLoanTitle,
  coOwnerProgress,
  coOwnerSteps,
  describeCoOwnerLoan,
} from "@/presentation/loan-co-owner";
import { personName } from "@/presentation/loan-status";
import { ownImageHref } from "@/presentation/object-images";
import styles from "../_parts/loan.module.css";
import { Progress } from "../_parts/progress";
import { Steps } from "../_parts/steps";
import { ThingPicture } from "../_parts/thing-picture";

/**
 * A loan for a co-owner who is not its party (UX-PRIV-013, KF7 screen 13):
 * the status, the period, the terms, the borrower and the responsible
 * lender, and only the co-owner's own steps. Never the timeline, the
 * request's message, the chat, the parties' statements or the reviews.
 */
export function CoOwnerLoan({ view }: { view: CoOwnerLoanView }) {
  const situation = describeCoOwnerLoan(view, calendarDay());
  const steps = coOwnerSteps(view);

  return (
    <main>
      <PageHeader
        kind="Lån · Du er medeier"
        picture={
          <ThingPicture
            images={view.images}
            href={(imageId) => ownImageHref(view.objectId, imageId)}
          />
        }
        title={coOwnerLoanTitle(view)}
        back={{ href: loansHref, label: "Lån" }}
      />
      <Progress progress={coOwnerProgress(view)} />
      <div className={styles.column}>
        <StatusCard
          status={situation.headline}
          tone={situation.tone}
          label={situation.label}
          actions={
            steps.length > 0 && (
              <div className={styles.answers}>
                <Steps steps={steps} />
              </div>
            )
          }
        >
          {situation.body.map((text) => (
            <p key={text} className={styles.body}>
              {text}
            </p>
          ))}
        </StatusCard>
        <section className={styles.flat} aria-label="Avtalen">
          <dl className="facts">
            <dt>Periode</dt>
            <dd>{formatPeriod(view.period)}</dd>
            <dt>Vilkår</dt>
            <dd>{view.loanTerms ?? "Ingen egne vilkår"}</dd>
            <dt>Låntaker</dt>
            <dd>{personName(view.parties.borrower)}</dd>
            <dt>Ansvarlig utlåner</dt>
            <dd>{personName(view.parties.lender)}</dd>
          </dl>
        </section>
      </div>
    </main>
  );
}

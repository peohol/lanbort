import type {
  Environment,
  LoanRequestPreview,
  ObjectCategory,
  OwnAccount,
} from "@lanbort/contracts";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { ContextTag } from "@/components/tag";
import { findHref } from "@/navigation/areas";
import {
  categoryLabel,
  describeAvailability,
  formatInterval,
} from "@/presentation/objects";

/**
 * A thing as someone who may borrow it sees it (WP-83 builds on it):
 * through one environment, or directly between friends, said as its
 * context (UX-PRIV-003). Owners are not named, and what blocks it is not
 * said (UX-PRIV-004).
 */
export function ViewerView({
  object,
  environment,
  categories,
  today,
}: {
  account: OwnAccount;
  object: LoanRequestPreview;
  environment: Environment | null;
  categories: readonly ObjectCategory[];
  today: string;
}) {
  return (
    <main>
      <PageHeader
        title={object.title}
        back={{ href: findHref, label: "Finn" }}
        context={
          <>
            <ContextTag label="Sett gjennom">
              {environment ? environment.name : "Venner"}
            </ContextTag>
            <ContextTag label="Kategori">
              {categoryLabel(categories, object.categoryId)}
            </ContextTag>
          </>
        }
      />
      <StatusCard
        status={describeAvailability(object, today)}
        tone={object.availableForNewLoans ? "positive" : "neutral"}
      />
      <section aria-labelledby="om-tingen">
        <h2 id="om-tingen">Om tingen</h2>
        <dl className="facts">
          <dt>Beskrivelse</dt>
          <dd className="message-text">{object.description}</dd>
          <dt>Vilkår</dt>
          <dd className="message-text">
            {object.loanTerms ?? "Ingen egne vilkår"}
          </dd>
          <dt>Ledig</dt>
          <dd>
            {object.effectiveAvailability.length === 0
              ? "Ikke ledig for nye lån nå"
              : object.effectiveAvailability.map(formatInterval).join(", ")}
          </dd>
        </dl>
      </section>
    </main>
  );
}

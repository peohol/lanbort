import type { ObjectCategory, OwnAccount, OwnObject } from "@lanbort/contracts";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { ContextTag, Tag } from "@/components/tag";
import { thingsHref } from "@/navigation/areas";
import {
  categoryLabel,
  describeAvailability,
  formatInterval,
} from "@/presentation/objects";

/**
 * The owners' view of a thing (WP-82 builds on it): whether it can be lent
 * out now, and what it is. Every owner sees the same (PS-OBJ-007).
 */
export function OwnerView({
  object,
  categories,
  today,
}: {
  account: OwnAccount;
  object: OwnObject;
  categories: readonly ObjectCategory[];
  today: string;
}) {
  const archived = object.status === "archived";

  return (
    <main>
      <PageHeader
        title={object.title}
        back={{ href: thingsHref, label: "Mine ting" }}
        context={
          <>
            <ContextTag label="Kategori">
              {categoryLabel(categories, object.categoryId)}
            </ContextTag>
            {object.owners.length > 1 && (
              <Tag>Dere er {object.owners.length} eiere</Tag>
            )}
          </>
        }
      />
      <StatusCard
        status={archived ? "Arkivert" : describeAvailability(object, today)}
        tone={!archived && object.availableForNewLoans ? "positive" : "neutral"}
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
          <dt>Tilgjengelighet</dt>
          <dd>
            {object.availability.length === 0
              ? "Ikke satt"
              : object.availability.map(formatInterval).join(", ")}
          </dd>
        </dl>
      </section>
    </main>
  );
}

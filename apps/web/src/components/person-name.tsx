import Link from "next/link";
import { personHref } from "@/navigation/routes";
import { personName } from "@/presentation/people";

/**
 * A person by name (WP-86), linked to their page only while the reader may
 * open it (`profileId`, UX-PRIV-007), and a deleted account as a former
 * user without a link (UX-PRIV-010).
 */
export function PersonName({
  person,
}: {
  person: {
    readonly realName: string | null;
    readonly profileId: string | null;
  };
}) {
  const name = personName(person);

  return person.profileId && person.realName ? (
    <Link href={personHref(person.profileId)}>{name}</Link>
  ) : (
    name
  );
}

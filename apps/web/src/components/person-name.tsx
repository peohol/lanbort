import Link from "next/link";
import { personHref, type PersonRole } from "@/navigation/routes";
import { personName } from "@/presentation/people";
import { ProfilePicture } from "./profile-picture";

/**
 * A person by name (WP-86), with their picture where the reader may see it
 * (PS-USR-002), linked to their page only while the reader may open it
 * (`profileId`, UX-PRIV-007), and a deleted account as a former user
 * without a link (UX-PRIV-010). `role` is the person's role where they are
 * named, which their page shows first (UX-PRIV-012). Inside something that
 * is itself one large target, such as a thing's card, the name is `plain`:
 * the picture, or initials, and the name, without a link of its own.
 */
export function PersonName({
  person,
  role,
  plain = false,
}: {
  person: {
    readonly realName: string | null;
    readonly profileId: string | null;
    readonly pictureId?: string | null;
  };
  role?: PersonRole;
  plain?: boolean;
}) {
  const name = personName(person);

  // A picture is only ever shown where the reader may open the page.
  if (!person.profileId || !person.realName) return name;

  // In a card, every name has its picture or initials, so names line up.
  const picture = (
    <ProfilePicture
      pictureId={person.pictureId ?? null}
      name={name}
      initials={plain}
    />
  );

  return plain ? (
    <span className="person-name">
      {picture}
      {name}
    </span>
  ) : (
    <Link href={personHref(person.profileId, role)} className="person-name">
      {picture}
      {name}
    </Link>
  );
}

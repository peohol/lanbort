import Link from "next/link";
import { personHref } from "@/navigation/routes";
import { personName } from "@/presentation/people";
import { ProfilePicture } from "./profile-picture";

/**
 * A person by name (WP-86), with their picture where the reader may see it
 * (PS-USR-002), linked to their page only while the reader may open it
 * (`profileId`, UX-PRIV-007), and a deleted account as a former user
 * without a link (UX-PRIV-010).
 */
export function PersonName({
  person,
}: {
  person: {
    readonly realName: string | null;
    readonly profileId: string | null;
    readonly pictureId?: string | null;
  };
}) {
  const name = personName(person);

  // A picture is only ever shown with a page to link to.
  return person.profileId && person.realName ? (
    <Link href={personHref(person.profileId)} className="person-name">
      <ProfilePicture pictureId={person.pictureId ?? null} name={name} />
      {name}
    </Link>
  ) : (
    name
  );
}

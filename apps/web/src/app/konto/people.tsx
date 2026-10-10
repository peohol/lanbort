import type { SocialContact } from "@lanbort/contracts";
import type { ReactNode } from "react";
import { MenuList, MenuRow } from "@/components/menu-list";
import { ProfilePicture } from "@/components/profile-picture";
import { personHref } from "@/navigation/routes";
import { personName } from "@/presentation/people";

/**
 * People in the account's lists (KF6 screens 19–20): a row per person with
 * their picture, a short line and the way to their page, and what can be
 * done about them beside it or under it. A person without a page is shown
 * without a link or picture (UX-PRIV-007, UX-PRIV-010).
 */
export function People({
  heading,
  people,
  detail,
  actions,
  actionsBelow,
}: {
  heading?: string;
  people: readonly SocialContact[];
  /** The short line under each name, such as when it began. */
  detail?: ((person: SocialContact) => string) | undefined;
  /** What can be done about each person, if anything. */
  actions?: (person: SocialContact) => ReactNode;
  actionsBelow?: boolean | undefined;
}) {
  if (people.length === 0) return null;

  const list = (
    <MenuList>
      {people.map((person) => {
        const name = personName(person);
        const page = person.profileId && person.realName;

        return (
          <MenuRow
            key={person.userId}
            href={page ? personHref(person.userId) : undefined}
            lead={
              <ProfilePicture
                pictureId={page ? person.pictureId : null}
                name={person.realName}
                size="medium"
                initials
              />
            }
            label={name}
            detail={detail?.(person)}
            actions={actions?.(person)}
            actionsBelow={actionsBelow}
          />
        );
      })}
    </MenuList>
  );

  return heading ? (
    <section>
      <h2>
        {heading} · {people.length}
      </h2>
      {list}
    </section>
  ) : (
    list
  );
}

/** What the person is asked about: the same for every relation step. */
export const target = (person: SocialContact) => ({ userId: person.userId });

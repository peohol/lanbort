import type { HomeItem, HomeItemKind } from "@lanbort/contracts";
import { type IconName } from "@/components/icon";
import { MenuList, MenuRow } from "@/components/menu-list";
import { environmentAdminHref } from "@/navigation/routes";
import { administrationHref } from "@/presentation/environment-admin";
import { homeItemHref } from "@/presentation/home-items";
import { administrationText } from "@/presentation/home-tasks";

const icons: Partial<Record<HomeItemKind, IconName>> = {
  "environment.review_memberships": "people",
  "environment.review_publications": "things",
  "environment.handle_cases": "conversations",
  "environment.mediate_loans": "loans",
  "environment.review_reports": "flag",
};

/**
 * «Som administrator» on the environment (Tomat kjerneflyt 3, UX-JRN-012):
 * the same counted tasks as on Home, each leading to where it is done, and
 * the way to the administration. Only the environment's administrators get
 * it; to members it does not exist.
 */
export function AdministrationTasks({
  environmentId,
  tasks,
}: {
  environmentId: string;
  tasks: readonly HomeItem[];
}) {
  return (
    <section aria-labelledby="som-administrator">
      <h2 id="som-administrator">Som administrator</h2>
      <MenuList label="som-administrator">
        {tasks.map((task) => (
          <MenuRow
            key={task.kind}
            href={
              administrationHref(task) ??
              homeItemHref(task) ??
              environmentAdminHref(environmentId)
            }
            icon={icons[task.kind] ?? "environment"}
            label={administrationText(task)}
          />
        ))}
        <MenuRow
          href={environmentAdminHref(environmentId)}
          icon="shield"
          label="Administrer miljøet"
        />
      </MenuList>
    </section>
  );
}

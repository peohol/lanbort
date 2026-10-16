import { listOwnEnvironments } from "@lanbort/domain";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { homeHref } from "@/navigation/areas";
import { environmentHref } from "@/navigation/routes";
import { formatDate } from "@/presentation/dates";
import { roleName } from "@/presentation/environments";
import { pageQuery, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Avviklede miljøer – Lånbort" };

/**
 * The archive (PS-ENV-012, UX-IA-023): the environments the user was a
 * member of when they were wound down, the only way back to them. Nothing
 * else in the app shows them any more.
 */
export default async function EnvironmentArchivePage() {
  await requirePageAccount();
  const environments =
    (await pageQuery(listOwnEnvironments, { include: "archived" })) ?? [];

  return (
    <main>
      <PageHeader
        title="Avviklede miljøer"
        back={{ href: homeHref, label: "Hjem" }}
      >
        Miljøer du var med i da de ble avviklet. De er ikke i bruk lenger, og
        bare de som var medlemmer, finner dem her.
      </PageHeader>
      {environments.length === 0 ? (
        <EmptyState>Du har ingen avviklede miljøer.</EmptyState>
      ) : (
        <MenuList>
          {environments.map((environment) => {
            const role = roleName(environment.roles);

            return (
              <MenuRow
                key={environment.id}
                href={environmentHref(environment.id)}
                icon="environment"
                label={environment.name}
                detail={[
                  environment.woundDownAt &&
                    `Avviklet ${formatDate(environment.woundDownAt)}`,
                  role && `Du var ${role.toLowerCase()}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            );
          })}
        </MenuList>
      )}
    </main>
  );
}

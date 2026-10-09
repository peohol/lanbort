import {
  calendarDate,
  getEnvironment,
  listObjectCategories,
  listOwnEnvironments,
  takesNewActivity,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { thingsHref } from "@/navigation/areas";
import { environmentHref, environmentParam } from "@/navigation/routes";
import { pageQuery, requirePageAccount } from "@/server/session";
import { ObjectForm, type PublishTarget } from "../object-form";

export const metadata: Metadata = { title: "Registrer en ting – Lånbort" };

/**
 * Registering a thing (UX-JRN-003), from Mine ting or from an environment
 * (`?miljo=`), which is then chosen already. The thing is the user's own
 * either way; where it is shown is a choice beside it.
 */
export default async function NewObjectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requirePageAccount();
  const back = { href: thingsHref, label: "Mine ting" };

  if (!takesNewActivity(account.status)) {
    return (
      <main>
        <PageHeader title="Registrer en ting" back={back} task />
        <EmptyState action={<Link href={thingsHref}>Til Mine ting</Link>}>
          Du kan ikke registrere nye ting mens kontoen din ikke er aktiv.
        </EmptyState>
      </main>
    );
  }

  const [query, categories, environments] = await Promise.all([
    searchParams,
    pageQuery(listObjectCategories, {}),
    pageQuery(listOwnEnvironments, {}),
  ]);
  const preselected = query[environmentParam];
  // Only an active member may publish (PS-OBJ-006); each says whether its
  // administrators approve new things first (PS-ENV-011).
  const targets = (
    await Promise.all(
      (environments ?? [])
        .filter(({ membershipState }) => membershipState === "active")
        .map(({ id }) => pageQuery(getEnvironment, { environmentId: id })),
    )
  ).flatMap((environment): PublishTarget[] =>
    environment
      ? [
          {
            id: environment.id,
            name: environment.name,
            requiresApproval: environment.requiresObjectApproval,
          },
        ]
      : [],
  );
  const started = targets.find(({ id }) => id === preselected);

  return (
    <main>
      <ObjectForm
        mode="create"
        categories={categories?.categories ?? []}
        today={calendarDate(new Date())}
        from={
          started
            ? {
                href: environmentHref(started.id),
                label: started.name,
                home: "home",
              }
            : back
        }
        environments={targets}
        preselected={started?.id}
      />
    </main>
  );
}

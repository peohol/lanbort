import {
  listEnvironmentPublications,
  listMemberships,
  listObjectCategories,
} from "@lanbort/domain";
import { pageQuery, pageQueryOrNotFound } from "@/server/session";
import {
  type AdministrationParams,
  AdministrationHeader,
  administrationMetadata,
  loadAdministrationTask,
} from "../administration";
import { olderParam, Publications, reviewedStatuses } from "../publications";

export const metadata = administrationMetadata("things");

const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** The things in the environment and their approval (PS-ENV-011). */
export default async function ThingsPage({
  params,
  searchParams,
}: {
  params: AdministrationParams;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ environment }, query] = await Promise.all([
    loadAdministrationTask(params),
    searchParams,
  ]);
  const environmentId = environment.id;
  const [memberships, categories, ...pages] = await Promise.all([
    pageQueryOrNotFound(listMemberships, { environmentId }),
    pageQuery(listObjectCategories, {}),
    ...reviewedStatuses.map((status) =>
      pageQueryOrNotFound(listEnvironmentPublications, {
        environmentId,
        status,
        cursor: single(query[olderParam(status)]),
      }),
    ),
  ]);

  return (
    <main>
      <AdministrationHeader environment={environment} page="things" />
      <Publications
        environment={environment}
        pages={pages}
        members={memberships.memberships}
        categories={categories?.categories ?? []}
        query={query}
      />
    </main>
  );
}

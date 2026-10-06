import {
  calendarDate,
  getEnvironment,
  getObject,
  isDomainError,
  listObjectCategories,
  previewLoanRequest,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { environmentParam } from "@/navigation/routes";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { OwnerView } from "./owner-view";
import { ViewerView } from "./viewer-view";

export const metadata: Metadata = { title: "Tingen – Lånbort" };

const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** The owners' own view, or null when the caller is not an owner. */
async function asOwner(objectId: string) {
  try {
    return await pageQuery(getObject, { objectId });
  } catch (error) {
    if (
      isDomainError(error) &&
      ["not_found", "invalid_input"].includes(error.code)
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * A thing (UX-IA «Objekt»): its owners see it as theirs (WP-82); anyone
 * else sees it through the origin in the address, an environment
 * (`?miljo=`) or directly as a friend (WP-83). Who may see what is decided
 * by each query's own policy, and what the caller may not see looks like
 * nothing at all (PS-NFR-002).
 */
export default async function ObjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requirePageAccount();
  const [{ objectId }, query] = await Promise.all([params, searchParams]);
  const environmentId = single(query[environmentParam]);
  const [owned, categories] = await Promise.all([
    asOwner(objectId),
    pageQuery(listObjectCategories, {}),
  ]);
  const today = calendarDate(new Date());
  const categoryList = categories?.categories ?? [];

  if (owned) {
    return (
      <OwnerView
        account={account}
        object={owned}
        categories={categoryList}
        today={today}
      />
    );
  }

  const [preview, environment] = await Promise.all([
    pageQueryOrNotFound(previewLoanRequest, { objectId, environmentId }),
    environmentId
      ? pageQueryOrNotFound(getEnvironment, { environmentId })
      : null,
  ]);

  return (
    <ViewerView
      account={account}
      object={preview}
      environment={environment}
      categories={categoryList}
      today={today}
      query={query}
    />
  );
}

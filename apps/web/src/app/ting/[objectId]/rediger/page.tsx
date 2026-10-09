import {
  calendarDate,
  getObject,
  listObjectCategories,
  takesNewActivity,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { objectHref } from "@/navigation/routes";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { ObjectForm } from "../../object-form";

export const metadata: Metadata = { title: "Rediger tingen – Lånbort" };

/**
 * Editing a thing with the same form it was registered with (UX-JRN-003).
 * Only its owners have the page; to anyone else it does not exist
 * (PS-NFR-002).
 */
export default async function EditObjectPage({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const account = await requirePageAccount();
  const { objectId } = await params;
  const [object, categories] = await Promise.all([
    pageQueryOrNotFound(getObject, { objectId }),
    pageQuery(listObjectCategories, {}),
  ]);
  const back = { href: objectHref(object.id), label: object.title };

  return (
    <main>
      {takesNewActivity(account.status) ? (
        <ObjectForm
          mode="edit"
          object={object}
          categories={categories?.categories ?? []}
          today={calendarDate(new Date())}
          from={{ ...back, home: "things" }}
        />
      ) : (
        <>
          <PageHeader title="Rediger tingen" back={back} home="things" task />
          <EmptyState action={<Link href={back.href}>Tilbake til tingen</Link>}>
            Du kan ikke endre tingen mens kontoen din ikke er aktiv.
          </EmptyState>
        </>
      )}
    </main>
  );
}

import {
  calendarDate,
  getEnvironment,
  previewLoanRequest,
} from "@lanbort/domain";
import type { LoanOrigin } from "@lanbort/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { OriginTag } from "@/app/lan/_parts/origin-tag";
import {
  environmentParam,
  objectHref,
  type ObjectOrigin,
} from "@/navigation/routes";
import { requestAvailability } from "@/presentation/objects";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Be om å låne – Lånbort" };

const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/**
 * Asking to borrow a thing (UX-JRN-004, UX-JRN-013): the same course
 * through an environment (`?miljo=`) and directly between friends. Who may
 * ask is the preview's policy; anyone else gets «not found» (PS-NFR-002).
 */
export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAccount();
  const [{ objectId }, query] = await Promise.all([params, searchParams]);
  const environmentId = single(query[environmentParam]);
  const [object, environment] = await Promise.all([
    pageQueryOrNotFound(previewLoanRequest, { objectId, environmentId }),
    environmentId
      ? pageQueryOrNotFound(getEnvironment, { environmentId })
      : null,
  ]);
  const origin: ObjectOrigin = environment
    ? { kind: "environment", environmentId: environment.id }
    : { kind: "direct" };
  const today = calendarDate(new Date());
  const back = objectHref(objectId, origin);

  const shownOrigin: LoanOrigin = environment
    ? { kind: "environment", environment }
    : { kind: "direct" };

  return (
    <main>
      {object.availableForNewLoans ? (
        <RequestForm
          objectId={object.objectId}
          title={object.title}
          origin={origin}
          shownOrigin={shownOrigin}
          owners={object.owners}
          termsVersion={object.termsVersion}
          loanTerms={object.loanTerms}
          declarationVersion={object.responsibilityDeclarationVersion}
          availability={requestAvailability(object, today)}
          from={{ href: back, label: object.title }}
          today={today}
        />
      ) : (
        <>
          <PageHeader
            kind="Be om å låne"
            title={object.title}
            back={{ href: back, label: object.title }}
            home="find"
            context={<OriginTag origin={shownOrigin} />}
          />
          <EmptyState action={<Link href={back}>Tilbake til tingen</Link>}>
            Tingen kan ikke lånes akkurat nå.
          </EmptyState>
        </>
      )}
    </main>
  );
}

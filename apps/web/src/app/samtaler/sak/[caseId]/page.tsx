import { readCase } from "@lanbort/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CaseEvidence } from "@/chat/case-evidence";
import { caseTitle } from "@/presentation/cases";
import { pageQueryOrNotFound } from "@/server/session";

export const metadata: Metadata = { title: "Send inn meldinger – Lånbort" };

/**
 * Private messages as documentation in a case (WP-46): a chat page, since
 * only the device's own history can show them (ADR-0010 §13). Only a
 * participant who may write in the case now gets here.
 */
export default async function CaseEvidencePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;

  if (!z.uuid().safeParse(caseId).success) notFound();

  const c = await pageQueryOrNotFound(readCase, { caseId });

  if (c.viewer !== "party" || !c.mayWrite) notFound();

  return (
    <main>
      <CaseEvidence caseId={c.id} title={caseTitle(c)} />
    </main>
  );
}

import type {
  LoanConditionAnswerKind,
  LoanConditionReport,
} from "@lanbort/contracts";
import { personName } from "./people";

type Statement = Pick<LoanConditionReport, "you" | "realName">;

/** Who said it, as the reader sees it: «Du», «Kari Nordmann». */
export const statedBy = (statement: Statement) =>
  statement.you ? "Du" : personName(statement);

/**
 * What a statement on damage, deficiency or loss is (PS-LOAN-023): what
 * someone told, never a fact, a claim or a verdict.
 */
export function describeStatement(
  statement: Statement & { readonly kind?: LoanConditionAnswerKind },
): string {
  const who = statedBy(statement);

  if (statement.kind === "disagreement") return `${who} er uenig`;
  if (statement.kind === "explanation") {
    return `${who} la til ${statement.you ? "din" : "sin"} forklaring`;
  }

  return `${who} opplyste`;
}

/** What the reports are, and what they are not (PS-LOAN-023, KF7). */
export const conditionNote =
  "Her står det hver av dere har opplyst. Lånbort avgjør ikke hvem som har rett eller om noe skal erstattes, og det endrer verken returen eller anmeldelsene.";

/** What reporting means, before it is sent (KF7). */
export const conditionReportPoints = (other: string) => [
  `Det blir en opplysning fra deg på lånet. ${other} ser den, og den står i tidslinjen.`,
  `${other} kan si seg uenig eller legge til sin forklaring. Ingen av dere kan endre det den andre skrev.`,
  "Den endrer ikke returen. Lånet avsluttes som vanlig når returen er bekreftet.",
  "Lånbort avgjør ikke hvem som har ansvaret, eller om noe skal erstattes.",
];

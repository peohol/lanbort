import { pilotAreas, pilotCases, pilotPhases } from "@lanbort/contracts";

/**
 * The tables the pilot's documents show, made from the catalogue so the
 * documents and the pilot surface never differ (pilot-ui.md «Énkildemodell»).
 * `catalogue-docs.test.ts` checks them; `pnpm pilot:docs` writes them.
 */

const cell = (text: string) => text.replaceAll("|", "\\|");

const row = (cells: readonly string[]) => `| ${cells.map(cell).join(" | ")} |`;

/** The test points, one table per area, as in `pilot-testmatrise.md`. */
export function pilotTestTables(): string {
  return pilotAreas
    .map((area) => {
      const tests = pilotCases.filter((test) => test.id.startsWith(area.code));

      return [
        `## ${area.code} – ${area.name} (${tests.length})`,
        "",
        "| ID | Prioritet | Fase | Testhandling | Forventet resultat |",
        "| --- | :---: | :---: | --- | --- |",
        ...tests.map((test) =>
          row([
            test.id,
            test.priority,
            String(test.phase),
            test.action,
            test.expected,
          ]),
        ),
      ].join("\n");
    })
    .join("\n\n");
}

/** The phases with their gates, as in `pilot-testplan.md` §3. */
export function pilotPhaseTable(): string {
  return [
    "| Fase | Når | Oppgaver | Port for videreføring |",
    "| --- | --- | --- | --- |",
    ...pilotPhases.map((phase) =>
      row([
        `**${phase.number}. ${phase.name}**`,
        phase.when,
        phase.tasks,
        phase.gate,
      ]),
    ),
  ].join("\n");
}

/** The generated sections, by the name their markers carry. */
export const pilotGeneratedSections: Record<string, () => string> = {
  "pilot-tester": pilotTestTables,
  "pilot-faser": pilotPhaseTable,
};

/**
 * The document with each marked section filled from the catalogue:
 * `<!-- generert:<name> start -->` … `<!-- generert:<name> slutt -->`.
 */
export function fillGeneratedSections(document: string): string {
  return document.replace(
    /(<!-- generert:([a-z-]+) start -->\n)[\s\S]*?(<!-- generert:\2 slutt -->)/g,
    (_, start: string, name: string, end: string) => {
      const section = pilotGeneratedSections[name];

      if (!section) {
        throw new Error(`No generated section is called ${name}`);
      }

      return `${start}${section()}\n${end}`;
    },
  );
}

import { pilotExportFormatSchema } from "@lanbort/contracts";
import { DomainError, executeCommand, exportPilot } from "@lanbort/domain";
import { pilotRunsCsv } from "@/presentation/pilot";
import { readJson } from "@/server/http/body";
import { pilotOnly } from "@/server/http/chat-gate";
import { route } from "@/server/http/route";

/**
 * `{ kind, format }`: the lead downloads the journal (pilot-ui.md
 * «Avslutning og eksport»): every run as a spreadsheet (`csv`), or all of
 * it or the summary without pseudonyms as JSON. Recorded each time; a POST,
 * so no other site can start one.
 */
export const POST = pilotOnly(
  route.user(async ({ request, requestId, actor, domain }) => {
    const body = await readJson(request);
    const { format = "json", ...input } =
      body !== null && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const parsed = pilotExportFormatSchema.safeParse(format);
    const csv = parsed.data === "csv";

    if (!parsed.success || (csv && input.kind !== "results")) {
      throw new DomainError("invalid_input", "No such export format", [
        "format",
      ]);
    }

    const { output } = await executeCommand(domain, exportPilot, {
      actor,
      input,
      correlationId: requestId,
    });
    const day = output.generatedAt.slice(0, 10);

    if (csv && output.kind === "results") {
      return new Response(pilotRunsCsv(output), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="pilot-resultater-${day}.csv"`,
        },
      });
    }

    return new Response(JSON.stringify(output, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="pilot-${output.kind === "results" ? "resultater" : "sammendrag"}-${day}.json"`,
      },
    });
  }),
);

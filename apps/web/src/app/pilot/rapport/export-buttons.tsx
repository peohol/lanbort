"use client";

import type { PilotExportFormat, PilotExportKind } from "@lanbort/contracts";
import { useState } from "react";
import { announce } from "@/components/announcer";
import { type ApiFailureCode, postForFile } from "@/components/api-client";
import { BusyButton } from "@/components/busy-button";
import { errorMessage } from "@/components/error-messages";
import { ErrorText } from "@/components/error-text";

const exports: readonly {
  kind: PilotExportKind;
  format: PilotExportFormat;
  label: string;
}[] = [
  { kind: "results", format: "csv", label: "Resultater som regneark (CSV)" },
  { kind: "results", format: "json", label: "Hele journalen (JSON)" },
  {
    kind: "summary",
    format: "json",
    label: "Sammendrag uten personopplysninger (JSON)",
  },
];

/**
 * The journal downloaded to this device (pilot-ui.md «Avslutning og
 * eksport»), never sent anywhere else. Each download is recorded.
 */
export function ExportButtons() {
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailureCode | null>(null);

  async function download(kind: PilotExportKind, format: PilotExportFormat) {
    setBusy(`${kind}-${format}`);
    setFailure(null);
    const result = await postForFile("/api/pilot/export", { kind, format });
    setBusy(null);

    if (!result.ok) {
      setFailure(result.code);
      return;
    }

    const url = URL.createObjectURL(result.data.file);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.data.name;
    link.click();
    URL.revokeObjectURL(url);
    announce(`Lastet ned ${result.data.name}`);
  }

  return (
    <>
      <div className="actions">
        {exports.map(({ kind, format, label }) => (
          <BusyButton
            key={`${kind}-${format}`}
            type="button"
            busy={busy === `${kind}-${format}`}
            onClick={() => void download(kind, format)}
          >
            {label}
          </BusyButton>
        ))}
      </div>
      <ErrorText>{failure && errorMessage(failure)}</ErrorText>
    </>
  );
}

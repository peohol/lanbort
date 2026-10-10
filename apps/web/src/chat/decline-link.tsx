"use client";

import { ChatApiError, chatApi } from "./api";
import { ConfirmSheet } from "./sheet";

/**
 * «Avvis enheten» (ADR-0010 §5): a device that waits to be linked is told
 * no at once, instead of waiting until its code expires. With more than one
 * waiting, all of them are declined. The last point follows from signing in
 * with a code by e-mail: whoever asked has been inside the account.
 */
export function DeclineLink({
  linkRequestIds,
  label,
  onDeclined,
}: {
  linkRequestIds: readonly string[];
  /** The button that opens the sheet, such as «Ikke godkjenn». */
  label?: string;
  onDeclined: () => void;
}) {
  const many = linkRequestIds.length > 1;
  const confirmLabel = many ? "Avvis enhetene" : "Avvis enheten";

  return (
    <ConfirmSheet
      label={label ?? confirmLabel}
      title={many ? "Avvise enhetene?" : "Avvise enheten?"}
      icon={null}
      points={[
        {
          icon: "lock",
          text: many
            ? "Enhetene får ikke tilgang til privat chat."
            : "Enheten får ikke tilgang til privat chat.",
        },
        {
          icon: "device",
          text: "Den som ba om tilgang, får vite at den ble avvist, og kan be på nytt.",
        },
        {
          icon: "shield",
          text: "Ba ikke du om dette? Da har noen logget inn på kontoen din med en kode fra e-posten din. Sørg for at ingen andre kommer inn på e-posten din.",
        },
      ]}
      confirmLabel={confirmLabel}
      confirm={async () => {
        // A request that expired or was answered meanwhile waits no more,
        // and one declined already is declined again: trying once more
        // after a failure ends where every request is answered.
        await Promise.all(
          linkRequestIds.map((id) =>
            chatApi.declineLink(id).catch((problem: unknown) => {
              if (
                !(problem instanceof ChatApiError) ||
                problem.code !== "not_found"
              ) {
                throw problem;
              }
            }),
          ),
        );
        onDeclined();
      }}
    />
  );
}

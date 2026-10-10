"use client";

import type { ChatLinkRequest } from "@lanbort/contracts";
import { ChatApiError, chatApi } from "./api";
import { deviceName } from "./device-names";
import { ConfirmSheet } from "./sheet";

/**
 * «Avvis» (ADR-0010 §5): one device that waits to be linked is told no at
 * once, instead of waiting until its code expires. Each request is answered
 * on its own, so a device the user wants is never declined with another.
 * The last point follows from signing in with a code by e-mail: whoever
 * asked has been inside the account.
 */
export function DeclineLink({
  request,
  label = "Avvis",
  onDeclined,
}: {
  request: Pick<ChatLinkRequest, "linkRequestId" | "deviceId">;
  /** The button that opens the sheet, such as «Ikke godkjenn». */
  label?: string;
  onDeclined: () => void;
}) {
  return (
    <ConfirmSheet
      label={label}
      title={`Avvise ${deviceName(request)}?`}
      icon={null}
      points={[
        { icon: "lock", text: "Enheten får ikke tilgang til privat chat." },
        {
          icon: "device",
          text: "Den som ba om tilgang, får vite at den ble avvist, og kan be på nytt.",
        },
        {
          icon: "shield",
          text: "Ba ikke du om dette? Da har noen logget inn på kontoen din med en kode fra e-posten din. Sørg for at ingen andre kommer inn på e-posten din.",
        },
      ]}
      confirmLabel="Avvis enheten"
      confirm={async () => {
        // A request that expired or was answered meanwhile waits no more:
        // either way it leaves the list.
        await chatApi.declineLink(request.linkRequestId).catch((problem) => {
          if (
            !(problem instanceof ChatApiError) ||
            problem.code !== "not_found"
          ) {
            throw problem;
          }
        });
        onDeclined();
      }}
    />
  );
}

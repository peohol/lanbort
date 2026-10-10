"use client";

import type { ChatLinkRequest } from "@lanbort/contracts";
import { ChatApiError, chatApi } from "./api";
import { deviceName } from "./device-names";
import { Notice } from "./notice";
import { ConfirmSheet } from "./sheet";

/**
 * How a decline ended. Only `declined` is a decline: a request that expired
 * unanswered, or that another device approved meanwhile, says so instead.
 */
export const declineOutcomes = ["declined", "expired", "approved"] as const;
export type DeclineOutcome = (typeof declineOutcomes)[number];

const outcomeOf = (problem: unknown): DeclineOutcome => {
  if (problem instanceof ChatApiError) {
    if (problem.code === "conflict") return "approved";
    if (problem.code === "not_found") return "expired";
  }
  throw problem;
};

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
  onAnswered,
}: {
  request: Pick<ChatLinkRequest, "linkRequestId" | "deviceId">;
  /** The button that opens the sheet, such as «Ikke godkjenn». */
  label?: string;
  onAnswered: (outcome: DeclineOutcome) => void;
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
      confirm={async () =>
        onAnswered(
          await chatApi
            .declineLink(request.linkRequestId, request.deviceId)
            .then((): DeclineOutcome => "declined", outcomeOf),
        )
      }
    />
  );
}

/**
 * What became of the device the user meant to decline. A device another
 * of theirs approved meanwhile can read their conversations, so it is said
 * plainly, with where to remove it. (Another tab cannot: chat runs in one
 * tab at a time.)
 */
export function DeclineReceipt({
  outcome,
  deviceId,
}: {
  outcome: DeclineOutcome;
  deviceId: string;
}) {
  const name = deviceName({ deviceId });
  switch (outcome) {
    case "declined":
      return (
        <Notice tag="Avvist" tone="positive" role="status">
          <p>{name} fikk ikke tilgang til privat chat.</p>
        </Notice>
      );
    case "expired":
      return (
        <Notice tag="Utløpt" role="status">
          <p>
            Forespørselen fra {name} gikk ut før den ble avvist. Enheten fikk
            ikke tilgang til privat chat.
          </p>
        </Notice>
      );
    case "approved":
      return (
        <Notice tag="Allerede godkjent" tone="warning" role="alert">
          <p>
            {name} ble godkjent fra en annen av enhetene dine før den ble
            avvist, og kan lese samtalene dine. Kjenner du den ikke igjen, fjern
            den under.
          </p>
        </Notice>
      );
  }
}

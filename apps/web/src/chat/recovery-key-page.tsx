"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { chatDevicesHref } from "@/navigation/chat";
import { ReadyChat } from "./chat-setup";
import type { ChatEngine } from "./engine";
import { Notice } from "./notice";
import { RecoveryKeyFlow } from "./recovery-key";
import { useOwnDevices } from "./use-own-devices";

const header = (
  <PageHeader
    title="Gjenopprettingsnøkkel"
    back={{ href: chatDevicesHref, label: "Mine enheter" }}
    home="conversations"
    task
  />
);

function RecoveryKeyTask({ engine }: { engine: ChatEngine }) {
  const { devices } = useOwnDevices();
  const [made, setMade] = useState(false);

  return made ? (
    <Notice tag="Laget" tone="positive" role="status">
      <p>Gjenopprettingsnøkkelen er laget.</p>
      <Link href={chatDevicesHref}>Tilbake til Mine enheter</Link>
    </Notice>
  ) : (
    <RecoveryKeyFlow
      engine={engine}
      replacing={Boolean(devices?.recovery)}
      done={() => setMade(true)}
    />
  );
}

/** The key from Mine enheter, the reminder or before removing a device. */
export function RecoveryKeyPage() {
  return (
    <ReadyChat header={header}>
      {(engine) => (
        <>
          {header}
          <RecoveryKeyTask engine={engine} />
        </>
      )}
    </ReadyChat>
  );
}

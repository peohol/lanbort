"use client";

import type { ChatLinkRequest, OwnChatDevices } from "@lanbort/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { chatApproveLinkHref, chatHref } from "@/navigation/chat";
import { chatApi } from "./api";
import { useChat, useEngineVersion } from "./chat-provider";
import { ChatReset } from "./chat-reset";
import { ReadyChat } from "./chat-setup";
import type { ChatEngine } from "./engine";
import { chatErrorMessage } from "./messages";

const time = (iso: string) =>
  new Date(iso).toLocaleString("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  });

/** A device is named by when it was added and the start of its id. */
const deviceName = (device: { deviceId: string; createdAt: string }) =>
  `Enhet ${device.deviceId.slice(0, 4).toUpperCase()}, lagt til ${time(device.createdAt)}`;

function RevokeButton({
  engine,
  deviceId,
  current,
}: {
  engine: ChatEngine;
  deviceId: string;
  current: boolean;
}) {
  const { reload } = useChat();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await engine.revokeDevice(deviceId);
      if (current) reload();
    } catch (problem) {
      setError(chatErrorMessage(problem));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return confirming ? (
    <>
      <p>
        {current
          ? "Denne enheten mister chatten og alt den har lagret av samtaler, og du blir logget ut her."
          : "Enheten stenges ute fra chatten med en gang og logges ut. Den kan ikke lese nye meldinger."}
      </p>
      <BusyButton type="button" busy={busy} onClick={() => void revoke()}>
        {current ? "Fjern denne enheten" : "Fjern enheten"}
      </BusyButton>
      <button type="button" onClick={() => setConfirming(false)}>
        Avbryt
      </button>
      <ErrorText>{error}</ErrorText>
    </>
  ) : (
    <button type="button" onClick={() => setConfirming(true)}>
      {current ? "Fjern denne enheten fra chatten" : "Fjern"}
    </button>
  );
}

function Devices({ engine }: { engine: ChatEngine }) {
  const version = useEngineVersion(engine);
  const [devices, setDevices] = useState<OwnChatDevices>();
  const [requests, setRequests] = useState<ChatLinkRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([chatApi.devices(), chatApi.linkRequests()])
      .then(([own, links]) => {
        setDevices(own);
        setRequests(links.requests);
      })
      .catch((problem: unknown) => setError(chatErrorMessage(problem)));
  }, [version]);

  const live = devices?.devices.filter((d) => d.revokedAt === null) ?? [];

  return (
    <>
      <h1>Mine enheter</h1>
      <p className="link-row">
        <Link href={chatHref}>Alle samtaler</Link>
      </p>
      <p>
        Dette er enhetene som kan lese de private samtalene dine. Kjenner du
        ikke igjen en enhet, eller har du mistet den, så fjern den.
      </p>
      <ErrorText>{error}</ErrorText>
      <ul className="entries">
        {live.map((device) => {
          const current = device.deviceId === devices?.currentDeviceId;
          return (
            <li
              key={device.deviceId}
              id={`enhet-${device.deviceId}`}
              className="entry"
            >
              <strong id={`navn-${device.deviceId}`}>
                {deviceName(device)}
                {current ? " (denne enheten)" : ""}
              </strong>
              <div
                className="actions"
                role="group"
                aria-labelledby={`navn-${device.deviceId}`}
              >
                <RevokeButton
                  engine={engine}
                  deviceId={device.deviceId}
                  current={current}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="ny-enhet">
        <h2 id="ny-enhet">Koble til en ny enhet</h2>
        <p>
          Logg inn på den nye enheten og gå til Samtaler. Den viser en kode som
          du skanner eller skriver inn her.
          {requests.length > 0 &&
            ` ${requests.length === 1 ? "Én enhet venter" : `${requests.length} enheter venter`} på godkjenning nå.`}
        </p>
        {/* A full page load: only that page may use the camera. */}
        <p className="link-row">
          <a href={chatApproveLinkHref}>Godkjenn en ny enhet</a>
        </p>
      </section>

      <section aria-labelledby="tilbakestill">
        <h2 id="tilbakestill">Tilbakestill chatten</h2>
        <ChatReset />
      </section>
    </>
  );
}

/** «Mine enheter» (ADR-0010 §7): the account's devices with chat. */
export function DeviceList() {
  return (
    <ReadyChat header={<h1>Mine enheter</h1>}>
      {(engine) => <Devices engine={engine} />}
    </ReadyChat>
  );
}

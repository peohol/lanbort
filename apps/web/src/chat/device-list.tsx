"use client";

import type { ChatLinkRequest, OwnChatDevices } from "@lanbort/contracts";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorText } from "@/components/error-text";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { signOut } from "@/components/sign-out-button";
import { Tag } from "@/components/tag";
import {
  chatApproveByCodeHref,
  chatApproveLinkHref,
  chatHref,
  chatRecoveryKeyHref,
  chatResetHref,
} from "@/navigation/chat";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import { ChatIcon } from "./chat-icon";
import { useEngineVersion } from "./chat-provider";
import { ReadyChat } from "./chat-setup";
import { DeclineLink } from "./decline-link";
import { addedAt, deviceName } from "./device-names";
import type { ChatEngine } from "./engine";
import { chatErrorMessage } from "./messages";
import { Notice } from "./notice";
import { RecoveryKeyRow } from "./recovery-key";
import { hasScanner } from "./scanner";
import { ConfirmSheet } from "./sheet";
import { currentDevicePoints, securesFirst } from "./sign-out";
import { messageTime } from "./time";

const header = (
  <PageHeader
    title="Mine enheter"
    back={{ href: chatHref, label: "Samtaler" }}
  />
);

/**
 * A new device waits to be linked (10): the task comes first, and only
 * while one does. The camera page is loaded anew, since only it may use
 * the camera. Each waiting device has its own row, to be declined alone.
 */
function Waiting({
  requests,
  onDeclined,
}: {
  requests: readonly ChatLinkRequest[];
  onDeclined: (request: ChatLinkRequest) => void;
}) {
  const scan = hasScanner();
  const count = requests.length;
  return (
    <section className={`card ${styles.intro}`} aria-labelledby="venter">
      <Tag tone="attention">Venter på deg</Tag>
      <h2 id="venter">
        {count === 1
          ? "En enhet vil koble til privat chat"
          : `${count} enheter vil koble til privat chat`}
      </h2>
      <p className="quiet">
        {scan
          ? "Skann koden som vises på den nye enheten."
          : "Skriv inn koden som vises på den nye enheten."}
      </p>
      {scan ? (
        <>
          <a className="button button-primary" href={chatApproveLinkHref}>
            <ChatIcon name="scan" />
            Skann koden
          </a>
          <a className={styles.centered} href={chatApproveByCodeHref}>
            Skriv inn koden i stedet
          </a>
        </>
      ) : (
        <a className="button button-primary" href={chatApproveByCodeHref}>
          Skriv inn koden
        </a>
      )}
      <ul className={styles.list}>
        {requests.map((request) => (
          <li key={request.linkRequestId} className={styles.deviceRow}>
            <span className={styles.iconBubble}>
              <ChatIcon name="device" />
            </span>
            <span
              className={styles.linkText}
              id={`venter-${request.linkRequestId}`}
            >
              <strong>{deviceName(request)}</strong>
              <small>Ba om tilgang kl. {messageTime(request.createdAt)}</small>
            </span>
            <div
              role="group"
              aria-labelledby={`venter-${request.linkRequestId}`}
            >
              <DeclineLink
                request={request}
                onDeclined={() => onDeclined(request)}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Devices({ engine }: { engine: ChatEngine }) {
  const router = useRouter();
  const version = useEngineVersion(engine);
  const [devices, setDevices] = useState<OwnChatDevices>();
  const [requests, setRequests] = useState<ChatLinkRequest[]>([]);
  const [removed, setRemoved] = useState<string>();
  // The device declined here, or on the approval page, which comes back
  // with its id in `?avvist`.
  const search = useSearchParams();
  const [declined, setDeclined] = useState(() => search.get("avvist"));
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
  const isCurrent = (deviceId: string) => deviceId === devices?.currentDeviceId;

  async function removeCurrent() {
    await engine.revokeDevice(devices!.currentDeviceId!);
    // The server ends the device's sign-in with it (ADR-0010 §7); ending it
    // here as well leaves nothing behind until it has.
    await signOut(engine.userId);
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      {header}
      {removed && (
        <Notice tag="Fjernet" tone="positive" role="status">
          <p>{removed} er logget ut og kan ikke lese nye meldinger.</p>
        </Notice>
      )}
      {declined && (
        <Notice tag="Avvist" tone="positive" role="status">
          <p>
            {deviceName({ deviceId: declined })} fikk ikke tilgang til privat
            chat.
          </p>
        </Notice>
      )}
      <ErrorText>{error}</ErrorText>
      {requests.length > 0 && (
        <Waiting
          requests={requests}
          onDeclined={(answered) => {
            setRequests((now) =>
              now.filter((r) => r.linkRequestId !== answered.linkRequestId),
            );
            setDeclined(answered.deviceId);
          }}
        />
      )}

      <h2 className={styles.sectionHeading}>Disse kan lese samtalene dine</h2>
      <ul className={styles.list}>
        {live.map((device) => {
          const name = deviceName(device);
          const current = isCurrent(device.deviceId);
          return (
            <li key={device.deviceId} className={styles.deviceRow}>
              <span className={styles.iconBubble}>
                <ChatIcon name="device" />
              </span>
              <span className={styles.linkText} id={`enhet-${device.deviceId}`}>
                <strong>{name}</strong>
                <small>
                  {current ? "Denne enheten · lagt til" : "Lagt til"}{" "}
                  {addedAt(device.createdAt)}
                </small>
              </span>
              {!current && (
                <div role="group" aria-labelledby={`enhet-${device.deviceId}`}>
                  <ConfirmSheet
                    label="Fjern"
                    title={`Fjerne ${name}?`}
                    points={[
                      {
                        icon: "lock",
                        text: "Enheten stenges ute med en gang og logges ut.",
                      },
                      {
                        icon: "conversations",
                        text: "Den kan ikke lese nye meldinger eller sende fra din konto.",
                      },
                      {
                        icon: "info",
                        text: "Meldinger som allerede ligger på enheten, kan vi ikke slette derfra.",
                      },
                      {
                        icon: "device",
                        text: "Samtalene på denne enheten påvirkes ikke.",
                      },
                    ]}
                    confirmLabel="Fjern enheten"
                    confirm={async () => {
                      await engine.revokeDevice(device.deviceId);
                      setRemoved(name);
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className={styles.stack}>
        {/* A full page load: only that page may use the camera. */}
        <a className="button button-secondary" href={chatApproveLinkHref}>
          <Icon name="plus" />
          Koble til ny enhet
        </a>

        {devices && <RecoveryKeyRow recovery={devices.recovery} />}

        <div className={styles.hint}>
          <strong>Mistet en enhet, eller kjenner du ikke igjen en?</strong>
          <p>Fjern den her. Den stenges ute med en gang.</p>
        </div>

        {devices?.currentDeviceId && (
          <ConfirmSheet
            label="Fjern denne enheten"
            title="Fjerne denne enheten?"
            points={currentDevicePoints(devices)}
            first={
              securesFirst(devices) && (
                <Link
                  className="button button-secondary"
                  href={chatRecoveryKeyHref}
                >
                  Lag gjenopprettingsnøkkel først
                </Link>
              )
            }
            confirmLabel="Fjern og logg ut"
            confirm={removeCurrent}
          />
        )}

        <Link href={chatResetHref} className={styles.centered}>
          Tilbakestill privat chat
        </Link>
      </div>
    </>
  );
}

/** «Mine enheter» (10, 14–16, ADR-0010 §7): the account's devices with chat. */
export function DeviceList() {
  return (
    <ReadyChat header={header}>
      {(engine) => <Devices engine={engine} />}
    </ReadyChat>
  );
}

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
import { useEngineVersion } from "./chat-provider";
import { ReadyChat } from "./chat-setup";
import {
  DeclineLink,
  type DeclineOutcome,
  DeclineReceipt,
  declineOutcomes,
} from "./decline-link";
import { DeviceSummary, EditDevice } from "./device-label";
import {
  addedAt,
  claimed,
  deviceDetails,
  distinctNames,
  suggestedName,
} from "./device-names";
import type { ChatEngine } from "./engine";
import { chatErrorMessage } from "./messages";
import { Notice } from "./notice";
import { RecoveryKeyRow } from "./recovery-key";
import { hasScanner } from "@/components/qr-scanner";
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
 * the camera. Each waiting device has its own row, to be declined alone,
 * named by what it says it is, which nothing has confirmed yet.
 */
function Waiting({
  requests,
  onAnswered,
}: {
  requests: readonly ChatLinkRequest[];
  onAnswered: (
    request: ChatLinkRequest,
    outcome: DeclineOutcome,
    name: string,
  ) => void;
}) {
  const scan = hasScanner();
  const names = distinctNames(requests.map(claimed));
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
            <Icon name="scan" />
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
        {requests.map((request) => {
          const name = names.get(request.deviceId)!;
          return (
            <li key={request.linkRequestId} className={styles.deviceRow}>
              <DeviceSummary
                device={claimed(request)}
                name={name}
                id={`venter-${request.linkRequestId}`}
              >
                <small>
                  Ba om tilgang kl. {messageTime(request.createdAt)}
                </small>
              </DeviceSummary>
              <div
                role="group"
                aria-labelledby={`venter-${request.linkRequestId}`}
              >
                <DeclineLink
                  request={request}
                  name={name}
                  onAnswered={(outcome) => onAnswered(request, outcome, name)}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {requests.some((request) => suggestedName(request.description)) && (
        <p className="help">
          Navn og type er det den nye enheten selv oppgir. Det er ikke
          bekreftet, så se etter at det er enheten du har foran deg.
        </p>
      )}
    </section>
  );
}

/** A decline the approval page came back with (`chatDevicesAnsweredHref`). */
function answeredIn(search: URLSearchParams): Answered | null {
  const outcome = declineOutcomes.find((o) => o === search.get("avvisning"));
  const deviceId = search.get("enhet");
  return outcome && deviceId ? { outcome, deviceId } : null;
}

/** A decline, with the name the waiting device had where it is known. */
interface Answered {
  outcome: DeclineOutcome;
  deviceId: string;
  name?: string;
}

function Devices({ engine }: { engine: ChatEngine }) {
  const router = useRouter();
  const version = useEngineVersion(engine);
  const [devices, setDevices] = useState<OwnChatDevices>();
  const [requests, setRequests] = useState<ChatLinkRequest[]>([]);
  const [removed, setRemoved] = useState<string>();
  // A decline here, or on the approval page, which comes back with it in
  // the address.
  const search = useSearchParams();
  const [answered, setAnswered] = useState(() => answeredIn(search));
  // Bumped when a device is renamed, to show it as the server keeps it.
  const [renamed, setRenamed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Loaded again after a device turned out approved, so it is listed below.
  useEffect(() => {
    Promise.all([chatApi.devices(), chatApi.linkRequests()])
      .then(([own, links]) => {
        setDevices(own);
        setRequests(links.requests);
      })
      .catch((problem: unknown) => setError(chatErrorMessage(problem)));
  }, [version, answered, renamed]);

  const isCurrent = (deviceId: string) => deviceId === devices?.currentDeviceId;
  // This one first, so it is never mistaken for another.
  const live = (devices?.devices ?? [])
    .filter((d) => d.revokedAt === null)
    .sort(
      (a, b) => Number(isCurrent(b.deviceId)) - Number(isCurrent(a.deviceId)),
    );
  const names = distinctNames(live);
  // One approved meanwhile is listed below, with its name.
  const answeredName =
    answered && (answered.name ?? names.get(answered.deviceId));

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
      {answered && (
        <DeclineReceipt
          outcome={answered.outcome}
          name={answeredName ?? undefined}
        />
      )}
      <ErrorText>{error}</ErrorText>
      {requests.length > 0 && (
        <Waiting
          requests={requests}
          onAnswered={(request, outcome, name) => {
            setRequests((now) =>
              now.filter((r) => r.linkRequestId !== request.linkRequestId),
            );
            setAnswered({ deviceId: request.deviceId, outcome, name });
          }}
        />
      )}

      <h2 className={styles.sectionHeading}>Disse kan lese samtalene dine</h2>
      <ul className={styles.list}>
        {live.map((device) => {
          const name = names.get(device.deviceId)!;
          const current = isCurrent(device.deviceId);
          const details = deviceDetails(device.label);
          return (
            <li key={device.deviceId} className={styles.deviceRow}>
              <DeviceSummary
                device={device}
                name={name}
                id={`enhet-${device.deviceId}`}
              >
                {current && <Tag>Denne enheten</Tag>}
                <small>
                  {details && `${details} · `}
                  Lagt til {addedAt(device.createdAt)}
                </small>
              </DeviceSummary>
              <div
                role="group"
                aria-labelledby={`enhet-${device.deviceId}`}
                className={styles.deviceActions}
              >
                <EditDevice
                  key={JSON.stringify(device.label)}
                  device={device}
                  onSaved={() => setRenamed((count) => count + 1)}
                />
                {!current && (
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
                )}
              </div>
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

"use client";

import type { OwnChatDevices } from "@lanbort/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { errorMessage } from "@/components/error-messages";
import { PageHeader } from "@/components/page-header";
import { SignOutButton, signOut } from "@/components/sign-out-button";
import { accountHref } from "@/navigation/areas";
import { chatRecoveryKeyHref } from "@/navigation/chat";
import styles from "./chat.module.css";
import { useChat } from "./chat-provider";
import { deviceName } from "./device-names";
import type { ChatEngine } from "./engine";
import { chatErrorMessage } from "./messages";
import { type Point, Points } from "./points";
import { useOwnDevices } from "./use-own-devices";

const names = new Intl.ListFormat("nb-NO", { type: "conjunction" });

/**
 * What this device loses when it leaves private chat, by removal or by
 * signing out (skjerm 16, ADR-0010 §7): its conversations and its sign-in,
 * and what happens to the messages depends on what else the account has.
 */
export function currentDevicePoints(devices: OwnChatDevices): Point[] {
  const others = devices.devices.filter(
    (d) => d.revokedAt === null && d.deviceId !== devices.currentDeviceId,
  );

  return [
    {
      icon: "conversations",
      text: "Denne enheten mister privat chat og alle samtalene som er lagret her.",
    },
    { icon: "signOut", text: "Du logges ut på denne enheten." },
    others.length > 0
      ? {
          icon: "device",
          text: `${names.format(others.map(deviceName))} beholder sine samtaler.`,
        }
      : devices.recovery
        ? {
            icon: "key",
            text: "Meldinger som er sikkerhetskopiert, kan hentes tilbake med gjenopprettingsnøkkelen. Meldinger som ikke er sikkerhetskopiert ennå, er tapt.",
          }
        : {
            icon: "info",
            text: "Dette er den eneste enheten din med privat chat. Meldingene her kan ikke hentes tilbake.",
          },
  ];
}

/**
 * The history can be secured before what cannot be undone: when this is
 * the account's only device and there is no recovery key.
 */
export const securesFirst = (devices: OwnChatDevices) =>
  !devices.recovery &&
  !devices.devices.some(
    (d) => d.revokedAt === null && d.deviceId !== devices.currentDeviceId,
  );

const header = (
  <PageHeader
    title="Logge ut av denne enheten?"
    back={{ href: accountHref, label: "Konto" }}
    task
  />
);

/** The device's chat runs: it revokes itself, then the sign-in ends. */
function WithChat({ engine }: { engine: ChatEngine }) {
  const router = useRouter();
  const { devices, error: loadError } = useOwnDevices();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setError(null);
    try {
      // Deletes the device's chat here as well (ADR-0010 §7).
      await engine.revokeDevice(engine.deviceId);
    } catch (problem) {
      setBusy(false);
      setError(chatErrorMessage(problem));
      return;
    }
    const result = await signOut();
    if (!result.ok) {
      setBusy(false);
      setError(errorMessage(result.code));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (!devices) {
    return (
      <>
        {header}
        <ErrorText>{loadError}</ErrorText>
        {!loadError && <p role="status">Henter enhetene dine …</p>}
      </>
    );
  }

  return (
    <>
      {header}
      <div className={styles.stack}>
        <Points points={currentDevicePoints(devices)} />
        {securesFirst(devices) && (
          <Link className="button button-secondary" href={chatRecoveryKeyHref}>
            Lag gjenopprettingsnøkkel først
          </Link>
        )}
        <ErrorText>{error}</ErrorText>
        <BusyButton
          type="button"
          className="button-danger"
          busy={busy}
          onClick={() => void leave()}
        >
          Logg ut
        </BusyButton>
      </div>
    </>
  );
}

/**
 * «Logg ut» on a device with private chat (ADR-0010 §7): it says first what
 * the device loses. Where the chat cannot run here (open in another tab,
 * or gone already), signing out still deletes what the browser holds.
 */
export function ChatSignOut() {
  const { state } = useChat();

  if (state.status === "ready") return <WithChat engine={state.engine} />;

  return (
    <>
      {header}
      {state.status === "loading" ? (
        <p role="status">Henter privat chat …</p>
      ) : (
        <div className={styles.stack}>
          <Points
            points={[
              {
                icon: "conversations",
                text: "Privat chat og samtalene som er lagret på denne enheten, slettes.",
              },
              { icon: "signOut", text: "Du logges ut på denne enheten." },
            ]}
          />
          <SignOutButton className="button-danger" />
        </div>
      )}
    </>
  );
}

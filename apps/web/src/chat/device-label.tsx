"use client";

import {
  chatDeviceKinds,
  chatDeviceNameMaxLength,
  type ChatDeviceKind,
  type OwnChatDevice,
} from "@lanbort/contracts";
import { type FormEvent, type ReactNode, useState } from "react";
import { announce } from "@/components/announcer";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import { ChatIcon } from "./chat-icon";
import {
  deviceDetails,
  deviceIcon,
  deviceKindLabels,
  deviceName,
  type Named,
} from "./device-names";
import { chatErrorMessage } from "./messages";
import { Sheet } from "./sheet";

/** A device as a row shows it: its kind's icon, its name, then `children`. */
export function DeviceSummary({
  device,
  name = deviceName(device),
  id,
  children,
}: {
  device: Named;
  /** Its name as its list tells it apart (`distinctNames`). */
  name?: string;
  /** For the row's buttons to be named by. */
  id?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <span className={styles.iconBubble}>
        <ChatIcon name={deviceIcon(device.label)} />
      </span>
      <span className={styles.linkText} id={id}>
        <strong>{name}</strong>
        {children}
      </span>
    </>
  );
}

/**
 * «Endre» on a device in Mine enheter: its name and kind, kept by the
 * server so every device of the account shows the same. Only for the
 * account's owner to know the devices apart; it changes nothing about who
 * can read the conversations. Until the name is typed, it follows the
 * suggestion for the chosen kind; left empty, it goes back to it.
 */
export function EditDevice({
  device,
  onSaved,
}: {
  device: OwnChatDevice;
  onSaved: () => void;
}) {
  const label = device.label;
  const [kind, setKind] = useState<ChatDeviceKind | null>(label?.kind ?? null);
  const [name, setName] = useState<string | null>(label?.name ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = `enhet-${device.deviceId}`;
  const details = deviceDetails(label);
  // The name it gets without one of its own, with the kind chosen here.
  const suggestion = deviceName({
    deviceId: device.deviceId,
    label: {
      name: null,
      kind,
      system: label?.system ?? null,
      browser: label?.browser ?? null,
    },
  });
  const nameHelp = `Står feltet tomt, heter den «${suggestion}».`;

  function reset() {
    setKind(label?.kind ?? null);
    setName(label?.name ?? null);
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dialog = event.currentTarget.closest("dialog");
    const typed = name?.trim() ?? "";
    setBusy(true);
    setError(null);
    try {
      await chatApi.labelDevice({
        deviceId: device.deviceId,
        name: typed === "" || typed === suggestion ? null : typed,
        kind,
      });
      dialog?.close();
      announce("Enheten er endret.");
      onSaved();
    } catch (problem) {
      setError(chatErrorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      label={
        <>
          <Icon name="edit" />
          Endre
        </>
      }
      title="Endre enheten"
      onClose={reset}
    >
      <form className={styles.stack} onSubmit={(event) => void save(event)}>
        <Field id={`${id}-navn`} label="Navn" help={nameHelp}>
          <input
            id={`${id}-navn`}
            name="name"
            autoComplete="off"
            maxLength={chatDeviceNameMaxLength}
            value={name ?? suggestion}
            onChange={(event) => setName(event.target.value)}
            {...describedBy(`${id}-navn`, nameHelp)}
          />
        </Field>
        <fieldset>
          <legend>Type</legend>
          {chatDeviceKinds.map((option) => (
            <div key={option} className="checkbox">
              <input
                id={`${id}-${option}`}
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
              />
              <label htmlFor={`${id}-${option}`} className={styles.kindChoice}>
                <ChatIcon name={option} />
                {deviceKindLabels[option]}
              </label>
            </div>
          ))}
        </fieldset>
        {details && <p className="help">Enheten oppgir selv: {details}.</p>}
        <p className="quiet">
          Bare du ser navnet, på alle enhetene dine. Det endrer ikke hvem som
          kan lese samtalene.
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            onClick={(event) => event.currentTarget.closest("dialog")?.close()}
          >
            Avbryt
          </button>
          <BusyButton type="submit" className="button-primary" busy={busy}>
            Lagre
          </BusyButton>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    </Sheet>
  );
}

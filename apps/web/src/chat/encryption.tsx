"use client";

import { Icon, type IconName } from "@/components/icon";
import styles from "./chat.module.css";
import { Sheet } from "./sheet";

const protects = [
  "Lånbort, administratorene i miljøene eller noen som får tak i lagrede data, leser meldingene",
  "Noen som logger inn på kontoen din, leser meldinger fra før",
];

const doesNotProtect = [
  "At den du skriver med, tar skjermbilde eller sender videre",
  "Skadelig programvare eller utvidelser i nettleseren din, eller at selve appen er blitt endret av noen",
  "At Lånbort ser hvem du skriver med og når, men ikke hva",
];

function Points({
  heading,
  icon,
  points,
}: {
  heading: string;
  icon: IconName;
  points: readonly string[];
}) {
  return (
    <>
      <h3 className={styles.pointsHeading}>{heading}</h3>
      <ul className={styles.points}>
        {points.map((point) => (
          <li key={point}>
            <Icon name={icon} />
            {point}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * «Om krypteringen» (06): what the product may promise about encryption,
 * and no more (ADR-0010 §13–14).
 */
export function EncryptionSheet() {
  return (
    <Sheet
      label="Om krypteringen"
      title="Om krypteringen"
      className="button-quiet"
    >
      <>
        <p>
          Meldinger i privat chat krypteres på enheten din og kan bare åpnes på
          enhetene til deg og den du skriver med.
        </p>
        <Points heading="Beskytter mot at" icon="check" points={protects} />
        <Points
          heading="Beskytter ikke mot"
          icon="info"
          points={doesNotProtect}
        />
        <p className="quiet">
          Meldingen i en låneforespørsel er en del av forespørselen og er ikke
          ende-til-ende-kryptert. Ingen får vite om du har lest en melding.
        </p>
      </>
    </Sheet>
  );
}

/** The one line in a conversation on who can read it (02). */
export function EncryptionLine({ with: name }: { with: string }) {
  return (
    <div className={styles.secure}>
      <span>
        <Icon name="lock" />
        Ende-til-ende-kryptert. Bare du og {name} kan lese meldingene.
      </span>{" "}
      <EncryptionSheet />
    </div>
  );
}

"use client";

import {
  type ChatConversation,
  type ChatDirectory,
  productTimeZone,
} from "@lanbort/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { announce } from "@/components/announcer";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { useStack } from "@/components/navigation-stack";
import { PageHeader } from "@/components/page-header";
import { chatConversationHref, chatHref } from "@/navigation/chat";
import { personHref } from "@/navigation/routes";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import { loanOf, nameOf } from "./chat-home";
import { useEngineVersion } from "./chat-provider";
import { ReadyChat } from "./chat-setup";
import type { ChatEngine } from "./engine";
import { LinkRow } from "./link-row";
import { type ChatLoan, type ChatLoans, cameFromFirst } from "./loans";
import { chatErrorMessage } from "./messages";

type Person = ChatConversation["others"][number];

const dayFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "long",
  timeZone: productTimeZone,
});

/** «Olas», «Hans'»: whose something is, in Norwegian. */
const whose = (name: string) =>
  /[sxz]$/i.test(name) ? `${name}'` : `${name}s`;

/** The 60 digits both compare, as 12 groups of 5 (ADR-0010 §3). */
function SecurityCode({
  engine,
  person,
}: {
  engine: ChatEngine;
  person: Person;
}) {
  const version = useEngineVersion(engine);
  const [code, setCode] = useState<string[]>();
  const name = person.realName ?? "Tidligere bruker";

  useEffect(() => {
    void engine.securityCode(person.userId).then(setCode);
  }, [engine, person.userId, version]);

  return (
    <section className="card" aria-labelledby={`kode-${person.userId}`}>
      <h2 id={`kode-${person.userId}`}>Sikkerhetskode</h2>
      <p className="quiet">
        Sammenlign med koden på {whose(name)} skjerm når dere møtes. Er de like,
        bruker samtalen {whose(name)} egne nøkler, ikke noen andres.
      </p>
      {code && (
        <p
          className={`security-code ${styles.code}`}
          aria-label={code.join(" ")}
        >
          {code.map((group, index) => (
            <span key={index}>{group}</span>
          ))}
        </p>
      )}
    </section>
  );
}

/**
 * The contact's devices (ADR-0010 §4): how many can read the conversation
 * and when the newest was linked. No warning: each is signed with the
 * contact's known account key.
 */
function TheirDevices({
  directory,
  person,
}: {
  directory: ChatDirectory | undefined;
  person: Person;
}) {
  const devices =
    directory?.accounts
      .find((account) => account.userId === person.userId)
      ?.devices.filter((device) => device.revokedAt === null) ?? [];
  if (devices.length === 0) return null;
  const newest = devices
    .map((device) => device.createdAt)
    .sort()
    .at(-1)!;
  const name = person.realName ?? "Tidligere bruker";

  return (
    <section className="card" aria-labelledby={`enheter-${person.userId}`}>
      <h2 id={`enheter-${person.userId}`}>
        {whose(name)} enheter: {devices.length}
      </h2>
      <p className="quiet">
        Sist koblet til en ny enhet {dayFormat.format(new Date(newest))}.
      </p>
    </section>
  );
}

function About({
  engine,
  id,
  loans,
}: {
  engine: ChatEngine;
  id: string;
  loans: ChatLoans;
}) {
  const router = useRouter();
  const [info, setInfo] = useState<ChatConversation>();
  const [directory, setDirectory] = useState<ChatDirectory>();
  const [busy, setBusy] = useState(false);
  const [muting, setMuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([chatApi.conversation(id), chatApi.directory(id)])
      .then(([conversation, keys]) => {
        setInfo(conversation);
        setDirectory(keys);
      })
      .catch((problem: unknown) => setError(chatErrorMessage(problem)));
  }, [id]);

  async function hide() {
    setBusy(true);
    setError(null);
    try {
      await chatApi.hide(id);
      router.push(chatHref);
    } catch (problem) {
      setBusy(false);
      setError(chatErrorMessage(problem));
    }
  }

  async function mute(muted: boolean) {
    setMuting(true);
    setError(null);
    try {
      await chatApi.mute(id, muted);
      setInfo((current) => current && { ...current, muted });
      announce(muted ? "Samtalen er dempet." : "Varslene er slått på igjen.");
    } catch (problem) {
      setError(chatErrorMessage(problem));
    } finally {
      setMuting(false);
    }
  }

  const others = info?.others ?? [];
  const name = nameOf(others) || "den du skriver med";
  const logistics = info?.kind === "loan_logistics";
  const loan = logistics ? loanOf(loans, info.loanId) : undefined;
  const stack = useStack();
  const linked: readonly ChatLoan[] = logistics
    ? loan
      ? [loan]
      : []
    : cameFromFirst(
        others.flatMap((person) => loans[person.userId] ?? []),
        stack?.entries ?? [],
      );

  return (
    <>
      <AboutHeader id={id} name={info ? name : "Samtalen"} />
      <ErrorText>{error}</ErrorText>

      {info && (
        <div className={styles.stack}>
          <ul className={styles.cardList} aria-label="Lån og profil">
            {linked.map((item) => (
              <LinkRow
                key={item.id}
                href={item.href}
                title={item.title}
                detail={
                  item.kind === "loan" ? `Lån · ${item.status}` : item.status
                }
                picture={item.picture}
              />
            ))}
            {others.map((person) =>
              person.profileId && person.realName ? (
                <LinkRow
                  key={person.userId}
                  href={personHref(person.profileId)}
                  title={person.realName}
                  detail="Profil"
                />
              ) : null,
            )}
          </ul>

          {others.map((person) => (
            <SecurityCode key={person.userId} engine={engine} person={person} />
          ))}
          {others.map((person) => (
            <TheirDevices
              key={person.userId}
              directory={directory}
              person={person}
            />
          ))}

          <section className="card" aria-label="Demp samtalen">
            <BusyButton
              type="button"
              busy={muting}
              onClick={() => void mute(!info.muted)}
            >
              {info.muted ? "Slå på varsler igjen" : "Demp samtalen"}
            </BusyButton>
            <p className="quiet">
              {info.muted
                ? "Du får ikke varsler om nye meldinger her. "
                : "Bare varsler om nye meldinger her, og bare for deg. "}
              Påkrevde sikkerhetsvarsler og varsler om lånet kommer som før.
            </p>
          </section>

          <section className="card" aria-label="Fjern fra mine samtaler">
            <BusyButton type="button" busy={busy} onClick={() => void hide()}>
              Fjern fra mine samtaler
            </BusyButton>
            <p className="quiet">
              Bare fra din liste. {name} beholder samtalen
              {logistics ? "" : ", og lånet påvirkes ikke"}. Samtalen kommer
              tilbake hvis en av dere skriver igjen.
            </p>
          </section>
        </div>
      )}
    </>
  );
}

/** It lies in the conversation it is about (UX-IA-011). */
const AboutHeader = ({ id, name }: { id: string; name: string }) => (
  <PageHeader
    title="Om samtalen"
    back={{ href: chatConversationHref(id), label: name }}
    home="conversations"
  />
);

/** «Om samtalen» (04), from ⋯ in the conversation. */
export function ConversationAbout({
  id,
  loans,
}: {
  id: string;
  loans: ChatLoans;
}) {
  return (
    <ReadyChat header={<AboutHeader id={id} name="Samtalen" />}>
      {(engine) => <About engine={engine} id={id} loans={loans} />}
    </ReadyChat>
  );
}

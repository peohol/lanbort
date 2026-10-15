"use client";

import type { OwnFriendCode as Code } from "@lanbort/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type ApiResult, postJson } from "@/components/api-client";
import { BusyButton } from "@/components/busy-button";
import { errorMessage } from "@/components/error-messages";
import { ErrorText } from "@/components/error-text";
import { QrCode } from "@/components/qr-code";
import qr from "@/components/qr.module.css";
import { StatusCard } from "@/components/status-card";
import { Tag } from "@/components/tag";
import { friendsHref } from "@/navigation/routes";
import { groupCode } from "@/presentation/codes";
import { formatClock } from "@/presentation/dates";
import { friendCodeLink, timeLeft } from "@/presentation/friend-invitations";

const newCode = () => postJson<Code>("/api/social/friend-codes", {});

/**
 * PS-USR-014: the user's friend code, made when the page opens and shown
 * as a QR code for five minutes (`friendCodeLink`), and as text to type.
 * A new code replaces the old one.
 */
export function OwnFriendCode() {
  const [code, setCode] = useState<Code | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const show = (result: ApiResult<Code>) => {
    setPending(false);
    if (result.ok) {
      setCode(result.data);
      setNow(Date.now());
    } else {
      setError(errorMessage(result.code));
    }
  };

  function make() {
    setPending(true);
    setError(null);
    void newCode().then(show);
  }

  // The code is made as the page opens.
  useEffect(() => {
    void newCode().then(show);
  }, []);

  const expired = code !== null && Date.parse(code.expiresAt) <= now;

  useEffect(() => {
    if (!code || expired) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [code, expired]);

  const again = (
    <BusyButton
      type="button"
      className={expired ? "button-primary" : "button-secondary"}
      busy={pending}
      onClick={make}
    >
      Vis ny kode
    </BusyButton>
  );

  if (!code) {
    return (
      <>
        {pending && <p role="status">Lager en kode …</p>}
        <ErrorText>{error}</ErrorText>
        {error && again}
      </>
    );
  }

  return (
    <>
      {expired ? (
        <div role="status">
          <StatusCard
            label="Utløpt"
            tone="waiting"
            status="Koden virker ikke lenger"
            actions={again}
          >
            <p>En kode gjelder i fem minutter. Vis en ny når du trenger den.</p>
          </StatusCard>
        </div>
      ) : (
        <>
          <div className={`card ${qr.qr}`}>
            <QrCode
              value={friendCodeLink(location.origin, code.code)}
              label="QR-kode for å bli venn med deg"
            />
            <div className={qr.qrStatus}>
              {/* Counting down aloud would interrupt every second. */}
              <span aria-hidden="true">
                <Tag tone="waiting">{timeLeft(code.expiresAt, now)} igjen</Tag>
              </span>
              <strong>Gjelder til kl. {formatClock(code.expiresAt)}</strong>
              <small>Den viser bare navnet ditt til den som skanner.</small>
            </div>
          </div>
          <div className={qr.typeCode}>
            <p>Kan ikke den andre skanne? Den kan skrives inn i stedet:</p>
            <p className={`friend-code ${qr.code}`}>{groupCode(code.code)}</p>
          </div>
          {again}
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <p className="quiet">
        Forespørselen kommer under <Link href={friendsHref}>Venner</Link>, og du
        godtar eller avslår den som vanlig.
      </p>
    </>
  );
}

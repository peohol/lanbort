"use client";

import { useEffect, useReducer, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import styles from "./chat.module.css";
import { useEngineVersion } from "./chat-provider";
import type { ChatEngine, SecurityCode } from "./engine";

export interface ShownSecurityCode {
  /**
   * The code on the screen. While the contact's changed key waits, it is
   * the code the user was shown of it, the only key «Godta» accepts. Null:
   * the conversation is not with them (`ChatEngine.securityCode`).
   */
  code: SecurityCode | null | undefined;
  /** The server has shown yet another key since that code was shown. */
  changedAgain: boolean;
  /** Shows the code of the key waiting now, in place of the one shown. */
  showNew: () => Promise<void>;
  /** Accepts the key whose code is shown; false if it no longer waits. */
  accept: () => Promise<boolean>;
}

/**
 * A contact's security code in a conversation, bound to what the user
 * sees (ADR-0010 §3): the first code of a changed key on the screen is the
 * one recorded as shown, and it stays there if the server shows another
 * key, until the user asks to see the new one. On every page that shows
 * it, before and after navigating, it is the same one.
 */
export function useSecurityCode(
  engine: ChatEngine,
  conversationId: string,
  userId: string,
): ShownSecurityCode {
  const version = useEngineVersion(engine);
  const [refreshed, refresh] = useReducer((n: number) => n + 1, 0);
  const [state, setState] = useState<{
    current: SecurityCode | null | undefined;
    shown: SecurityCode | null;
  }>();

  useEffect(() => {
    let live = true;
    void (async () => {
      const current = await engine.securityCode(conversationId, userId);
      let shown = await engine.shownSecurityCode(conversationId, userId);
      if (
        current?.pending &&
        !shown &&
        (await engine.showSecurityCode(userId, current.key))
      ) {
        shown = current;
      }
      if (live) setState({ current, shown });
    })();
    return () => {
      live = false;
    };
  }, [engine, conversationId, userId, version, refreshed]);

  const current = state?.current;
  const shown = current?.pending ? (state?.shown ?? null) : null;
  return {
    code: shown ?? current,
    changedAgain: Boolean(current?.pending && shown?.key !== current.key),
    showNew: async () => {
      if (current?.pending) await engine.showSecurityCode(userId, current.key);
      refresh();
    },
    accept: async () => {
      const accepted =
        shown !== null && (await engine.acceptKeyChange(userId, shown.key));
      refresh();
      return accepted;
    },
  };
}

/** The 60 digits both compare, as 12 groups of 5 (ADR-0010 §3). */
export function SecurityDigits({ code }: { code: SecurityCode }) {
  return (
    <p
      className={`security-code ${styles.code}`}
      aria-label={code.code.join(" ")}
    >
      {code.code.map((group, index) => (
        <span key={index}>{group}</span>
      ))}
    </p>
  );
}

/**
 * The server has shown another key since the code on the screen: the new
 * one is shown only when the user asks, and accepted only after that.
 */
export function ChangedAgain({ showNew }: { showNew: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div role="alert">
      <p>
        Sikkerhetskoden er endret igjen etter at denne koden ble vist. Se den
        nye koden før du godtar noe.
      </p>
      <BusyButton
        type="button"
        busy={busy}
        onClick={() => {
          setBusy(true);
          void showNew().finally(() => setBusy(false));
        }}
      >
        Vis den nye koden
      </BusyButton>
    </div>
  );
}

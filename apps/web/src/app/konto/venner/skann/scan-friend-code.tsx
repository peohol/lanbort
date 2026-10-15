"use client";

import { type FriendCodeOwner, friendCodeSchema } from "@lanbort/contracts";
import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { type ApiResult, getJson } from "@/components/api-client";
import { BusyButton } from "@/components/busy-button";
import { errorMessage } from "@/components/error-messages";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { MenuList, MenuRow } from "@/components/menu-list";
import { ProfilePicture } from "@/components/profile-picture";
import { hasScanner, QrScanner } from "@/components/qr-scanner";
import { StatusCard } from "@/components/status-card";
import { useCommand } from "@/components/use-command";
import { useLoadedAt } from "@/components/use-loaded-at";
import { friendScanHref, friendsHref } from "@/navigation/routes";
import { readFriendCodeLink } from "@/presentation/friend-invitations";
import { describeRelation } from "@/presentation/people";

const noSubscription = () => () => undefined;

const ownerOf = (code: string) =>
  getJson<FriendCodeOwner>(
    `/api/social/friend-codes/read?${new URLSearchParams({ code })}`,
  );

type Phase =
  /** Without a chosen `mode`, the camera where there is one. */
  | { kind: "looking"; mode?: "scan" | "code" }
  | { kind: "found"; code: string; owner: FriendCodeOwner }
  | { kind: "missing" };

const codeHelp = "Mellomrom, bindestrek og små bokstaver spiller ingen rolle.";

/**
 * PS-USR-014: another person's friend code, scanned with the camera where
 * the browser can, opened from a phone's own camera, or typed. It shows
 * only the person's name and the relation, and sends a friend request only
 * when asked to; the person then accepts or declines it as any other.
 */
export function ScanFriendCode() {
  const camera = useSyncExternalStore(noSubscription, hasScanner, () => false);
  // The camera is allowed only in a document loaded at this page.
  const ready = useLoadedAt(friendScanHref, camera);
  const [phase, setPhase] = useState<Phase>({ kind: "looking" });
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const show = useCallback(
    (code: string, result: ApiResult<FriendCodeOwner>) => {
      setBusy(false);
      if (result.ok) setPhase({ kind: "found", code, owner: result.data });
      else if (result.code === "not_found") setPhase({ kind: "missing" });
      else setError(errorMessage(result.code));
    },
    [],
  );

  function look(code: string) {
    setBusy(true);
    setError(null);
    void ownerOf(code).then((result) => show(code, result));
  }

  const request = useCommand<FriendCodeOwner>({
    path: "/api/social/friend-codes/request",
    done: "Venneforespørselen er sendt",
    // The page shows the answer; read again, it would start over.
    after: "stay",
    onFailure: (code) => {
      if (code === "not_found") setPhase({ kind: "missing" });
    },
    onDone: (owner) =>
      setPhase((current) =>
        current.kind === "found" ? { ...current, owner } : current,
      ),
  });

  // A code opened from a phone's own camera comes after `#`, also while
  // the page is open; it is taken out of the address at once.
  useEffect(() => {
    if (!ready) return;
    const open = () => {
      const opened = readFriendCodeLink(location.href, location.origin);
      if (location.hash) {
        history.replaceState(history.state, "", friendScanHref);
      }
      if (opened) void ownerOf(opened).then((result) => show(opened, result));
    };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, [ready, show]);

  if (!ready) return null;

  const again = (
    <button
      type="button"
      className="button-secondary"
      onClick={() => {
        setTyped("");
        setError(null);
        setPhase({ kind: "looking" });
      }}
    >
      Skann eller skriv en annen kode
    </button>
  );

  if (phase.kind === "missing") {
    return (
      <div role="alert">
        <StatusCard
          label="Ingen treff"
          status="Fant ingen gyldig kode"
          actions={again}
        >
          <p>
            Koden kan være skrevet feil, eller den har utløpt. En kode gjelder i
            fem minutter. Be personen vise en ny.
          </p>
        </StatusCard>
      </div>
    );
  }

  if (phase.kind === "found") {
    const { owner, code } = phase;
    const relation = describeRelation({
      realName: owner.realName,
      relationSince: null,
      relation: owner,
    });
    const mayAsk =
      owner.friendship === "none" && !owner.blockedByMe && owner.canRequest;

    return (
      <>
        <MenuList>
          <MenuRow
            lead={
              <ProfilePicture
                pictureId={null}
                name={owner.realName}
                size="medium"
                initials
              />
            }
            label={owner.realName}
            detail={relation.status}
          />
        </MenuList>
        <p role="status">{relation.detail}</p>
        <div className="actions">
          {mayAsk && (
            <BusyButton
              type="button"
              className="button-primary"
              busy={request.pending}
              onClick={() => void request.run({ code })}
            >
              Send venneforespørsel
            </BusyButton>
          )}
          {owner.friendship === "incoming_pending" && (
            <Link href={friendsHref} className="button button-primary">
              Svar under Venner
            </Link>
          )}
          {again}
        </div>
        <ErrorText>{request.error}</ErrorText>
      </>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const code = friendCodeSchema.safeParse(typed);
    if (code.success) void look(code.data);
    else setPhase({ kind: "missing" });
  }

  return (
    <>
      {(phase.mode ?? (camera ? "scan" : "code")) === "scan" ? (
        <>
          <QrScanner
            read={(content) => readFriendCodeLink(content, location.origin)}
            onCode={look}
            failure="Fikk ikke brukt kameraet. Skriv inn koden i stedet."
          />
          <p>Hold kameraet mot QR-koden på den andres skjerm.</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setPhase({ kind: "looking", mode: "code" })}
          >
            Skriv inn koden i stedet
          </button>
          <p className="quiet">Kameraet brukes bare her.</p>
        </>
      ) : (
        <form method="post" onSubmit={submit} aria-busy={busy}>
          {!camera && (
            <p>
              Denne nettleseren kan ikke skanne her. Skann QR-koden med kameraet
              på mobilen din, eller skriv inn koden som står under den.
            </p>
          )}
          <Field id="friend-code" label="Kode" help={codeHelp}>
            <input
              id="friend-code"
              name="code"
              className="friend-code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              maxLength={40}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              {...describedBy("friend-code", codeHelp)}
            />
          </Field>
          <div className="actions">
            <BusyButton type="submit" busy={busy}>
              Finn personen
            </BusyButton>
            {camera && (
              <button
                type="button"
                className="button-quiet"
                onClick={() => setPhase({ kind: "looking", mode: "scan" })}
              >
                Skann koden i stedet
              </button>
            )}
          </div>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
}

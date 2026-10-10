"use client";

import type { ChatLinkRequest } from "@lanbort/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { announce } from "@/components/announcer";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { PageHeader } from "@/components/page-header";
import {
  chatApproveLinkHref,
  chatDevicesDeclinedHref,
  chatDevicesHref,
} from "@/navigation/chat";
import { chatApi } from "./api";
import styles from "./chat.module.css";
import { ChatIcon } from "./chat-icon";
import { loadedPath } from "./chat-provider";
import { ReadyChat } from "./chat-setup";
import { DeclineLink } from "./decline-link";
import { deviceName } from "./device-names";
import type { ChatEngine, MatchedLinkRequest } from "./engine";
import { chatErrorMessage } from "./messages";
import { Notice } from "./notice";
import { Points } from "./points";
import { hasScanner, Scanner, type ShownLink } from "./scanner";
import { messageTime } from "./time";

/** Approving is a bounded task, started from Mine enheter (UX-IA-013). */
const header = (title: string, task = true) => (
  <PageHeader
    title={title}
    back={{ href: chatDevicesHref, label: "Mine enheter" }}
    home="conversations"
    task={task}
  />
);

/**
 * «Tidligere meldinger» (12): history moves only when the user chooses it
 * (ADR-0010 §5), so «Bare nye meldinger» is chosen at first.
 */
const historyChoices = [
  {
    move: false,
    label: "Bare nye meldinger",
    help: "Enheten ser meldinger fra nå av. Tidligere meldinger blir på enhetene som har dem.",
  },
  {
    move: true,
    label: "Overfør meldingene herfra",
    help: "Krypteres til den nye enheten. Bare det som ligger på denne enheten, følger med.",
  },
] as const;

/** Gi denne enheten tilgang (12): what approving means, then the choice. */
function Confirm({
  request,
  busy,
  approve,
}: {
  request: ChatLinkRequest;
  busy: boolean;
  approve: (moveHistory: boolean) => void;
}) {
  const router = useRouter();
  const [move, setMove] = useState(false);
  return (
    <>
      {header("Gi denne enheten tilgang til privat chat?")}
      <div className={styles.stack}>
        <div className={`card ${styles.deviceRow}`}>
          <span className={styles.iconBubble}>
            <ChatIcon name="device" />
          </span>
          <span className={styles.linkText}>
            <strong>{deviceName(request)}</strong>
            <small>Ba om tilgang kl. {messageTime(request.createdAt)}</small>
          </span>
        </div>
        <Points
          points={[
            {
              icon: "conversations",
              text: "Den kan lese og sende meldinger fra nå av.",
            },
            {
              icon: "shield",
              text: "Godkjenn bare hvis det er din enhet og du har den foran deg.",
            },
          ]}
        />
        <fieldset>
          <legend>Tidligere meldinger</legend>
          {historyChoices.map((choice) => {
            const id = `historikk-${choice.move ? "overfor" : "nye"}`;
            return (
              <div key={id}>
                <div className="checkbox">
                  <input
                    id={id}
                    type="radio"
                    name="historikk"
                    checked={move === choice.move}
                    aria-describedby={`${id}-hjelp`}
                    onChange={() => setMove(choice.move)}
                  />
                  <label htmlFor={id}>{choice.label}</label>
                </div>
                <p id={`${id}-hjelp`} className="help">
                  {choice.help}
                </p>
              </div>
            );
          })}
        </fieldset>
        <BusyButton
          type="button"
          className="button-primary"
          busy={busy}
          onClick={() => approve(move)}
        >
          Godkjenn enheten
        </BusyButton>
        <DeclineLink
          request={request}
          label="Ikke godkjenn"
          onDeclined={() =>
            router.push(chatDevicesDeclinedHref(request.deviceId))
          }
        />
      </div>
    </>
  );
}

function Approve({ engine }: { engine: ChatEngine }) {
  // Mine enheter opens the field for the code with `?kode`.
  const [mode, setMode] = useState<"scan" | "code">(() =>
    hasScanner() && !new URLSearchParams(location.search).has("kode")
      ? "scan"
      : "code",
  );
  const [requests, setRequests] = useState<ChatLinkRequest[]>();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<MatchedLinkRequest>();
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ moved: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    chatApi
      .linkRequests()
      .then(({ requests: list }) => {
        setRequests(list);
        return list;
      })
      .catch((problem: unknown) => {
        setError(chatErrorMessage(problem));
        return [];
      });

  useEffect(() => {
    void refresh();
  }, []);

  async function check(shown: ShownLink) {
    setError(null);
    // The new device may have asked after this page fetched the list.
    const request = await engine.findLinkRequest(await refresh(), shown);
    if (request) setFound(request);
    else setMissing(true);
  }

  async function approve(moveHistory: boolean) {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      await engine.approveLink(found, moveHistory);
      setDone({ moved: moveHistory });
      announce("Enheten er godkjent.");
    } catch (problem) {
      setError(chatErrorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <>
        {header("Ny enhet godkjent", false)}
        <Notice tag="Godkjent" tone="positive" role="status">
          <p>
            {done.moved
              ? "Enheten er godkjent. Meldingene herfra er sendt kryptert til den."
              : "Enheten er godkjent. Den kan lese meldinger som sendes fra nå av."}
          </p>
          <Link href={chatDevicesHref} className="button button-secondary">
            Til Mine enheter
          </Link>
        </Notice>
      </>
    );
  }

  if (found) {
    return (
      <>
        <Confirm
          request={found}
          busy={busy}
          approve={(moveHistory) => void approve(moveHistory)}
        />
        <ErrorText>{error}</ErrorText>
      </>
    );
  }

  const title =
    mode === "scan" ? "Skann koden" : "Skriv inn koden fra den nye enheten";

  return (
    <>
      {header(title)}
      {missing ? (
        <Notice tag="Ingen treff" icon="info" role="alert">
          <p>
            Fant ingen enhet med denne koden. Den kan være skrevet feil, ha
            utløpt eller allerede være brukt.
          </p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setMissing(false);
              setCode("");
            }}
          >
            Skann eller skriv på nytt
          </button>
        </Notice>
      ) : (
        <div className={styles.stack}>
          {requests?.length === 0 && (
            <p className="quiet">
              Ingen enhet venter på godkjenning nå. Åpne Samtaler på den nye
              enheten og velg «Koble til denne enheten» først.
            </p>
          )}
          {mode === "scan" ? (
            <>
              <Scanner onCode={(shown) => void check(shown)} />
              <p>Hold kameraet mot koden på den nye enheten.</p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setMode("code")}
              >
                Skriv inn koden i stedet
              </button>
              <p className={`quiet ${styles.centered}`}>
                Kameraet brukes bare her.
              </p>
            </>
          ) : (
            <form
              className={styles.stack}
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void check({ code });
              }}
            >
              <label htmlFor="link-code">Kode fra den nye enheten</label>
              <input
                id="link-code"
                name="code"
                className="link-code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
                aria-describedby="link-code-help"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <p id="link-code-help" className="help quiet">
                Mellomrom og små bokstaver spiller ingen rolle.
              </p>
              <button type="submit">Fortsett</button>
              {hasScanner() && (
                <button
                  type="button"
                  className="button-quiet"
                  onClick={() => setMode("scan")}
                >
                  Skann koden i stedet
                </button>
              )}
            </form>
          )}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
}

/**
 * On an existing device (10–12, ADR-0010 §5): the only page that may use
 * the camera. Reached by navigating inside the app, the page still runs
 * under the first page's headers, without the camera, so it is loaded anew.
 */
const noSubscription = () => () => undefined;

export function ApproveLink() {
  const loaded = useSyncExternalStore(
    noSubscription,
    () => loadedPath() === chatApproveLinkHref,
    () => false,
  );

  useEffect(() => {
    if (loadedPath() !== chatApproveLinkHref) location.reload();
  }, []);

  if (!loaded) return null;

  return (
    <ReadyChat header={header("Godkjenn en ny enhet")}>
      {(engine) => <Approve engine={engine} />}
    </ReadyChat>
  );
}

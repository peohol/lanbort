"use client";

import type { ChatLinkRequest } from "@lanbort/contracts";
import { readLinkQr } from "@lanbort/e2ee";
import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { announce } from "@/components/announcer";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { chatApproveLinkHref, chatDevicesHref } from "@/navigation/chat";
import { chatApi } from "./api";
import { loadedPath } from "./chat-provider";
import { ReadyChat } from "./chat-setup";
import type { ChatEngine } from "./engine";
import { chatErrorMessage } from "./messages";

/** The browser's QR reader, where there is one (Chromium; not all browsers). */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare const BarcodeDetector:
  (new (options: { formats: string[] }) => BarcodeDetectorLike) | undefined;

const hasScanner = () =>
  typeof BarcodeDetector !== "undefined" &&
  typeof navigator.mediaDevices?.getUserMedia === "function";

/** Reads link QR codes from the camera until one is found or it is stopped. */
function Scanner({
  onCode,
}: {
  onCode: (shown: { code: string; linkKey: Uint8Array }) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    const detector = new BarcodeDetector!({ formats: ["qr_code"] });

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stopped) {
          const found = await detector.detect(video.current);
          const shown = found
            .map(({ rawValue }) => readLinkQr(rawValue))
            .find((value) => value !== undefined);
          if (shown) {
            onCode(shown);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch {
        setError(
          "Fikk ikke brukt kameraet. Skriv inn koden fra den nye enheten i stedet.",
        );
      }
    })();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onCode]);

  return (
    <>
      <video ref={video} className="scanner" muted playsInline />
      <ErrorText>{error}</ErrorText>
    </>
  );
}

function Approve({ engine }: { engine: ChatEngine }) {
  const [requests, setRequests] = useState<ChatLinkRequest[]>();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<ChatLinkRequest>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
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

  async function check(shown: { code: string; linkKey?: Uint8Array }) {
    setError(null);
    setScanning(false);
    // The new device may have asked after this page fetched the list.
    const list = await refresh();
    const request = await engine.findLinkRequest(list, shown);
    if (!request) {
      setError(
        "Fant ingen enhet som viser denne koden. Sjekk at koden er riktig, og at den nye enheten fortsatt venter.",
      );
      return;
    }
    setFound(request);
  }

  async function approve() {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      await engine.approveLink(found);
      setDone(true);
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
        <h1>Godkjenn en ny enhet</h1>
        <p role="status">
          Enheten er godkjent. Den kan lese meldinger som sendes fra nå av.
        </p>
        <p className="link-row">
          <Link href={chatDevicesHref}>Til Mine enheter</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Godkjenn en ny enhet</h1>
      <p className="link-row">
        <Link href={chatDevicesHref}>Mine enheter</Link>
      </p>
      {found ? (
        <>
          <p>
            En enhet ba om tilgang{" "}
            {new Date(found.createdAt).toLocaleTimeString("nb-NO", {
              timeStyle: "short",
            })}
            , og koden stemmer. Godkjenn bare hvis det er din enhet. Den får
            lese meldinger som sendes etter dette, men ikke det som er sendt
            før.
          </p>
          <BusyButton type="button" busy={busy} onClick={() => void approve()}>
            Godkjenn enheten
          </BusyButton>
          <button type="button" onClick={() => setFound(undefined)}>
            Avbryt
          </button>
        </>
      ) : (
        <>
          {requests?.length === 0 && (
            <p className="quiet">
              Ingen enhet venter på godkjenning nå. Åpne Samtaler på den nye
              enheten og velg «Koble til denne enheten» først.
            </p>
          )}
          {hasScanner() &&
            (scanning ? (
              <Scanner onCode={(shown) => void check(shown)} />
            ) : (
              <button type="button" onClick={() => setScanning(true)}>
                Skann koden med kameraet
              </button>
            ))}
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void check({ code });
            }}
          >
            <label htmlFor="link-code">Kode fra den nye enheten</label>
            <input
              id="link-code"
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <button type="submit">Finn enheten</button>
          </form>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
}

/**
 * On an existing device (ADR-0010 §5): the only page that may use the
 * camera. Reached by navigating inside the app, the page still runs under
 * the first page's headers, without the camera, so it is loaded anew.
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
    <ReadyChat header={<h1>Godkjenn en ny enhet</h1>}>
      {(engine) => <Approve engine={engine} />}
    </ReadyChat>
  );
}

"use client";

import { readLinkQr } from "@lanbort/e2ee";
import { useEffect, useRef, useState } from "react";
import { ErrorText } from "@/components/error-text";
import styles from "./chat.module.css";

/** The browser's QR reader, where there is one (Chromium; not all browsers). */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare const BarcodeDetector:
  (new (options: { formats: string[] }) => BarcodeDetectorLike) | undefined;

/** Whether this browser can read a QR code from the camera. */
export const hasScanner = () =>
  typeof BarcodeDetector !== "undefined" &&
  typeof navigator.mediaDevices?.getUserMedia === "function";

export interface ShownLink {
  code: string;
}

/** Reads link QR codes from the camera until one is found or it is stopped. */
export function Scanner({ onCode }: { onCode: (shown: ShownLink) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The camera keeps running while the page re-renders around it.
  const found = useRef(onCode);
  useEffect(() => {
    found.current = onCode;
  }, [onCode]);

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
          const codes = await detector.detect(video.current);
          const shown = codes
            .map(({ rawValue }) => readLinkQr(rawValue))
            .find((value) => value !== undefined);
          if (shown) {
            found.current(shown);
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
  }, []);

  return (
    <>
      <div className={styles.camera}>
        <video ref={video} className="scanner" muted playsInline />
      </div>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

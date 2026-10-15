"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorText } from "./error-text";
import qr from "./qr.module.css";

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

/**
 * Reads QR codes from the camera until one `read` accepts is found, or it
 * is stopped. What a code means is the caller's: a device link and a
 * friend code are told apart by `read`, never by the camera. Only pages
 * whose headers allow the camera can use it (`usesCamera`).
 */
export function QrScanner<T>({
  read,
  onCode,
  failure,
}: {
  read: (content: string) => T | undefined;
  onCode: (value: T) => void;
  /** What to say, and do instead, when the camera cannot be used. */
  failure: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The camera keeps running while the page re-renders around it.
  const latest = useRef({ read, onCode, failure });
  useEffect(() => {
    latest.current = { read, onCode, failure };
  }, [read, onCode, failure]);

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
          const value = codes
            .map(({ rawValue }) => latest.current.read(rawValue))
            .find((found) => found !== undefined);
          if (value !== undefined) {
            latest.current.onCode(value);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch {
        setError(latest.current.failure);
      }
    })();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <>
      <div className={qr.camera}>
        <video ref={video} className="scanner" muted playsInline />
      </div>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

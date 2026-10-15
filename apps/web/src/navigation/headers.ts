import { chatApproveLinkHref } from "./chat";
import { friendScanHref } from "./routes";

/**
 * The only pages that may use the camera, each to scan a QR code: approving
 * a new device for private chat (ADR-0010 §13) and another person's friend
 * code (PS-USR-014). Every other page's headers forbid it.
 */
const cameraPages: ReadonlySet<string> = new Set([
  chatApproveLinkHref,
  friendScanHref,
]);

export const usesCamera = (pathname: string) => cameraPages.has(pathname);

/**
 * In the browser: the path the page's document was loaded with, not
 * navigated to since. Its security headers are that path's.
 */
export function loadedPath(): string {
  const entry = performance.getEntriesByType("navigation")[0];
  return entry ? new URL(entry.name).pathname : location.pathname;
}

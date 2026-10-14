import { logoSvg } from "@/presentation/logo";

export const contentType = "image/svg+xml";

/** The browser tab's icon: Lånbort's mark on white (presentation/logo.ts). */
export default function Icon() {
  return new Response(logoSvg(), { headers: { "Content-Type": contentType } });
}

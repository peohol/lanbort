import { route } from "@/server/http/route";
import { startTotpEnrollment } from "@/server/security";

/** Starts adding an authenticator app; the answer holds the QR code. */
export const POST = route.user(async (context) =>
  Response.json(await startTotpEnrollment(context), { status: 201 }),
);

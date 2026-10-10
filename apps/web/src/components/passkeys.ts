import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";
import { type ApiFailureCode, postJson } from "./api-client";
import { type ErrorMessages, errorMessage } from "./error-messages";

/**
 * A platform steward's passkey ceremonies in the browser (ADR-0011): the
 * server starts each one and checks the answer; the browser or phone draws
 * its own dialog in between. Only the server's own API is called.
 */

/** Why a ceremony did not finish: the API's code, or the device's. */
export type PasskeyFailure =
  ApiFailureCode | "cancelled" | "unsupported" | "already_registered";

export type PasskeyResult<T> =
  { ok: true; data: T } | { ok: false; failure: PasskeyFailure };

interface Ceremony {
  readonly challengeId: string;
  readonly options: object;
}

const passkeysApi = "/api/account/passkeys";

/** What the device said, as a failure the steward can act on. */
function deviceFailure(error: unknown): PasskeyFailure {
  if (error instanceof WebAuthnError) {
    if (error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
      return "already_registered";
    }
    if (error.code === "ERROR_CEREMONY_ABORTED") return "cancelled";
  }

  // NotAllowedError: the steward closed the dialog, or it timed out.
  return error instanceof Error && error.name === "NotAllowedError"
    ? "cancelled"
    : "unsupported";
}

async function ceremony<T>(
  step: string,
  begin: object,
  run: (options: object) => Promise<unknown>,
  finish: (challengeId: string, response: unknown) => object,
): Promise<PasskeyResult<T>> {
  if (!browserSupportsWebAuthn()) return { ok: false, failure: "unsupported" };

  const started = await postJson<Ceremony>(`${passkeysApi}/${step}`, begin);

  if (!started.ok) return { ok: false, failure: started.code };

  let response: unknown;

  try {
    response = await run(started.data.options);
  } catch (error) {
    return { ok: false, failure: deviceFailure(error) };
  }

  const finished = await postJson<T>(
    `${passkeysApi}/${step}/finish`,
    finish(started.data.challengeId, response),
  );

  return finished.ok ? finished : { ok: false, failure: finished.code };
}

/** Confirms this session with one of the steward's passkeys. */
export const confirmWithPasskey = () =>
  ceremony<{ confirmedAt: string }>(
    "confirmation",
    {},
    (options) =>
      startAuthentication({
        optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
      }),
    (challengeId, response) => ({ challengeId, response }),
  );

/**
 * Adds a passkey, vouched for by the enrollment code for the first one, or
 * by the session's fresh confirmation. It confirms the session too.
 */
export const addPasskey = ({
  name,
  enrollmentCode,
}: {
  name: string;
  enrollmentCode?: string | undefined;
}) =>
  ceremony<{ passkeyId: string }>(
    "registration",
    enrollmentCode ? { enrollmentCode } : {},
    (options) =>
      startRegistration({
        optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
      }),
    (challengeId, response) => ({ challengeId, name, response }),
  );

const passkeyMessages: Record<
  Exclude<PasskeyFailure, ApiFailureCode>,
  string
> = {
  cancelled:
    "Passkeyen ble ikke brukt. Prøv igjen når du er klar, eller bruk en annen enhet.",
  unsupported:
    "Denne nettleseren eller enheten kan ikke bruke passkeys for Lånbort. Prøv en annen nettleser eller enhet.",
  already_registered:
    "Denne passkeyen er allerede lagt til. Bruk en annen enhet eller nøkkel.",
};

/** What a failed ceremony means, with `specific` words where it was made. */
export function passkeyErrorMessage(
  failure: PasskeyFailure,
  specific: ErrorMessages = {},
): string {
  return failure in passkeyMessages
    ? passkeyMessages[failure as keyof typeof passkeyMessages]
    : errorMessage(failure as ApiFailureCode, {
        invalid_input:
          "Passkeyen kunne ikke bekreftes. Prøv igjen, eller bruk en annen.",
        stronger_authentication_required:
          "Det er mer enn 10 minutter siden du bekreftet. Bekreft med passkey igjen.",
        ...specific,
      });
}

"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { type ApiFailureCode, postJson } from "./api-client";
import { BusyButton } from "./busy-button";
import { emailInUseMessages, errorMessage } from "./error-messages";
import { ErrorText, fieldErrorProps } from "./error-text";

/** UX-JRN-001 step 3: real name and 18+ confirmation, then on to `next`. */
export function RegistrationForm({ next = "/" }: { next?: string }) {
  const router = useRouter();
  const [realName, setRealName] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailureCode | null>(null);
  // One key per form: a retry after a network error cannot register twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await postJson(
      "/api/account/registration",
      { realName, adultConfirmed },
      { idempotencyKey },
    );

    if (!result.ok) {
      setPending(false);
      setError(result.code);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
      <label htmlFor="real-name">Fullt navn</label>
      <p id="real-name-help" className="help">
        Bruk ditt virkelige navn, slik andre kjenner deg.
      </p>
      <input
        id="real-name"
        name="realName"
        autoComplete="name"
        {...fieldErrorProps(error, "registration-error", "real-name-help")}
        required
        maxLength={100}
        value={realName}
        onChange={(event) => setRealName(event.target.value)}
      />
      <div className="checkbox">
        <input
          id="adult"
          name="adultConfirmed"
          type="checkbox"
          required
          checked={adultConfirmed}
          onChange={(event) => setAdultConfirmed(event.target.checked)}
        />
        <label htmlFor="adult">Jeg bekrefter at jeg er 18 år eller eldre</label>
      </div>
      <BusyButton type="submit" busy={pending}>
        Fullfør
      </BusyButton>
      <ErrorText id="registration-error">
        {error && errorMessage(error, emailInUseMessages)}
      </ErrorText>
    </form>
  );
}

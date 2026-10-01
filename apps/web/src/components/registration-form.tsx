"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { postJson } from "./api-client";
import { errorMessage } from "./error-messages";

/** UX-JRN-001 step 3: real name and 18+ confirmation. */
export function RegistrationForm() {
  const router = useRouter();
  const [realName, setRealName] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(errorMessage(result.code));
      return;
    }

    router.replace("/");
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
        aria-describedby="real-name-help"
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
      <button type="submit" disabled={pending}>
        Fullfør
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

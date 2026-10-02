"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "./api-client";
import { errorMessage } from "./error-messages";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    const result = await postJson("/api/auth/sign-out", {});

    if (!result.ok) {
      setPending(false);
      setError(errorMessage(result.code));
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => void signOut()} disabled={pending}>
        Logg ut
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}

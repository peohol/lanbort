"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "./api-client";
import { BusyButton } from "./busy-button";
import { errorMessage } from "./error-messages";
import { ErrorText } from "./error-text";

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
      <BusyButton type="button" onClick={() => void signOut()} busy={pending}>
        Logg ut
      </BusyButton>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

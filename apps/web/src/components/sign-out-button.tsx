"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { postJson } from "./api-client";
import { BusyButton } from "./busy-button";
import { errorMessage } from "./error-messages";
import { ErrorText } from "./error-text";

export function SignOutButton({
  className,
  children = "Logg ut",
}: {
  className?: string;
  children?: ReactNode;
}) {
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
      <BusyButton
        type="button"
        className={className}
        onClick={() => void signOut()}
        busy={pending}
      >
        {children}
      </BusyButton>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

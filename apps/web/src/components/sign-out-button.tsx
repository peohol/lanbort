"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { deleteChatStoresAtSignOut } from "@/chat/store";
import { type ApiResult, postJson } from "./api-client";
import { BusyButton } from "./busy-button";
import { errorMessage } from "./error-messages";
import { ErrorText } from "./error-text";

/**
 * Ends the sign-in, and then the chat this browser holds (ADR-0010 §7): a
 * device's chat only works in the sign-in it was made in, so nothing of it
 * is left behind. A device whose chat is running revokes itself first
 * (`/samtaler/logg-ut`).
 */
export async function signOut(userId: string): Promise<ApiResult<unknown>> {
  const result = await postJson("/api/auth/sign-out", {});

  if (result.ok) {
    await deleteChatStoresAtSignOut(userId);
  }

  return result;
}

export function SignOutButton({
  userId,
  className,
  children = "Logg ut",
}: {
  /** The signed-in account, whose chat this browser deletes. */
  userId: string;
  className?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    const result = await signOut(userId);

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
        onClick={() => void run()}
        busy={pending}
      >
        {children}
      </BusyButton>
      <ErrorText>{error}</ErrorText>
    </>
  );
}

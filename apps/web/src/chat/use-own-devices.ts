"use client";

import type { OwnChatDevices } from "@lanbort/contracts";
import { useEffect, useState } from "react";
import { chatApi } from "./api";
import { chatErrorMessage } from "./messages";

/**
 * «Mine enheter» as the server has it: the account's devices and its
 * recovery key. Fetched again when `version` changes.
 */
export function useOwnDevices(version = 0): {
  devices: OwnChatDevices | undefined;
  error: string | null;
} {
  const [devices, setDevices] = useState<OwnChatDevices>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chatApi
      .devices()
      .then((own) => {
        setDevices(own);
        setError(null);
      })
      .catch((problem: unknown) => setError(chatErrorMessage(problem)));
  }, [version]);

  return { devices, error };
}

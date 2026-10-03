"use client";

import type {
  NotificationChannel,
  NotificationLevel,
} from "@lanbort/contracts";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { postJson } from "./api-client";
import { errorMessage } from "./error-messages";

/**
 * One configurable channel of one notification level (PS-COM-003). The
 * choice only decides how the user is told, never anything in a loan.
 */
export function PreferenceSwitch({
  level,
  channel,
  label,
  enabled,
}: {
  level: NotificationLevel;
  channel: NotificationChannel;
  label: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [checked, setChecked] = useState(enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setChecked(next);
    setPending(true);
    setError(null);
    const result = await postJson("/api/notifications/preferences", {
      level,
      channel,
      enabled: next,
    });
    setPending(false);

    if (!result.ok) {
      setChecked(!next);
      setError(errorMessage(result.code));
      return;
    }

    router.refresh();
  }

  return (
    <div className="checkbox">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(event) => void change(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

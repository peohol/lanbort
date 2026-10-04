"use client";

import type {
  NotificationChannel,
  NotificationLevel,
} from "@lanbort/contracts";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { announce } from "./announcer";
import { postJson } from "./api-client";
import { errorMessage } from "./error-messages";
import { ErrorText } from "./error-text";

/**
 * One configurable channel of one notification level (PS-COM-003). The
 * choice only decides how the user is told, never anything in a loan. It
 * is saved at once, and saying so is announced (UX-A11Y-009).
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

    announce("Varslingsvalget er lagret.");
    router.refresh();
  }

  return (
    <div className="checkbox">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        // Not disabled: that would drop the keyboard focus (UX-A11Y-003).
        aria-disabled={pending || undefined}
        onChange={(event) => {
          if (!pending) void change(event.target.checked);
        }}
      />
      <label htmlFor={id}>{label}</label>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

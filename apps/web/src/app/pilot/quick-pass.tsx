"use client";

import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { useCommand } from "@/components/use-command";
import { deviceOf, platformOf } from "@/presentation/pilot";

/**
 * «Bestått» in one tap (pilot-ui.md «Ett testkort, få trykk»): a run in
 * production on this device, with no tester and no help needed. Anything
 * else is recorded on the test's own page.
 */
export function QuickPass({
  campaignId,
  testId,
}: {
  campaignId: string;
  testId: string;
}) {
  const command = useCommand({
    path: "/api/pilot/runs",
    done: `${testId} bestått`,
  });

  return (
    <>
      <BusyButton
        type="button"
        className="button-secondary"
        aria-label={`Registrer ${testId} som bestått`}
        busy={command.pending}
        onClick={() =>
          void command.run({
            campaignId,
            testId,
            status: "passed",
            environment: "production",
            device: deviceOf(navigator.userAgent),
            platform: platformOf(navigator.userAgent),
            helped: false,
            testerId: null,
          })
        }
      >
        Bestått
      </BusyButton>
      <ErrorText>{command.error}</ErrorText>
    </>
  );
}

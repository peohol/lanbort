import { readNotificationPreferences } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PreferenceSwitch } from "@/components/preference-switch";
import { notificationLevelLabels } from "@/presentation/notifications";
import { pageQuery, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Varslingsvalg – Lånbort" };

const channelLabels = { in_app: "I appen", email: "På e-post" } as const;

/** Which notifications come where, per level (PS-COM-002, PS-COM-003). */
export default async function NotificationChoicesPage() {
  await requirePageAccount();
  const preferences = await pageQuery(readNotificationPreferences, {});

  return (
    <main>
      <PageHeader title="Varslingsvalg">
        Påkrevde varsler og varsler som krever handling vises alltid i appen.
      </PageHeader>
      {preferences?.levels.map(({ level, channels }) => (
        <fieldset key={level}>
          <legend>{notificationLevelLabels[level]}</legend>
          {channels.map(({ channel, enabled, configurable }) =>
            configurable ? (
              <PreferenceSwitch
                key={channel}
                level={level}
                channel={channel}
                label={channelLabels[channel]}
                enabled={enabled}
              />
            ) : (
              <p key={channel} className="help">
                {channelLabels[channel]}: alltid på
              </p>
            ),
          )}
        </fieldset>
      ))}
    </main>
  );
}

import type { NotificationPreferences } from "@lanbort/contracts";
import { readNotificationPreferences } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { PreferenceSwitch } from "@/components/preference-switch";
import { notificationLevelLabels } from "@/presentation/notifications";
import { chatEnabled } from "@/server/env";
import { pageQuery, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Varslingsvalg – Lånbort" };

const channelLabels = { in_app: "I appen", email: "På e-post" } as const;

/** New messages in private chat are chosen on their own (PS-COM-018). */
const chatMessageChoices = {
  in_app: { label: "Nye meldinger i appen", help: "I bjellen, uten innhold" },
  email: { label: "Nye meldinger på e-post", help: "Uten navn og innhold" },
} as const;

function ChatMessageChoices({
  preferences,
}: {
  preferences: NotificationPreferences;
}) {
  const channels =
    preferences.kinds.find(({ kind }) => kind === "chat.new_messages")
      ?.channels ?? [];

  return (
    <fieldset>
      <legend>Privat chat</legend>
      {channels.map(({ channel, enabled }) => (
        <PreferenceSwitch
          key={channel}
          subject={{ kind: "chat.new_messages" }}
          channel={channel}
          {...chatMessageChoices[channel]}
          enabled={enabled}
        />
      ))}
      <p className="help">
        Sikkerhet for privat chat er påkrevd: varsler om ny enhet og
        tilbakestilling kan ikke slås av.
      </p>
      <p className="help">
        Å slå av varsler endrer ingenting i samtalene. Meldingene kommer
        fortsatt, og ny melding markeres i Samtaler. Én samtale kan også dempes
        fra «Om samtalen».
      </p>
    </fieldset>
  );
}

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
                subject={{ level }}
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
      {chatEnabled() && preferences && (
        <ChatMessageChoices preferences={preferences} />
      )}
    </main>
  );
}

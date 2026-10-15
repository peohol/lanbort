"use client";

import type { FriendInvitation } from "@lanbort/contracts";
import { type FormEvent, useRef, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { formBody, formValues } from "@/components/form-body";
import { useCommand } from "@/components/use-command";
import { invitationSentText } from "@/presentation/friend-invitations";

/**
 * An e-mail address, and for those who may invite new people, whether to
 * ask to be friends too (off at first). Everyone else asks to be friends:
 * that is all an address can lead to for them (PS-USR-013, PS-USR-015).
 * The confirmation is the same whatever the address is.
 */
export function InviteForm({ mayInvite }: { mayInvite: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const [sent, setSent] = useState<FriendInvitation | null>(null);
  const command = useCommand<FriendInvitation>({
    path: "/api/social/invitations",
    done: mayInvite ? "Invitasjonen er sendt" : "Forespørselen er sendt",
    messages: { invalid_input: "Skriv inn en gyldig e-postadresse." },
    // Read again, the page would start over and lose the confirmation.
    after: "stay",
    onDone: (invitation) => {
      setSent(invitation);
      form.current?.reset();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(null);
    void command.run(
      formBody(
        formValues(event.currentTarget),
        mayInvite ? {} : { befriend: true },
      ),
    );
  }

  const help = "Adressen brukes bare til denne invitasjonen.";

  return (
    // POST, so an address sent before the page is ready never ends up in
    // the address bar or a server log.
    <form
      ref={form}
      method="post"
      onSubmit={submit}
      aria-busy={command.pending}
    >
      <Field id="invite-email" label="E-postadresse" help={help}>
        <input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="off"
          inputMode="email"
          spellCheck={false}
          required
          maxLength={320}
          {...describedBy("invite-email", help)}
        />
      </Field>
      {mayInvite && (
        <div className="checkbox">
          <input id="invite-befriend" name="befriend" type="checkbox" />
          <label htmlFor="invite-befriend">Spør også om å bli venner</label>
        </div>
      )}
      <div className="actions">
        <BusyButton type="submit" busy={command.pending}>
          {mayInvite ? "Send invitasjon" : "Send forespørsel"}
        </BusyButton>
      </div>
      <ErrorText>{command.error}</ErrorText>
      <p role="status">{sent && invitationSentText(sent, mayInvite)}</p>
    </form>
  );
}

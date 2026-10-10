"use client";

import type { PlatformLookupResult } from "@lanbort/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { postJson } from "@/components/api-client";
import { BusyButton } from "@/components/busy-button";
import { describedBy, Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { passkeyErrorMessage } from "@/components/passkeys";
import { lookupOf } from "@/navigation/stewardship";
import { type InquiryKind, inquiryKinds } from "@/presentation/inquiry";

export type Found = NonNullable<PlatformLookupResult["found"]>;

/**
 * A steward finds an account or a thing from its full e-mail address or
 * the link to its page, never by searching (OD-0055); the server logs each
 * lookup. `onFound` says why what was found cannot be picked here, or null
 * when it can. A confirmation that ran out since the page was drawn is
 * asked for once, and the lookup tried again.
 */
export function SubjectLookup({
  id,
  kind,
  confirm,
  onFound,
  onChange,
}: {
  id: string;
  kind: InquiryKind;
  /** A passkey confirmation; anything but null means it was made. */
  confirm: () => Promise<unknown>;
  onFound: (found: Found) => string | null;
  /** Whatever was found no longer stands. */
  onChange: () => void;
}) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const texts = inquiryKinds[kind];
  // The latest lookup; an answer to an earlier one, or one that arrives
  // after this field is gone, no longer stands.
  const lookups = useRef(0);
  useEffect(
    () => () => {
      lookups.current += 1;
    },
    [],
  );

  /** What was found no longer stands, nor a lookup still on its way. */
  function forget() {
    lookups.current += 1;
    setNote(null);
    setLooking(false);
    onChange();
  }

  async function lookUp(event: FormEvent) {
    event.preventDefault();
    forget();
    const lookup = lookupOf(kind, query);

    if (!lookup) {
      setNote(texts.unreadable);
      return;
    }

    const current = lookups.current;
    setLooking(true);
    const send = () =>
      postJson<PlatformLookupResult>("/api/platform/lookups", lookup);
    let result = await send();
    if (
      !result.ok &&
      result.code === "stronger_authentication_required" &&
      (await confirm()) !== null
    ) {
      result = await send();
    }
    if (current !== lookups.current) return;
    setLooking(false);

    if (!result.ok) {
      setNote(passkeyErrorMessage(result.code));
    } else if (!result.data.found) {
      setNote(texts.none);
    } else {
      setNote(onFound(result.data.found));
    }
  }

  return (
    <form onSubmit={(event) => void lookUp(event)}>
      <Field id={id} label={texts.field} help={texts.help}>
        <input
          id={id}
          type="text"
          inputMode={kind === "user" ? "email" : "url"}
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={2000}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            forget();
          }}
          {...describedBy(id, true)}
        />
      </Field>
      <div className="actions">
        <BusyButton type="submit" busy={looking} busyNote="finner …">
          <Icon name="find" />
          Finn
        </BusyButton>
      </div>
      <div role="status">{note && <p className="help">{note}</p>}</div>
    </form>
  );
}

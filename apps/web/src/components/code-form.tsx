"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

/** One numeric code field with a submit button, focused when shown. */
export function CodeForm(props: {
  id: string;
  label: string;
  submitLabel: string;
  pending: boolean;
  onSubmit(code: string): void;
  children?: React.ReactNode;
}) {
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  function submit(event: FormEvent) {
    event.preventDefault();
    props.onSubmit(code);
  }

  return (
    <form onSubmit={submit} aria-busy={props.pending}>
      {props.children}
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        ref={input}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        required
        value={code}
        onChange={(event) => setCode(event.target.value.trim())}
      />
      <button type="submit" disabled={props.pending}>
        {props.submitLabel}
      </button>
    </form>
  );
}

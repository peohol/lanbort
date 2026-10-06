import type { ReactNode } from "react";

/**
 * The tones a status can have. A tone only adds colour; the words beside it
 * always say the same (UX-A11Y-005).
 */
export type Tone = "neutral" | "waiting" | "positive" | "warning" | "danger";

export const toneClass = (tone: Tone) =>
  tone === "neutral" ? "" : `tone-${tone}`;

/** A short status in words, such as «Venter på svar». */
export function Tag({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={`tag ${toneClass(tone)}`.trim()}>{children}</span>;
}

/**
 * Where something is seen or comes from (UX-PRIV-003), such as an
 * environment or «Venner». `label` says what kind of context it is to
 * assistive technology and to the eye.
 */
export function ContextTag({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="tag tag-context">
      <span className="visually-hidden">{label}: </span>
      {children}
    </span>
  );
}

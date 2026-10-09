import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

/**
 * The tones a status can have (Tomat): `attention` is what waits on the
 * reader («Venter på deg»), `waiting` what waits on someone else. A tone
 * only adds colour and an icon; the words beside it always say the same
 * (UX-A11Y-005).
 */
export type Tone =
  "neutral" | "attention" | "waiting" | "positive" | "warning" | "danger";

export const toneClass = (tone: Tone) =>
  tone === "neutral" ? "" : `tone-${tone}`;

/** The icon a status of each tone carries unless told otherwise. */
export const toneIcons: Record<Tone, IconName | null> = {
  neutral: null,
  attention: "attention",
  waiting: "clock",
  positive: "check",
  warning: "warning",
  danger: "warning",
};

/** A short status in words, such as «Venter på svar». */
export function Tag({
  tone = "neutral",
  icon = toneIcons[tone],
  children,
}: {
  tone?: Tone;
  /** Another icon than the tone's, or none. */
  icon?: IconName | null;
  children: ReactNode;
}) {
  return (
    <span className={`tag ${toneClass(tone)}`.trim()}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

/**
 * Where something is seen or comes from (UX-PRIV-003, UX-IA-015), such as
 * an environment or «Direkte mellom venner». `label` says what kind of
 * context it is to assistive technology.
 */
export function ContextTag({
  label,
  icon,
  children,
}: {
  label: string;
  /** Usually `environment` for an environment and `people` for friends. */
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className="tag-context">
      {icon && <Icon name={icon} />}
      <span className="visually-hidden">{label}: </span>
      {children}
    </span>
  );
}

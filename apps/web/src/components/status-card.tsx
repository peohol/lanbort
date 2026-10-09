import type { ReactNode } from "react";
import { Icon } from "./icon";
import { type Tone, toneClass, toneIcons } from "./tag";

/**
 * The status card (UX-INT-001, UX-INT-004, UX-IA-008): a short human
 * status, the time it is about, who has to act, the next step and a way to
 * more. Only what is relevant is shown. The tone is an icon beside the
 * words, never instead of them (UX-A11Y-005).
 */
export function StatusCard({
  id = "status",
  heading = "Status",
  status,
  tone = "neutral",
  when,
  who,
  actions,
  more,
  children,
}: {
  id?: string;
  /** Said to assistive technology as the card's heading. */
  heading?: string;
  status: ReactNode;
  tone?: Tone;
  when?: ReactNode;
  /** Who has to act, as in «Venter på at Kari bekrefter retur». */
  who?: ReactNode;
  /** The next step first: one primary action, then secondary ones. */
  actions?: ReactNode;
  /** Usually `MoreActions` or a link to the history. */
  more?: ReactNode;
  children?: ReactNode;
}) {
  const icon = toneIcons[tone];

  return (
    <section
      className={`status-card ${toneClass(tone)}`.trim()}
      aria-labelledby={id}
    >
      <h2 id={id} className="visually-hidden">
        {heading}
      </h2>
      <p className="status-text">
        {icon && <Icon name={icon} />}
        <span>{status}</span>
      </p>
      {when && <p className="status-meta">{when}</p>}
      {who && <p className="waiting">{who}</p>}
      {children}
      {actions && <div className="actions">{actions}</div>}
      {more}
    </section>
  );
}

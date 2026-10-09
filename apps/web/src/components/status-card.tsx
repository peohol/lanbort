import { Children, type ReactNode } from "react";
import { Icon } from "./icon";
import { Tag, type Tone, toneClass, toneIcons } from "./tag";

/**
 * The status card (UX-INT-001, UX-INT-004, UX-IA-008): a short human
 * status, the time it is about, who has to act, the next step and a way to
 * more. Only what is relevant is shown. The tone is an icon beside the
 * words, never instead of them (UX-A11Y-005): in the `label` above the
 * status where there is one («Venter på deg», «Avtalt»), else beside it.
 */
export function StatusCard({
  id = "status",
  heading = "Status",
  label,
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
  /** A short state above the status, as a `Tag` in the card's tone. */
  label?: ReactNode;
  status: ReactNode;
  tone?: Tone;
  when?: ReactNode;
  /** Who has to act, as in «Venter på at Kari bekrefter retur». */
  who?: ReactNode;
  /** The next step first: one primary action, then secondary ones. */
  actions?: ReactNode;
  /** Usually `MoreActions` or a link to the history. */
  more?: ReactNode;
  /** What explains the status, in quieter text under it. */
  children?: ReactNode;
}) {
  const icon = label ? null : toneIcons[tone];

  return (
    <section
      className={`status-card ${toneClass(tone)}`.trim()}
      aria-labelledby={id}
    >
      <h2 id={id} className="visually-hidden">
        {heading}
      </h2>
      {label && <Tag tone={tone}>{label}</Tag>}
      <p className="status-text">
        {icon && <Icon name={icon} />}
        <span>{status}</span>
      </p>
      {when && <p className="status-meta">{when}</p>}
      {who && <p className="waiting">{who}</p>}
      {Children.toArray(children).length > 0 && (
        <div className="status-body">{children}</div>
      )}
      {actions && <div className="actions">{actions}</div>}
      {more}
    </section>
  );
}

import type { ReactNode } from "react";

/**
 * A form field (WP-80): the label, its help and the control, with the help
 * tied to the control for assistive technology. The control is the child
 * and carries `id` itself; pass `describedBy(id, help)` to it, and add
 * `fieldErrorProps` when the error is about this field.
 */
export function Field({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {help && (
        <p id={helpId(id)} className="help">
          {help}
        </p>
      )}
      {children}
    </div>
  );
}

export const helpId = (id: string) => `${id}-hjelp`;

/** The control's link to its help text, when it has one. */
export function describedBy(id: string, help: unknown) {
  return help ? { "aria-describedby": helpId(id) } : {};
}

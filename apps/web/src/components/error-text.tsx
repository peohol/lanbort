import type { ApiFailureCode } from "./api-client";

/** What went wrong, said at once (UX-A11Y-004); nothing when nothing did. */
export function ErrorText({
  id,
  children,
}: {
  id?: string;
  children: string | null;
}) {
  return children ? (
    <p id={id} role="alert" className="error">
      {children}
    </p>
  ) : null;
}

/**
 * WCAG 3.3.1: a field the error is about is marked invalid and points to
 * the words, so assistive technology says both together. `described` keeps
 * the field's own help text.
 */
export function fieldErrorProps(
  code: ApiFailureCode | null,
  errorId: string,
  described?: string,
) {
  const invalid = code === "invalid_code" || code === "invalid_input";
  const describedBy = [described, invalid ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return {
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy || undefined,
  };
}

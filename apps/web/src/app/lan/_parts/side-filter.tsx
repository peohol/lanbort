import type { LoanRequestRole } from "@lanbort/contracts";

/** UX-IA-006: one surface, filtered by side; `?side=` in the address. */
const sides = [
  { value: undefined, label: "Alle" },
  { value: "borrower", label: "Låner" },
  { value: "lender", label: "Låner bort" },
] as const;

/** The side the address asks for, if it names one. */
export function sideOf(
  value: string | string[] | undefined,
): LoanRequestRole | undefined {
  return sides.find((side) => side.value === value)?.value;
}

/** The address of `pathname` on one side, or on both. */
export const sideHref = (
  pathname: string,
  side: LoanRequestRole | undefined,
) => (side ? `${pathname}?side=${side}` : pathname);

/** «Alle», «Låner», «Låner bort» over a list of loans at `pathname`. */
export function SideFilter({
  pathname,
  side,
}: {
  pathname: string;
  side: LoanRequestRole | undefined;
}) {
  return (
    <nav aria-label="Vis lån" className="filters">
      {sides.map(({ value, label }) => (
        <a
          key={label}
          href={sideHref(pathname, value)}
          aria-current={value === side ? "page" : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

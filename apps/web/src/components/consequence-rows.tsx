import type { ConsequenceRow } from "@/presentation/interventions";
import { Icon } from "./icon";

/**
 * What a step does, one line each, marked by whether it ends something,
 * goes on or is otherwise worth knowing (UX-INT-007, «Plattformforvaltning
 * v1»).
 */
export function ConsequenceRows({ rows }: { rows: readonly ConsequenceRow[] }) {
  return (
    <ul className="consequence-rows">
      {rows.map((row) => (
        <li key={row.text} className={row.tone}>
          <Icon name={row.icon} />
          <span>{row.text}</span>
        </li>
      ))}
    </ul>
  );
}

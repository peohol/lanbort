"use client";

import { useState } from "react";
import { describedBy, Field } from "@/components/field";
import { followingEnd } from "@/presentation/loan-status";

const endHelp =
  "Flytter seg med overleveringen, så lånet varer like lenge. Du kan endre den.";

/**
 * A new handover day and return day (PS-LOAN-010, KF7): when the handover
 * day moves, the return day moves with it, so the loan keeps its length;
 * it can then be changed on its own, never to before the handover.
 */
export function PeriodFields({
  defaults,
  min,
}: {
  defaults: { start: string; end: string };
  /** The first day the handover may move to. */
  min: string;
}) {
  const [period, setPeriod] = useState(defaults);

  return (
    <>
      <Field id="ny-start" label="Overlevering">
        <input
          id="ny-start"
          name="period.start"
          type="date"
          required
          min={min}
          value={period.start}
          onChange={({ target }) =>
            setPeriod({
              start: target.value,
              end: followingEnd(period, target.value),
            })
          }
        />
      </Field>
      <Field id="ny-slutt" label="Leveres tilbake" help={endHelp}>
        <input
          id="ny-slutt"
          name="period.end"
          type="date"
          required
          min={period.start || min}
          value={period.end}
          {...describedBy("ny-slutt", endHelp)}
          onChange={({ target }) => setPeriod({ ...period, end: target.value })}
        />
      </Field>
    </>
  );
}

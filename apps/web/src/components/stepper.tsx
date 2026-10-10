/**
 * Where the user is in a flow of a few steps: «Steg 2 av 4: Konsekvenser»
 * for assistive technology, and a row of dots with the current step named
 * for the eye (Tomat «Plattformforvaltning v1»).
 */
export function Stepper({
  steps,
  current,
}: {
  steps: readonly string[];
  /** The index of the current step. */
  current: number;
}) {
  return (
    <>
      <p className="visually-hidden">
        Steg {current + 1} av {steps.length}: {steps[current]}
      </p>
      <ol className="stepper" aria-hidden="true">
        {steps.map((step, index) => (
          <li
            key={step}
            className={
              index < current
                ? "done"
                : index === current
                  ? "current"
                  : undefined
            }
          >
            <span>{index === current && step}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

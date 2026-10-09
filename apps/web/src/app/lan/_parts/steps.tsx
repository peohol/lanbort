import { ActionButton } from "@/components/action-button";
import type { LoanStep } from "@/presentation/loan-status";

/** A loan's steps as buttons, each one API command (UX-INT-001). */
export function Steps({ steps }: { steps: readonly LoanStep[] }) {
  return steps.map((step) => (
    <ActionButton
      key={`${step.path} ${step.label}`}
      label={step.label}
      path={step.path}
      body={step.body}
      primary={step.primary ?? false}
      {...(step.next && { next: step.next })}
    />
  ));
}

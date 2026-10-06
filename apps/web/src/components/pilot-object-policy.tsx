import {
  pilotObjectPolicy,
  pilotObjectPolicySummary,
} from "@/presentation/object-policy";

/**
 * PS-OBJ-019: the pilot's limit for risky things, where things are managed
 * and where they are registered, in the same words.
 */
export function PilotObjectPolicy({ id }: { id?: string }) {
  return (
    <div>
      <p id={id} className="help">
        {pilotObjectPolicySummary}
      </p>
      {pilotObjectPolicy.map((group) => (
        <details key={group.heading}>
          <summary>{group.heading}</summary>
          <ul>
            {group.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

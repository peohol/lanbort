import { ContextTag } from "@/components/tag";
import type { WhereShown as Shown } from "@/presentation/object-owners";

/**
 * Where an owner's thing can be found, as context lines (UX-PRIV-003): the
 * environments by name, friends, or that only its owners see it.
 */
export function whereShownLines(shown: Shown, shared: boolean) {
  if (shown.environments.length === 0 && !shown.friends) {
    return [
      <ContextTag key="private" label="Synlighet" icon="lock">
        Bare synlig for {shared ? "eierne" : "deg"}
      </ContextTag>,
    ];
  }

  return [
    shown.environments.length > 0 && (
      <ContextTag key="environments" label="Vises i" icon="environment">
        {shown.environments.join(", ")}
      </ContextTag>
    ),
    shown.friends && (
      <ContextTag key="friends" label="Vises for" icon="people">
        Venner
      </ContextTag>
    ),
  ];
}

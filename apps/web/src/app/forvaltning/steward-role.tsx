import { Icon } from "@/components/icon";
import { Tag } from "@/components/tag";
import { formatClock } from "@/presentation/dates";
import type { Stewardship } from "@/server/stewardship";
import styles from "../saker/cases.module.css";

/**
 * «Du forvalter for Lånbort» (UX-PRIV-005): the capacity the steward acts
 * in, above everything they do in it, with how long this session's
 * confirmation counts (with fewer than two passkeys it only lets them add
 * one; the status card says what is closed). Nothing is said about it while the role is off.
 */
export function StewardRole({ steward }: { steward: Stewardship }) {
  return (
    <p className={styles.role}>
      <Icon name="shield" />
      Du forvalter for Lånbort
      {steward.enabled && (
        <span className={styles.roleEnd}>
          {steward.freshUntil ? (
            <Tag tone="positive">
              Bekreftet til {formatClock(steward.freshUntil)}
            </Tag>
          ) : (
            <Tag>Ikke bekreftet</Tag>
          )}
        </span>
      )}
    </p>
  );
}

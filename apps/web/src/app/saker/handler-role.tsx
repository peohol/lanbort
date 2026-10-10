import { Icon } from "@/components/icon";
import styles from "./cases.module.css";

/**
 * The capacity the reader acts in (UX-PRIV-005): above a queue or a case
 * they handle, so what they write and do reads as the administrators', not
 * as their own.
 */
export function HandlerRole({ environment }: { environment: string | null }) {
  return (
    <p className={styles.role}>
      <Icon name="shield" />
      {environment
        ? `Du behandler som administrator i ${environment}`
        : "Du behandler saken for Lånbort"}
    </p>
  );
}

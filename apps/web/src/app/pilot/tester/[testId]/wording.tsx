import type { PilotTestDetail } from "@lanbort/contracts";
import styles from "../../pilot.module.css";

type Wording = PilotTestDetail["wording"];

/**
 * What the tester is told (pilot-ui.md «Ett testkort»): what to have ready,
 * the steps in order and what must be seen to pass. Under `Heading`, so it
 * fits both the test card and an earlier wording in the history.
 */
export function PilotWording({
  wording,
  heading: Heading,
}: {
  wording: Wording;
  heading: "h2" | "h3";
}) {
  const parts = [
    { title: "Før du starter", items: wording.prepare, List: "ul" },
    { title: "Slik gjør du det", items: wording.steps, List: "ol" },
    { title: "Testen er bestått når", items: wording.passWhen, List: "ul" },
  ] as const;

  return (
    <div className={styles.wording}>
      <Heading>Forventet resultat</Heading>
      <p>{wording.expected}</p>
      {parts.map(
        ({ title, items, List }) =>
          items.length > 0 && (
            <div key={title}>
              <Heading>{title}</Heading>
              <List>
                {items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </List>
            </div>
          ),
      )}
    </div>
  );
}

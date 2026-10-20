import { readPilotTasks } from "@lanbort/domain";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { formatShortTime } from "@/presentation/dates";
import { pilotOutcomeLabels, pilotOutcomeTones } from "@/presentation/pilot";
import { pageQueryOrNotFound } from "@/server/session";
import styles from "../pilot.module.css";
import { TaskReport } from "./task-report";

export const metadata: Metadata = { title: "Mine pilotoppgaver – Lånbort" };

/**
 * «Mine pilotoppgaver» (pilot-ui.md): a participant's own open tasks, each a
 * short goal to try in Lånbort, and how it went. Nothing about the tests,
 * the other participants or the lead's results.
 */
export default async function PilotTasksPage() {
  const { pseudonym, tasks } = await pageQueryOrNotFound(readPilotTasks, {});

  return (
    <main>
      <PageHeader title="Mine pilotoppgaver" home="home">
        Prøv hver oppgave i Lånbort på egen hånd, og si fra hvordan det gikk. Du
        er {pseudonym} i piloten.
      </PageHeader>

      {tasks.length === 0 ? (
        <EmptyState>Du har ingen oppgaver akkurat nå.</EmptyState>
      ) : (
        <ul className={styles.history}>
          {tasks.map((task) => (
            <li key={task.assignmentId} className="card">
              <h2 className={styles.quote}>{task.goal}</h2>
              {task.latest && (
                <p>
                  Sist sa du:{" "}
                  <Tag tone={pilotOutcomeTones[task.latest.outcome]}>
                    {pilotOutcomeLabels[task.latest.outcome]}
                  </Tag>{" "}
                  <span className={styles.meta}>
                    {formatShortTime(task.latest.reportedAt)}
                  </span>
                </p>
              )}
              <TaskReport assignmentId={task.assignmentId} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

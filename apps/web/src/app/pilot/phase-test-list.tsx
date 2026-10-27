import type { PilotTestSummary } from "@lanbort/contracts";
import { MenuList, MenuRow } from "@/components/menu-list";
import { Tag } from "@/components/tag";
import { pilotTestHref } from "@/navigation/pilot";
import {
  visiblePilotPhaseGroups,
  pilotPhaseIntroductions,
  pilotStatusLabels,
  pilotStatusTones,
} from "@/presentation/pilot";
import { QuickPass } from "./quick-pass";
import styles from "./pilot.module.css";

/**
 * The tests follow the human journey: first the phase and its purpose, then
 * themes and (only when needed) kinds of tasks. Catalogue codes remain internal.
 * Unfinished phases are folded so the first visit is not a 98-row list.
 */
export function PhaseTestList({
  tests,
  currentPhase,
  campaignId,
  expandMatches,
  showClosingPhase,
}: {
  tests: readonly PilotTestSummary[];
  currentPhase: number | null;
  campaignId: string | null;
  expandMatches: boolean;
  showClosingPhase: boolean;
}) {
  const phases = visiblePilotPhaseGroups(
    tests,
    currentPhase,
    showClosingPhase,
  );

  return (
    <div className={styles.phaseGroups}>
      {phases.map((group) => {
        const current = group.phase.number === currentPhase;
        const defaultOpen = group.phase.number === (currentPhase ?? 0);

        return (
          <section
            key={group.phase.number}
            className={styles.phasePanel}
            aria-labelledby={`phase-${group.phase.number}`}
          >
            <div className={styles.phaseIntro}>
              <h3 id={`phase-${group.phase.number}`}>
                {group.phase.number}. {group.phase.name}{" "}
                {current && <Tag tone="attention">Nå</Tag>}
              </h3>
              <p>{pilotPhaseIntroductions[group.phase.number]}</p>
              <p className={styles.meta}>
                {group.phase.when} · {group.total}{" "}
                {group.total === 1 ? "oppgave" : "oppgaver"}
                {group.total > 0 && ` · ${group.passed} bestått`}
              </p>
            </div>

            {group.total === 0 ? (
              <p className={styles.meta}>
                Her følger vi med på bruken og samler erfaringer. Ingen faste
                testoppgaver er lagt til denne fasen.
              </p>
            ) : (
              <details
                className={styles.phaseDisclosure}
                open={expandMatches || defaultOpen}
              >
                <summary>Oppgaver i denne fasen ({group.total})</summary>
                <div className={styles.phaseContents}>
                  {group.areas.map((area) => {
                    const areaId = `phase-${group.phase.number}-${area.area.code}`;

                    return (
                      <section
                        key={area.area.code}
                        className={styles.phaseArea}
                        aria-labelledby={areaId}
                      >
                        <h4 id={areaId}>{area.area.name}</h4>
                        {area.kinds.map((kind) => {
                          const kindId = `${areaId}-${kind.priority}`;
                          const showKindTitle = area.kinds.length > 1;

                          return (
                            <div
                              key={kind.priority}
                              className={styles.phaseKind}
                            >
                              {showKindTitle && (
                                <h5 id={kindId}>{kind.label}</h5>
                              )}
                              <MenuList label={showKindTitle ? kindId : areaId}>
                                {kind.tests.map((test) => (
                                  <MenuRow
                                    key={test.id}
                                    href={pilotTestHref(test.id)}
                                    label={test.action}
                                    detail={
                                      <>
                                        <Tag
                                          tone={pilotStatusTones[test.status]}
                                        >
                                          {pilotStatusLabels[test.status]}
                                        </Tag>
                                        {test.assignees.length > 0 &&
                                          ` · ${test.assignees.join(", ")}`}
                                        {test.openDefects > 0 &&
                                          ` · ${test.openDefects} åpne feil`}
                                      </>
                                    }
                                    actions={
                                      campaignId !== null &&
                                      test.status !== "passed" && (
                                        <QuickPass
                                          campaignId={campaignId}
                                          testId={test.id}
                                        />
                                      )
                                    }
                                  />
                                ))}
                              </MenuList>
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                </div>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

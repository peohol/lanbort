import type { ReactNode } from "react";
import { type AreaId, areaAt } from "@/navigation/areas";
import { PlaceBar, TaskBar } from "./place-bar";

/**
 * The top of a page (WP-80, UX-IA-015): the way back along the navigation
 * stack, what kind of page it is («Ting», «Person»), its title, the context
 * it is seen in (UX-PRIV-003, as `ContextTag`s) and a short lead. Areas'
 * own pages need no way back; detail pages say where they belong, and a
 * form says where it was started from and becomes a bounded task.
 */
export function PageHeader({
  title,
  label = typeof title === "string" ? title : undefined,
  kind,
  picture,
  back,
  home,
  task = false,
  context,
  children,
}: {
  title: ReactNode;
  /** The page's name in the way back to it, when the title is not text. */
  label?: string | undefined;
  /** The type of a detail, such as «Lån» or «Person» (UX-IA-015). */
  kind?: string;
  /** The picture of the person the page is about, beside its title. */
  picture?: ReactNode;
  /**
   * Where the page lies by the rule (UX-IA-011): its home area's own page,
   * or a fixed container such as a queue. For a form, where it was opened
   * from. The way back follows the stack the user is in.
   */
  back?: { href: string; label: string };
  /** The home area (UX-IA-010), when `back` is not its own page. */
  home?: AreaId;
  /** A form: no areas, no stack, and «Avbryt» (UX-IA-013). */
  task?: boolean;
  context?: ReactNode;
  /** A short lead under the title. */
  children?: ReactNode;
}) {
  const backArea = back && areaAt(back.href);
  const homeArea = home ?? backArea ?? "home";
  const container = back && !backArea ? back : undefined;
  const heading = (
    <>
      {kind && <p className="page-kind">{kind}</p>}
      <h1>{title}</h1>
    </>
  );

  return (
    <header className="page-header" data-task={task || undefined}>
      {task && back ? (
        <TaskBar from={{ ...back, home: homeArea }} />
      ) : (
        label && (
          <PlaceBar
            place={{ label, home: homeArea, container }}
            located={Boolean(back || home)}
          />
        )
      )}
      {picture ? (
        <div className="page-title-row">
          <div className="page-picture">{picture}</div>
          <div>{heading}</div>
        </div>
      ) : (
        heading
      )}
      {context && <div className="tags">{context}</div>}
      {children && <p className="page-lead">{children}</p>}
    </header>
  );
}

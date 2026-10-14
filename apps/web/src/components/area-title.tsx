import { type AreaId, areaById } from "@/navigation/areas";
import { Icon } from "./icon";

/**
 * The title of an area's own page, with the icon the main navigation
 * shows for the area (UX-IA-001), so the page and the menu look alike.
 */
export function AreaTitle({
  area,
  className,
}: {
  area: AreaId;
  className?: string | undefined;
}) {
  return (
    <h1 className={className ? `area-title ${className}` : "area-title"}>
      <Icon name={area} />
      {areaById(area).label}
    </h1>
  );
}

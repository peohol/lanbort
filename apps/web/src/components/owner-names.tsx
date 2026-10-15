import type { ShownOwner } from "@lanbort/contracts";
import { Fragment } from "react";
import { listSeparator } from "@/presentation/objects";
import { PersonName } from "./person-name";

/**
 * A thing's owners as a member sees them (PS-ENV-015), each linked to their
 * page while the reader may open it, or `plain` inside a card, said as a
 * list: «Anna, Bo og Cleo».
 */
export function OwnerNames({
  owners,
  plain = false,
}: {
  owners: readonly ShownOwner[];
  plain?: boolean;
}) {
  return owners.map((owner, index) => (
    <Fragment key={index}>
      {listSeparator(index, owners.length)}
      <PersonName person={owner} role="lender" plain={plain} />
    </Fragment>
  ));
}

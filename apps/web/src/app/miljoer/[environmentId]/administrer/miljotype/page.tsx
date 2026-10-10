import {
  type AdministrationParams,
  AdministrationHeader,
  administrationMetadata,
  loadAdministrationTask,
} from "../administration";
import { EnvironmentTypeChoices } from "../type";

export const metadata = administrationMetadata("type");

/** The environment's type and how it can change (PS-ENV-007–008). */
export default async function EnvironmentTypePage({
  params,
}: {
  params: AdministrationParams;
}) {
  const { environment } = await loadAdministrationTask(params);

  return (
    <main>
      <AdministrationHeader environment={environment} page="type" />
      <EnvironmentTypeChoices environment={environment} />
    </main>
  );
}

import {
  type AdministrationParams,
  AdministrationHeader,
  administrationMetadata,
  loadAdministrationTask,
} from "../administration";
import { Settings } from "../settings";

export const metadata = administrationMetadata("settings");

/** Name, details, area and requirements (PS-ENV-005–006). */
export default async function SettingsPage({
  params,
}: {
  params: AdministrationParams;
}) {
  const { environment } = await loadAdministrationTask(params);

  return (
    <main>
      <AdministrationHeader environment={environment} page="settings" />
      <Settings environment={environment} />
    </main>
  );
}

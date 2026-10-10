import { runAgainstDatabase } from "./ops-domain";
import { runStewardPasskeysCommand } from "./steward-passkeys-command";

await runAgainstDatabase((domain) =>
  runStewardPasskeysCommand(domain, process.argv.slice(2)),
);

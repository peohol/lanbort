import { runAgainstDatabase } from "./ops-domain";
import { runPlatformRoleCommand } from "./platform-role-command";

await runAgainstDatabase((domain) =>
  runPlatformRoleCommand(domain, process.argv.slice(2), {
    announceKey: (key) =>
      console.error(`Idempotency key: ${key} (reuse it to retry safely)`),
  }),
);

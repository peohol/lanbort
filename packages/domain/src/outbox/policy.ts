import { definePolicy } from "../authorization/policy";
import { requireSystemProcess } from "../authorization/rules";

/** Name of the scheduled job that drains the outbox. */
export const outboxWorkerProcess = "outbox.worker";

export const processOutboxPolicy = definePolicy({
  action: "outbox.process",
  actor: [requireSystemProcess(outboxWorkerProcess)],
});

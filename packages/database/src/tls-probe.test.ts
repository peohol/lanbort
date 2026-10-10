// Temporary: proves verified TLS against the hosted pooler from CI. Removed before merge.
import { Client } from "pg";
import { rootCertificates } from "node:tls";
import { describe, expect, it } from "vitest";
import { connectionTls } from "./tls";

const url = "postgresql://tls_probe.abgivjcloxembtnzfnyv:none@aws-0-eu-north-1.pooler.supabase.com:6543/postgres";

async function attempt(ssl: unknown) {
  const client = new Client({ connectionString: url, ssl: ssl as never, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    return "connected";
  } catch (error) {
    return String((error as Error).message);
  } finally {
    await client.end().catch(() => undefined);
  }
}

describe.runIf(process.env.TLS_PROBE === "1")("hosted pooler TLS", () => {
  it("passes certificate and host name checks with connectionTls", async () => {
    const message = await attempt(connectionTls(url));
    console.log("with connectionTls:", message);
    expect(message).not.toMatch(/certificate|self.signed|altname|ssl|tls/i);
  });

  it("fails without Supabase's CA, so the certificate really is checked", async () => {
    const message = await attempt({ ca: [...rootCertificates], rejectUnauthorized: true });
    console.log("public CAs only:", message);
    expect(message).toMatch(/certificate/i);
  });
});

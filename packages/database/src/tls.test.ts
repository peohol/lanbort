import { describe, expect, it } from "vitest";
import { SUPABASE_ROOT_CA } from "./supabase-root-ca";
import { connectionTls } from "./tls";

describe("connectionTls", () => {
  it.each([
    "postgresql://lanbort_app:secret@127.0.0.1:54322/postgres",
    "postgresql://lanbort_app:secret@localhost:54322/postgres",
    "postgresql://lanbort_app:secret@[::1]:54322/postgres",
  ])("connects to a local database without TLS (%s)", (url) => {
    expect(connectionTls(url)).toBeUndefined();
  });

  it("verifies a hosted database against Supabase's CA and the public ones", () => {
    const tls = connectionTls(
      "postgresql://lanbort_app.ref:secret@aws-0-eu-north-1.pooler.supabase.com:6543/postgres",
    );
    expect(tls?.rejectUnauthorized).toBe(true);
    expect(tls?.checkServerIdentity).toBeUndefined();
    expect(tls?.ca).toContain(SUPABASE_ROOT_CA);
    expect((tls?.ca as string[]).length).toBeGreaterThan(1);
  });

  it("requires verified TLS for any other host as well", () => {
    expect(
      connectionTls("postgresql://u:p@db.example.org/postgres")
        ?.rejectUnauthorized,
    ).toBe(true);
  });
});

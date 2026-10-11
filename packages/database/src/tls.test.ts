import { X509Certificate } from "node:crypto";
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

  it.each([
    "postgresql://u:p@db.example.org/postgres?sslmode=disable",
    "postgresql://u:p@db.example.org/postgres?sslmode=no-verify",
    "postgresql://u:p@db.example.org/postgres?ssl=0",
    "postgresql://u:p@db.example.org/postgres?sslmode=require&uselibpqcompat=true",
    "postgresql://u:p@db.example.org/postgres?sslrootcert=/tmp/ca.pem",
    "postgresql://u:p@db.example.org/postgres?hostaddr=203.0.113.7",
  ])("refuses a hosted database with TLS of its own (%s)", (url) => {
    expect(() => connectionTls(url)).toThrow("leave TLS to the app");
  });

  it.each([
    // pg would connect to the host parameter, or to PGHOST, without TLS.
    "postgresql://u:p@localhost/postgres?host=db.example.org",
    "postgresql:///postgres",
  ])("refuses a connection string whose host is elsewhere (%s)", (url) => {
    expect(() => connectionTls(url)).toThrow("must name its host");
  });

  it("lets a local database ask for TLS itself", () => {
    expect(
      connectionTls(
        "postgresql://u:p@127.0.0.1:54322/postgres?sslmode=disable",
      ),
    ).toBeUndefined();
  });

  it("trusts a Supabase CA that is valid for at least another year", () => {
    // Supabase announces a new CA well ahead; add it beside this one.
    const validTo = new Date(new X509Certificate(SUPABASE_ROOT_CA).validTo);
    const inAYear = new Date();
    inAYear.setFullYear(inAYear.getFullYear() + 1);

    expect(validTo.getTime()).toBeGreaterThan(inAYear.getTime());
  });
});

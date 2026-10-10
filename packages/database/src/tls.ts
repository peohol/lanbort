import { rootCertificates, type ConnectionOptions } from "node:tls";
import { SUPABASE_ROOT_CA } from "./supabase-root-ca";

const localHosts = new Set(["", "localhost", "127.0.0.1", "[::1]"]);

/**
 * TLS for a database connection. A database on this machine (local
 * development, CI, the restore drill) is reached without it. Any other is
 * reached only over TLS with a verified certificate and host name, trusting
 * Supabase's own CA as well as the public ones. An `sslmode` in the
 * connection string still takes precedence.
 */
export function connectionTls(
  connectionString: string,
): ConnectionOptions | undefined {
  if (localHosts.has(new URL(connectionString).hostname)) return undefined;
  return {
    ca: [...rootCertificates, SUPABASE_ROOT_CA],
    rejectUnauthorized: true,
  };
}

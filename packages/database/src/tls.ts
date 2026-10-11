import { rootCertificates, type ConnectionOptions } from "node:tls";
import { SUPABASE_ROOT_CA } from "./supabase-root-ca";

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Parameters with which a connection string would choose another host or
 * its own TLS, over the verified TLS below.
 */
const overridingParameters = [
  "host",
  "hostaddr",
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslpassword",
  "uselibpqcompat",
];

/**
 * TLS for a database connection. A database on this machine (local
 * development, CI, the restore drill) is reached without it, unless the
 * connection string asks for it. Any other is reached only over TLS with a
 * verified certificate and host name, trusting Supabase's own CA as well as
 * the public ones; a connection string that would choose another host or
 * weaker TLS for it is refused, as is one without a host.
 */
export function connectionTls(
  connectionString: string,
): ConnectionOptions | undefined {
  const url = new URL(connectionString);

  if (url.hostname === "" || url.searchParams.has("host")) {
    throw new Error("The database connection string must name its host.");
  }

  if (localHosts.has(url.hostname)) return undefined;

  if (overridingParameters.some((name) => url.searchParams.has(name))) {
    throw new Error(
      "The database connection string must leave TLS to the app.",
    );
  }

  return {
    ca: [...rootCertificates, SUPABASE_ROOT_CA],
    rejectUnauthorized: true,
  };
}

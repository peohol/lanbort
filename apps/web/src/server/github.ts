/**
 * The only place the server reads GitHub, for the pilot's readiness checks
 * (`pilot-readiness.ts`): the repository this deployment was built from,
 * read through GitHub's public REST API. It only reads, and reads only
 * what anyone may read about a public repository. `GITHUB_READ_TOKEN`, a
 * token without permissions, is optional and only raises GitHub's limit
 * on how often the server may ask.
 */

export interface GitHubRepository {
  readonly owner: string;
  readonly name: string;
}

/** The repository Vercel built this deployment from, or none elsewhere. */
export function deployedRepository(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GitHubRepository | null {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const name = env.VERCEL_GIT_REPO_SLUG;

  return env.VERCEL_GIT_PROVIDER === "github" && owner && name
    ? { owner, name }
    : null;
}

/** GitHub did not answer, or not with what was asked for. */
export class GitHubUnavailableError extends Error {
  constructor(readonly reason: "limited" | "unavailable") {
    super(`GitHub ${reason}`);
  }
}

export type GitHubGet = <T>(path: string) => Promise<T>;

/** Reads `path` of the repository's API, as JSON. */
export function gitHubReader(
  repository: GitHubRepository,
  {
    fetch: get = fetch,
    token = process.env.GITHUB_READ_TOKEN,
  }: { fetch?: typeof fetch; token?: string | undefined } = {},
): GitHubGet {
  const base = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;

  return async <T>(path: string) => {
    let response: Response;

    try {
      response = await get(`${base}${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new GitHubUnavailableError("unavailable");
    }

    if (
      response.status === 429 ||
      (response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0")
    ) {
      throw new GitHubUnavailableError("limited");
    }

    if (!response.ok) {
      throw new GitHubUnavailableError("unavailable");
    }

    return (await response.json()) as T;
  };
}

/** Where a person sees the repository, or a part of it, on GitHub. */
export const gitHubPage = (repository: GitHubRepository, path = "") =>
  `https://github.com/${repository.owner}/${repository.name}${path}`;

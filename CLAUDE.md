## Purpose

This file contains only durable, repository-wide instructions that are useful in almost every Claude Code session.

Treat it as a concise operating manual, not as project documentation, memory, a changelog, or a work log.

## Keep this file small

Protect this file from gradual growth.

- Keep `CLAUDE.md` comfortably below 200 lines. Prefer substantially less.
- Before adding a rule, ask: **Would removing this rule predictably cause mistakes in future sessions?** If not, do not add it.
- Prefer replacing, merging, or shortening existing rules over appending new ones.
- Remove obsolete or redundant instructions whenever this file is edited.
- Never add information merely because it may be useful someday.
- Do not copy session notes or auto-memory into this file.

Never store here:

- completed work or implementation history
- changelogs or progress logs
- temporary TODOs
- debugging history
- issue or PR summaries
- detailed API or library documentation
- tutorials or long explanations
- file-by-file descriptions of the repository
- information easily discovered from the code
- information that changes frequently
- standard programming practices Claude already knows

Put information where it belongs:

- path-specific rules → `.claude/rules/` with appropriate `paths`
- reusable task-specific workflows → skills
- human-facing project documentation → `README.md` or `docs/`
- temporary work/status → issue, PR, or current conversation
- implementation history → git
- secrets → the appropriate secret/environment-variable store, never documentation

Do not create new documentation, planning, status, or log files unless they have a clear durable purpose for humans or are explicitly requested.

## Repository owner

Assume the repository owner is the product owner, **not a programmer or system developer**. Communicate with the owner in Norwegian Bokmål.

Assume minimal knowledge of:

- programming
- databases
- servers
- deployment
- terminals and command-line tools
- git
- APIs
- infrastructure

Do not transfer technical work or technical decision-making to the repository owner.

### Default to action

If Claude can safely do something itself, Claude should do it.

Do not ask the owner to:

- edit files
- run commands
- inspect logs
- configure code
- choose libraries or frameworks
- choose database structures
- choose implementation patterns
- choose deployment approaches
- resolve ordinary technical trade-offs
- perform tests Claude can perform itself

Use the available repository, terminal, browser, CLI, MCP, APIs, and other tools before asking the owner to do anything.

When there is a technical choice, make the choice yourself.

Prefer, in order:

1. existing repository conventions
2. the simplest robust solution
3. well-supported and conventional technology
4. low maintenance burden
5. security and reliability
6. reversible changes
7. fewer dependencies and less infrastructure

Do not present several technical options and ask the owner to choose unless the choice materially changes the product itself.

For small and clear tasks, implement directly. For larger, ambiguous, risky, or cross-cutting tasks, inspect the relevant code first and form a plan before editing.

## When the owner may need to act

For technical work, owner involvement should normally be limited to cases Claude genuinely cannot perform itself, especially:

1. physically testing behaviour in a UI or on a device Claude cannot access
2. obtaining, authorizing, or entering keys, tokens, secrets, credentials, or similar protected values

The owner may also need to make genuine **product decisions** where different choices would produce meaningfully different user behaviour and the intended choice cannot reasonably be inferred.

Do not ask the owner questions merely to avoid making a technical decision.

When explicit confirmation requires an exact phrase, always provide that phrase in a standalone code block so the owner can copy it directly.

### Instructions for owner-required technical actions

Before asking the owner to perform a technical step involving an external service:

1. Consult the service's current official documentation when possible.
2. Verify the current names, locations, and workflow instead of relying on memory.
3. Reduce the owner's task to the minimum necessary.
4. Explain it step by step in ordinary language, in Norwegian Bokmål.
5. Say exactly what to click, find, copy, paste, or enter.
6. Avoid unexplained technical terminology.
7. Do not ask the owner to paste secrets into chat or commit them to the repository. Prefer the service's protected secret/environment-variable interface.

If current documentation cannot be verified, say so rather than presenting uncertain instructions as fact.

## Implementation principles

Before changing code:

- inspect the relevant existing code and repository conventions
- check the current git state
- understand the existing behaviour before replacing it
- look for an existing implementation pattern before introducing a new one

While implementing:

- make the smallest coherent change that fully solves the task
- reuse existing abstractions and dependencies when sensible
- avoid unrelated refactoring
- avoid speculative generalization and premature abstractions
- do not add dependencies when a simple existing solution is sufficient
- keep user-facing behaviour backward-compatible unless the task requires otherwise
- clean up temporary files and experimental code before finishing

Do not create complexity merely to make the implementation appear sophisticated.

## Verification

Claude is responsible for verifying its own work as far as the available environment permits.

After changes, run the smallest sufficient set of relevant checks, such as:

- targeted tests
- type checking
- linting
- build
- existing repository-specific validation

Fix failures caused by the change before finishing.

Inspect the final diff for accidental or unrelated changes.

If something cannot be verified without the owner, verify everything else first and then request only the specific remaining UI/device check.

## External services and changing technical information

For libraries, APIs, cloud services, deployment platforms, authentication providers, or other systems that may have changed:

- prefer current official documentation
- use available tools to inspect the actual configuration where possible
- do not guess current dashboard labels, configuration keys, API behaviour, or setup procedures when they can be verified
- do not make the owner investigate information Claude can retrieve itself

## High-impact actions

Do not perform an irreversible or high-impact external action unless it is clearly part of the owner's request.

Examples include:

- deleting production data
- destructive database migrations
- force-pushing shared branches
- deleting projects or infrastructure
- changing billing or subscriptions
- publishing publicly
- rotating or revoking credentials

If such an action is necessary but was not clearly requested, ask for approval of the **action**, not for help deciding the technical implementation.

## Communication with the repository owner

Use the language the owner uses.

Keep completion messages concise and non-technical.

Normally explain only:

1. **What changed** — at a high, everyday-language level.
2. **What this adds or improves** for the app.
3. **Whether the owner needs to decide anything.**
4. **What the owner needs to do**, if anything.

Do not routinely report:

- filenames
- classes or functions
- database internals
- implementation patterns
- commands run
- dependency details
- detailed test output
- technical debugging history

Provide those details only when the owner asks for them or they are necessary to understand a problem.

If no action is required from the owner, say so plainly.

If work is incomplete or something could not be verified, state the remaining limitation clearly in ordinary language.

## Editing CLAUDE.md

Changes to this file should be rare.

Add or change an instruction only when it is:

- durable
- broadly applicable across future sessions
- not readily inferable from the repository
- important enough that forgetting it would likely cause errors or unnecessary owner involvement

When adding a project-specific instruction, integrate it into the shortest appropriate existing section rather than creating another section by default.

Whenever this file grows, actively look for something to remove, consolidate, or move elsewhere.

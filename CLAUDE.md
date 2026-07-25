# Claude Project Instructions

Always use Context7 when library/API documentation, setup, configuration steps, or framework-specific code generation are needed.

Do not commit directly to `main`.
Create a feature branch for changes, commit there, and open a pull request.
Do not merge automatically, even when checks pass — merging requires the same explicit
approval as pushing/opening the PR. Stop and ask before merging.
Before creating a new feature branch, check whether one is already open locally (uncommitted
changes, or a branch ahead of main not yet merged/closed). If so, stop, name the branch and its
state, and ask explicitly whether to continue that work, finish it first, or intentionally start
a second one — never start new work silently on top of an already-open branch.
Merge PRs via squash merge only (the repo is configured to disallow merge commits and rebase merges).

Do not expose or commit secrets.
Never commit `.env` files.
Use `.env.example` and `.env.agent.example` to document required variables.

Application runtime variables belong in `.env`.
Agent/tooling variables belong in `.env.agent`.

After editing `.envrc`, tell the user to run `direnv allow` — direnv blocks the file until it's re-approved.

Before opening any PR, run the `ddd-audit` skill to check whether the branch's changes make any
doc stale — not just `README.md`, but any file under `docs/`, or this file. If something is stale,
update/create it in a separate `docs:` commit before pushing and opening the PR — never fold it
into the feature commit, and never leave it silently out of date.

Prefer simple, maintainable, type-safe code.
For external or untrusted input, use `unknown` instead of `any` and narrow/validate safely.

Before modifying any files, explain the plan first and wait for my explicit approval.
After changes, run relevant tests or explain why they were not run.

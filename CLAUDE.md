# Claude Project Instructions

Always use Context7 when library/API documentation, setup, configuration steps, or framework-specific code generation are needed.

Do not commit directly to `main`.
Create a feature branch for changes, commit there, open a pull request, and only merge automatically when checks pass.
Merge PRs via squash merge only (the repo is configured to disallow merge commits and rebase merges).

Do not expose or commit secrets.
Never commit `.env` files.
Use `.env.example` and `.env.agent.example` to document required variables.

Application runtime variables belong in `.env`.
Agent/tooling variables belong in `.env.agent`.

After editing `.envrc`, tell the user to run `direnv allow` — direnv blocks the file until it's re-approved.

Prefer simple, maintainable, type-safe code.
For external or untrusted input, use `unknown` instead of `any` and narrow/validate safely.

Before modifying any files, explain the plan first and wait for my explicit approval.
After changes, run relevant tests or explain why they were not run.
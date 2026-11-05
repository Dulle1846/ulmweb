# External AI Review Playbook — Kings & Cards

Last checked: 2026-11-05. All options below are intended to cost $0. Do not add a paid API key, paid plan, billing account or trial that can auto-renew. Free allowances and eligibility can change; check the provider's account page before starting a long job.

## Recommended tools and their real role

| Tool | Free access evidence / limitation | Best Kings & Cards use | Recommendation |
|---|---|---|---|
| Google Antigravity / Antigravity CLI | Official pricing lists an Individual plan at $0/month with agent models, unlimited Tab completions, unlimited Command requests and basic weekly rate limits. Higher limits are paid. | Read the repository, propose/refactor a module in an isolated branch, run tests, review diffs. | **Best first external coding agent to try.** Check the free weekly limit in the account; never enable paid credits. |
| GitHub Copilot Free | Official GitHub docs list Copilot Free with limited features, 2,000 inline completions/month and limited agent access. Copilot Free does not include cloud coding agent; chat remains available on GitHub.com/mobile and in IDE contexts. | Inline completions, short code questions, review selected snippets. | **Useful everyday assistant, not a full autonomous repo developer on Free.** |
| ChatGPT Codex Free | OpenAI says Codex is available on Free with the smallest allowance for quick coding tasks; usage is limited and account-dependent. | Small bug fixes, tests, code review, isolated coding tasks. | **Use for short tasks and reviews; do not assume long unattended jobs.** |
| Qwen Code | The agent framework is open source and supports local models via Ollama/vLLM or provider APIs. Current quick start uses Qwen Account with a Plus/Pro subscription or an API provider; the old OAuth free tier should not be assumed available. | Local model review/coding if the user's computer can run a suitable model; no API bill if entirely local. | **Potentially free with local hardware; not a turnkey free hosted model.** |
| Claude Free | Free Claude chat is useful for architecture and code review by pasting bounded excerpts. Do not assume Claude Code CLI is included in the free chat plan. | Read-only second opinion, balance review, test-plan critique. | **Good reviewer, not a confirmed free autonomous coding agent.** |
| Arena Agent Mode | Arena documents GitHub OAuth, isolated repo cloning, file edits, diff review, commits and PR creation. The public pages checked here do not establish a guaranteed $0 Agent Mode quota. | Potentially strong parallel implementation and independent review after verifying the account shows a free allowance. | **Promising, but only use if the account clearly confirms $0 and no paid usage.** Do not connect production branch directly. |

Official references:
- Antigravity pricing: https://antigravity.google/pricing/
- Antigravity CLI: https://antigravity.google/product/antigravity-cli
- GitHub Copilot plans: https://docs.github.com/en/copilot/get-started/plans
- Codex with ChatGPT plans: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Qwen Code: https://github.com/QwenLM/qwen-code
- Qwen local model support is described in its README; local inference avoids API charges but needs suitable hardware.
- Arena coding in Agent Mode: https://arena.ai/blog/coding-in-agent-mode
- Arena Agent Mode guide: https://help.arena.ai/articles/5432423882-how-to-use-agent-mode
- Gemini Code Assist consumer/CLI deprecation: https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals

### Important corrections to common assumptions

- The old Gemini Code Assist for Individuals and its Google-login Gemini CLI access were discontinued on 2026-06-18; Google directs consumer users toward Antigravity. Do not set up the old Gemini Code Assist flow.
- Qwen Code is open source, but that does not mean hosted model inference is free. Do not assume the discontinued free OAuth tier still works.
- Claude chat being free does not make Claude Code CLI free.
- Arena's GitHub-connected coding agent is real, but a public pricing page inspected here did not establish a guaranteed free quota.
- Never give an external agent permission to merge to `ulmweb-branch`, deploy Cloudflare, delete branches or alter secrets.

## Safe operating procedure

1. Create a new branch from current `ulmweb-branch`.
2. Give the agent only one bounded task and this playbook.
3. Ask it to inspect first and return a plan before editing.
4. If it edits, require a branch/PR; no direct production pushes.
5. Require a file list, concise design rationale, tests run, test output and known limitations.
6. Fetch the resulting branch and inspect the diff independently.
7. Run all three project workflows on the exact head.
8. Merge only through the normal PR release gate.

Do not upload secrets, API keys, personal data, production credentials or private user saves to external agents. Repository source code may be processed by the provider under that provider's terms; use only tools whose data handling you accept.

## Prompt A — Antigravity: read-only architecture audit

```text
You are an independent senior game-simulation architect reviewing Kings & Cards.
Repository: Dulle1846/ulmweb
Production branch: ulmweb-branch
Read game/docs/STUDIO_OPERATIONS.md, game/docs/ROADMAP_3.3-4.0.md and game/docs/BRANCH_CONSOLIDATION_AUDIT.md first.

Do not edit files, commit, push, merge, deploy, delete branches, alter secrets or change Cloudflare.
Audit the current production code for:
1. simulation architecture and deterministic random streams;
2. save/load schema, validation, recovery and migration risks;
3. city-builder resource node, logistics and production-chain architecture;
4. performance/memory risks at 160x160 and high population;
5. missing tests and integration risks.

Return: (a) prioritized findings with file paths and exact symbols, (b) a minimal architecture proposal, (c) test cases, (d) risks and estimates. Clearly separate confirmed bugs from design suggestions. Do not invent files or APIs.
```

## Prompt B — Arena Agent Mode: isolated implementation review

```text
Connect only to Dulle1846/ulmweb and create an isolated working branch from ulmweb-branch. Never work on ulmweb-branch directly.

Read game/docs/STUDIO_OPERATIONS.md, game/docs/ROADMAP_3.3-4.0.md and game/docs/BRANCH_CONSOLIDATION_AUDIT.md.
Task: independently review the 3.3 road system and propose the smallest safe next step for 3.4 resource geography. First inspect the existing implementation; do not replace it wholesale.

If you implement anything, limit scope to a single resource-node prototype with deterministic generation, bounded memory, save/load migration and tests. Do not yet implement hauling, production chains, housing or seasons. Do not change public save formats without backward-compatibility tests. Do not merge or deploy.

Before opening a PR, run the project's tests and report exact results, changed files, memory cost, seed determinism, migration behavior and known limitations. If unable to run a check, say so.
```

## Prompt C — Claude Free: design and balance review (manual copy/paste)

```text
Act as a skeptical senior systems designer. Review the attached Kings & Cards city-builder roadmap and the selected code excerpts. Do not write replacement code yet.

Focus on:
- whether wood, planks, stone, grain, flour, bread and water form understandable supply chains;
- worker travel, warehouse reservations and deadlock prevention;
- winter food/heating reserves and immigration gates;
- player-readable warnings and recoverable mistakes;
- tick pacing and economic stability across five in-game years.

Return a balance table, edge cases, exploit paths, missing decisions and a prioritized test plan. Distinguish assumptions from facts in the supplied code.
```

## Prompt D — Copilot Free: small bounded change

```text
Read the relevant modules and tests first. Make only the requested small change in the current feature branch. Preserve existing public exports and save compatibility. Add one focused regression test. Do not modify unrelated files. Do not merge, push to production or deploy. Explain exactly what changed and which tests were run.
```

## Delegation principle

Use Antigravity for the first full-repository read-only audit. Use Arena only after its UI confirms a no-cost allowance and only for an isolated PR. Use Claude Free for design critique. Use Copilot Free for small local edits. Two agents should not edit the same branch or the same module simultaneously.

---
name: pstack-omp
description: Maps the Cursor names in pstack skills to OMP tools, agents, models, and paths. pstack skills read it once per session; poteto-mode embeds it.
disable-model-invocation: true
---

# pstack in OMP

pstack skills use Cursor names. In OMP, read this once per session, then map each Cursor name in a pstack skill with the tables below. When this text arrives embedded in `poteto-mode` or autoloaded into a subagent, it is already read. Do not read it again. `<pstack>` means the plugin folder that holds `skills/`, `agents/`, and `docs/`, two levels up from this file. If a Cursor field has no row, drop it and say so. Never pass a field or value the live tool schema rejects. The live schema wins over this file.

## Tools

| Cursor | OMP |
| --- | --- |
| `Task` | `task`. In batch mode the call is `{context, tasks: [{agent, name, task, solutionSpace}]}`, with `agent` on each item. `solutionSpace` says how open the problem is, not how big it is. With `async.enabled` on, spawns run as background jobs and their results arrive on their own. Do not poll. |
| `AskQuestion` | `ask`. When the session has no `ask` tool, as in `omp -p`, ask in plain text. |
| Open a todolist | `todo`. Copy the playbook's steps in verbatim as its first items. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `skill://<name>` and follow it, unless its body is already in context from `/skill:<name>` or an earlier read. When you tell the user to type it, write `/skill:<name>`. |
| `Read`, `Write`, `StrReplace`, `Shell`, `Grep`, `Glob` | `read`, `write`, `edit`, `bash`, `grep`, `glob`. |
| `WebFetch`, `WebSearch` | `read` on the URL, `web_search`. |

## Subagent fields

An OMP `task` item has no `model`, `subagent_type`, `readonly`, `environment`, `run_in_background`, `resume`, or `file_attachments` field. The agent name picks the model.

| Cursor | OMP |
| --- | --- |
| `subagent_type: generalPurpose` | `agent: "pstack-code"` for code, exploration, verification, and swarm seats. `agent: "pstack-judge"` for prose, review, synthesis, and judgment seats. When the skill names a model, pick the agent from that model's row in Models. |
| `poteto-agent` | `agent: "poteto-agent"` for code delegates. `agent: "poteto-agent-judge"` for the hardest changes and for judgment. Both autoload `poteto-mode`. Still name `skill://poteto-mode` in the brief. |
| `comment-sicko` | `agent: "comment-sicko"`. |
| `readonly: true` | The same agent, and the brief says "do not edit files". This is an instruction, not a sandbox, so check `git status` afterward. `readonly: false` needs nothing. |
| `environment: "cloud"` | `isolated: true` when the `task` schema offers it (`task.isolation.enabled`). Otherwise create a worktree with `git worktree add`, name its path and base commit in the brief, and never run two writers in one checkout. A worktree is not a VM and shares your credentials. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Base the worktree on `<b>`, or tell the worker to check out `<b>` first. |
| `run_in_background: true` | Omit. Spawns are background jobs while `async.enabled` is on. |
| `resume` | Spawn a fresh agent and paste the earlier result into its brief. When the strict reuse case applies (the agent holds a checkout, uncommitted work, or a live process), message it with `write agent://<id>` instead. |
| `file_attachments` | List absolute paths in the brief. |

## Models

Two OMP model roles carry pstack's two model families. `modelRoles.pstack-code` backs `pstack-code` and `poteto-agent`. `modelRoles.pstack-judge` backs `pstack-judge`, `poteto-agent-judge`, and `comment-sicko`. `pstack-parent` has no model of its own, so it runs on the session model unless `task.agentModelOverrides.pstack-parent` sets one. Before the first spawn, run `omp config get modelRoles`. An agent whose role is unset fails to start with `No model selected`. Give each such seat to `pstack-parent` instead, name `skill://poteto-mode` in the brief when it replaces a poteto delegate, and tell the user once that `/skill:setup-pstack` sets the roles. Same-model seats are not model diversity, so never claim it.

| Cursor | OMP |
| --- | --- |
| A `grok-*`, `gpt-*`, `composer-*`, or other non-Claude slug, and every code role | The code agent. `pstack-code`, or `poteto-agent` when the skill spawns a poteto delegate. |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh`, and every judgment, prose, or hardest-task role | The judge agent. `pstack-judge`, or `poteto-agent-judge` when the skill spawns a poteto delegate. |
| `auto` or `inherit-parent` | `pstack-parent`. |
| An effort suffix (`-xhigh`, `-high`) or `-fast` | Drop it. Effort comes from the role's thinking suffix, such as `anthropic/claude-opus-5-5:xhigh`. Pass per-spawn `effort` (`lo`, `med`, `hi`) only when the `task` schema shows it. |
| A two-family panel (arena, architect, interrogate) | One `pstack-code` seat and one `pstack-judge` seat per pair. If both roles resolve to the same family, say so. Same-family seats are not multi-model evidence. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | `~/.omp/agent/pstack-models.md`. Read it when it exists. Each role line names the OMP agent (`pstack-code`, `pstack-judge`, `pstack-parent`, or a panel list of them) for that role. Without the file or the line, use the rows above. |

## setup-pstack

In OMP the choice has two layers. The two `modelRoles` selectors pick the models. The role lines in `~/.omp/agent/pstack-models.md` pick which agent runs each role. Follow the skill's steps with these changes.

- Detect. `omp models --json` lists each model's `selector` (`provider/id`) and the efforts in its `thinking` list.
- Load current state. The current models are `omp config get modelRoles`. The current role lines and `# budget` line come from `~/.omp/agent/pstack-models.md`. Its role values are agent names, not slugs.
- Defaults. The upstream `grok-*` defaults are the code role. The `claude-opus-*` defaults are the judgment role. Map each to a detected selector, or mark it as needing a choice.
- Budget. Set the budget's effort as the `:<effort>` suffix of both `modelRoles` selectors, such as `anthropic/claude-opus-5-5:xhigh`. When the model's `thinking` list lacks that effort, use the highest one it has below it. Role lines carry no effort.
- Confirm. Show both selectors and every role line. A selector can be any detected model. A role line can be `pstack-code`, `pstack-judge`, `pstack-parent`, or, for a panel role, a list of them.
- Validate. Each selector without its suffix equals a detected `selector`, and its suffix is in that model's `thinking` list. Role-line values are agent names, so they always pass. Never write a slug into a role line.
- Write. Run `omp config set modelRoles.pstack-code <selector>` and `omp config set modelRoles.pstack-judge <selector>`. Then write `~/.omp/agent/pstack-models.md` with no frontmatter: the comment lines, the `# budget` line, and one line per role from step 5 with its agent name. Overwrite the whole file. Never put role lines in `AGENTS.md`.

## Paths

| Cursor | OMP |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.omp/skills/`, `~/.omp/agent/skills/`. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `<pstack>`. Read bundled skills through `skill://<name>`. `<pstack>/package.json` holds the version. |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md` at the project root, or `.omp/AGENTS.md`. User-wide rules live in `~/.omp/agent/AGENTS.md`. OMP never reads `.mdc` files. The model rule is the exception. See Models. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when that file exists. The plugin ships the skills and `docs/guide/`. Read the local copy and never fetch it. Give the user the URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | OMP sessions in `~/.omp/agent/sessions/<folder>/<timestamp>_<id>.jsonl`. The first or second line is a `{"type":"session"}` header whose `cwd` is the workspace. A `{"type":"title"}` line can come before it. Messages are `{"type":"message"}` lines whose `message.content` holds the text. Pick the folder whose headers match the workspace. The newest file is the current session. The folder beside it with the same name holds subagent transcripts, and `history://<agent>` renders one. Read only this workspace's sessions. |

## Cursor-only features

OMP has no Cursor Automations, Bugbot, Cursor cloud agents, persistent `/loop` wakes, custom mode, or built-in PR tool. When a step needs one, put one line in your reply, `Skipped in OMP: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line.

| Cursor | OMP |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard. |
| A built-in PR tool | Use the forge command the step gives, such as `gh pr create`. That is not a skip, so write no line. |
| `/loop` | Keep working in this session until the predicate holds. OMP has no wake scheduler that outlives the session, so say so when the task needs one. |
| A custom mode that stays on across turns | Skip with the line. The user re-invokes `/skill:poteto-mode` when they want the mode again. |
| `/visualize` | Draw the diagram as a Mermaid or SVG block in the reply. |
| Cursor's built-in `create-skill` | The bundled `create-skill` skill. |

## Helper limits

`poteto-mode/scripts/worktree-audit.sh` decides liveness from Cursor transcripts, so this plugin's copy exits 2 before it audits anything. Use `git worktree list`, then check each checkout's status, its unpushed commits, and which OMP session owns it. Unknown liveness means keep the checkout. Other helpers keep their own protocols, such as internal `gh --json` calls. Read a helper before you run it.

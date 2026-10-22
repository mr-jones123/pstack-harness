---
name: pstack-pi
description: Maps the Cursor names in pstack skills to Pi tools, child Pi processes, models, and paths. pstack skills read it once per session; poteto-mode embeds it.
disable-model-invocation: true
---

# pstack in Pi

pstack skills use Cursor names. In Pi, read this once per session, then map each Cursor name in a pstack skill with the tables below. When this text arrives embedded in `poteto-mode`, it is already read. Do not read it again. `<pstack>` means the package folder that holds `skills/`, `agents/`, and `docs/`, two levels up from the skill file you are reading. Resolve it to an absolute path once, because child Pi briefs need absolute paths. If a Cursor field has no row, drop it and say so. Never pass a flag or field that Pi rejects.

## Tools

| Cursor | Pi |
| --- | --- |
| `Task` | A child Pi process started with `bash`. See Subagents. If the session has a `subagent` tool from an extension, you may use it instead with one of the agents it lists, and the brief tells the child to read the matching `<pstack>/agents/<agent>.md` first. |
| `AskQuestion` | A question tool if the session has one. Otherwise ask in plain text and end your turn to wait for the answer. |
| Open a todolist | A todo tool if the session has one. Otherwise keep the list in your reply and update it at each phase. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `<pstack>/skills/<name>/SKILL.md` and follow it, unless its body is already in context from `/skill:<name>` or an earlier read. When you tell the user to type it, write `/skill:<name>`. |
| `Read`, `Write`, `StrReplace`, `Shell`, `Grep`, `Glob` | `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls`. When `grep` or `find` is not enabled, use `bash` with `rg`. |
| `WebFetch`, `WebSearch` | A web tool if the session has one. Otherwise `bash` with `curl` for a known URL, and say that search is unavailable. |

## Subagents

Run each subagent as its own child Pi. Write the brief to a file, then start the child with the agent's prompt file appended to its system prompt:

```bash
pi -p --no-session --model "<model>" --append-system-prompt "<pstack>/agents/<agent>.md" @"<dir>/<name>.brief.md" "Follow the attached brief." > "<dir>/<name>.out.md" 2>&1
```

- `<agent>` is `poteto-agent`, `comment-sicko`, or `pstack-worker`. See Subagent fields.
- `<model>` comes from Models. Drop `--model` to run the child on Pi's default model.
- The child sees none of this conversation. The brief carries the goal, the absolute paths it needs, the absolute path of this adapter (`<pstack>/skills/pstack-pi/SKILL.md`), and the report you expect back.
- For parallel work, start each child with a trailing `&` in one `bash` call, then `wait`. Give that call a timeout long enough for the slowest child, or none. Read each `.out.md` when the call returns.
- You own every child's work. Review its diff and output yourself.
- Children run in `-p` mode, which skips untrusted project-local packages. Install pstack user-wide (`pi install` without `-l`) so children load its skills in every project.

| Cursor | Pi |
| --- | --- |
| `subagent_type: generalPurpose` | `pstack-worker`. |
| `poteto-agent` | `poteto-agent`. The brief names the absolute path of `<pstack>/skills/poteto-mode/SKILL.md`. |
| `comment-sicko` | `comment-sicko`. |
| `readonly: true` | Add `--exclude-tools write,edit` to the child, and the brief says "do not edit files". The child keeps `bash` for `git log` and `git blame`, so this is an instruction, not a sandbox. Check `git status` afterward. `readonly: false` needs nothing. |
| `environment: "cloud"` | Create a worktree with `git worktree add`, then start the child inside it (`cd <worktree> && pi -p ...`). Name the base commit in the brief. Never run two writers in one checkout. A worktree is not a VM and shares your credentials. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Base the worktree on `<b>`. |
| `run_in_background: true` | Start the child with a trailing `&`, as above. |
| `resume` | Start a fresh child and paste the earlier result into its brief. |
| `file_attachments` | Add each file as another `@<path>` argument, or list absolute paths in the brief. |

## Models

| Cursor | Pi |
| --- | --- |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | `~/.pi/agent/pstack-models.md`. Read it when it exists. Each role line's value is a Pi model pattern, such as `anthropic/claude-opus-5-5:xhigh`, a list of them for a panel, or `inherit-parent`. |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | The role's line in `pstack-models.md`. Without the file or the line, drop `--model` and say so. |
| A `grok-*`, `gpt-*`, or other non-Claude slug | The role's line in `pstack-models.md`. Without the file or the line, drop `--model` and say so. |
| `auto` or `inherit-parent` | Drop `--model`. |
| An effort suffix (`-xhigh`, `-high`) or `-fast` | The pattern's `:<thinking>` suffix: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Drop `-fast`. |
| A two-family panel (arena, architect, interrogate) | One child per panel entry. Children without `--model` all run on one model, which is not multi-model evidence. Say so. |

## setup-pstack

Follow its steps with these changes.

- Detect. `pi --list-models` lists each `provider` and `model` you can use, and whether it supports thinking. A pattern is `<provider>/<model>`, with a `:<thinking>` suffix only for a model that supports thinking.
- Defaults. Map `claude-opus-5-5-xhigh` to the detected Anthropic Opus model. Map `grok-4.7-xhigh-fast` to a detected xAI Grok model, else mark the role as needing a choice.
- Budget. The budget sets the `:<thinking>` suffix of every pattern (`:max`, `:xhigh`, `:high`, or `:medium`). Replace the whole suffix. Never edit tokens inside the model name. A model without thinking gets no suffix.
- Validate. Each pattern without its suffix equals a detected `<provider>/<model>`. `inherit-parent` and `auto` always pass.
- Write. Write `~/.pi/agent/pstack-models.md` with no frontmatter: the comment lines, the `# budget` line, and one line per role from step 5 with a Pi pattern or `inherit-parent`. Overwrite the whole file. Never put role lines in `AGENTS.md`.

## Paths

| Cursor | Pi |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.pi/skills/`, `~/.pi/agent/skills/`. Pi also reads `.agents/skills/` and `~/.agents/skills/`. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `<pstack>`. `<pstack>/../package.json` holds the version. |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md` in the project or a parent folder. User-wide rules live in `~/.pi/agent/AGENTS.md`. Pi never reads `.mdc` files. The model rule is the exception. See Models. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when that file exists. The package ships the skills and `docs/guide/`. Read the local copy and never fetch it. Give the user the URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | Pi sessions in `~/.pi/agent/sessions/<folder>/<timestamp>_<id>.jsonl`. Pick the folder whose session files have a header line (`"type":"session"`) with `cwd` equal to the workspace. The newest file is the current session. Children started with `--no-session` leave no transcript, so keep their `.out.md` files. Read only this workspace's sessions. |

## Cursor-only features

Pi has no Cursor Automations, Bugbot, Cursor cloud agents, persistent `/loop` wakes, custom mode, or built-in PR tool. When a step needs one, put one line in your reply, `Skipped in Pi: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line.

| Cursor | Pi |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard. |
| A built-in PR tool | Use the forge command the step gives, such as `gh pr create`. That is not a skip, so write no line. |
| `/loop` | Keep working in this session until the predicate holds. Pi has no wake scheduler that outlives the session, so say so when the task needs one. |
| A custom mode that stays on across turns | Skip with the line. The user re-invokes `/skill:poteto-mode` when they want the mode again. |
| `/visualize` | Draw the diagram as a Mermaid block in the reply. |
| Cursor's built-in `create-skill` | The bundled `create-skill` skill. |

## Helper limits

`poteto-mode/scripts/worktree-audit.sh` decides liveness from Cursor transcripts, so this package's copy exits 2 before it audits anything. Use `git worktree list`, then check each checkout's status, its unpushed commits, and which Pi session owns it. Unknown liveness means keep the checkout. Other helpers keep their own protocols, such as internal `gh --json` calls. Read a helper before you run it.

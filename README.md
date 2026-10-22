# pstack for OMP and Pi

[pstack](https://github.com/cursor/plugins/tree/main/pstack) is poteto's skill pack for rigorous agent work: playbooks for bug fixes, features, and investigations, plus multi-model review and engineering principles. It is written for Cursor. This repository ports it to [OMP (oh-my-pi)](https://github.com/can1357/oh-my-pi) and [Pi](https://pi.dev).

The port is generated, not hand-maintained. A GitHub Action rebuilds it from Cursor's source every day and commits the result, so it follows upstream pstack without anyone porting it again.

This is an unofficial port. It is not affiliated with Cursor.

## Install

You need `omp`, `pi`, or both, plus `git`.

To install for OMP:

```sh
omp plugin install https://github.com/mr-jones123/pstack-harness
```

To install for Pi:

```sh
pi install git:github.com/mr-jones123/pstack-harness
```

To install for every harness on the machine in one step, run the install script. It installs where pstack is missing and updates where it is present, so you can rerun it.

```sh
curl -fsSL https://raw.githubusercontent.com/mr-jones123/pstack-harness/main/install.sh | sh
```

## Pick your models

Run this once on each machine:

```text
/skill:setup-pstack
```

pstack splits subagent work between a code model and a judgment model, and its review panels use both.

- In OMP, the skill sets `modelRoles.pstack-code` and `modelRoles.pstack-judge` in your OMP config.
- In Pi, the skill writes `~/.pi/agent/pstack-models.md`.

If you skip this step, pstack still runs. OMP gives every subagent seat to your session model, and Pi runs every child on its default model. Review panels then use one model, and pstack says so instead of claiming a multi-model review.

## Use pstack

Start any task that needs rigor with `poteto-mode`. It picks a playbook, opens a todo list, and calls the other skills as the steps need them.

```text
/skill:poteto-mode this pr has a subtle bug where the scroll drifts every 750ms even when idle. repro first, then fix and verify.
```

You can also call a skill directly:

```text
/skill:how how do we cancel runs? is there an n+1 when we look up each run?
/skill:interrogate review this branch.
/skill:poteto-help which skill should i use to review this branch?
```

The [pstack guide](docs/guide/README.md) teaches the workflow with real prompts. The guide uses Cursor's command names, so type `/skill:<name>` wherever it says `/<name>`.

## Update

The daily sync updates this repository. To pull the latest version onto a machine, run the install script again, or run one of these:

```sh
omp plugin upgrade pstack-harness
pi update git:github.com/mr-jones123/pstack-harness
```

## What differs from Cursor

Each harness gets a translation guide, `pstack-omp` for OMP and `pstack-pi` for Pi. Every skill that uses a Cursor name tells the agent to read it, and `poteto-mode` has it built in.

| Cursor | OMP | Pi |
| --- | --- | --- |
| `Task` subagents | The `task` tool with the bundled agents: `poteto-agent`, `poteto-agent-judge`, `comment-sicko`, `pstack-code`, `pstack-judge`, and `pstack-parent` | Child `pi -p` processes that load the prompts in `pi/agents/` |
| Model slugs such as `claude-opus-5-5-xhigh` | The `pstack-code` and `pstack-judge` model roles | Model patterns from `~/.pi/agent/pstack-models.md` |
| Cloud agents | Isolated `task` workspaces when enabled, otherwise local git worktrees | Local git worktrees |
| `/name` commands | `/skill:name` | `/skill:name` |

Some Cursor features have no equivalent. When a step needs Cursor Automations, running Bugbot, a cloud agent's own dashboard, a persistent `/loop` wake, or a custom mode, the agent skips that step and says so in one line. `poteto-mode/scripts/worktree-audit.sh` reads Cursor transcripts, so this port's copy exits before it audits anything.

## How the port is built

`build.mjs` copies these files from [cursor/plugins](https://github.com/cursor/plugins) at the commit pinned in `upstream.json`:

- pstack's skills and its guide.
- The `deslop`, `control-cli`, `control-ui`, and `verify-this` skills from `cursor-team-kit`, because pstack calls them.

It then makes these changes, which follow the pattern upstream uses for its own Claude Code port.

| Change | OMP tree (repository root) | Pi tree (`pi/`) |
| --- | --- | --- |
| Translation guide | `skills/pstack-omp` | `pi/skills/pstack-pi` |
| Skills that use Cursor names | One line after the title that points at the guide | Same |
| `poteto-mode` | The guide is embedded, so `/skill:poteto-mode` needs no extra read | Same |
| Subagents | `agents/`, on the `@pstack-code` and `@pstack-judge` model roles | `pi/agents/`, as system prompts |
| Cursor's built-in `create-skill` | `skills/create-skill` | `pi/skills/create-skill` |
| Links to upstream files outside the tree | GitHub links at the pinned commit | Same |

`--latest` moves the pin only when `pstack/`, `cursor-team-kit/`, or upstream's generator changed. Unrelated pushes to cursor/plugins cause no update.

### The build refuses to ship a broken port

The build fails, and the daily sync commits nothing, when any of these conditions holds:

- An upstream skill uses a Cursor name that a translation guide has no row for. The term list comes from upstream's own `scripts/generate-pstack-harness-trees.mjs`, plus `EXTRA_TERMS` in `build.mjs`.
- A relative link points at a file that is missing from a tree.
- A skill's `name` differs from its folder name, or the skill has no description.
- A file the build depends on moved upstream: `poteto-mode`, `worktree-audit.sh`, an agent file, or a skill that an agent autoloads.
- pstack starts to name a `cursor-team-kit` skill that `COMPANIONS` in `build.mjs` does not copy.
- A copied script other than `worktree-audit.sh` reads Cursor transcripts.
- An agent description uses a YAML form that the build cannot decode.

GitHub emails the repository owner when the scheduled sync fails. The failure message names the fix, which is usually a new row in `src/omp/skills/pstack-omp/SKILL.md` or `src/pi/skills/pstack-pi/SKILL.md`.

### Change the port

Edit the hand-written sources in `src/` and `build.mjs`, then rebuild. The build generates everything under `skills/`, `agents/`, `docs/`, `LICENSES/`, and `pi/`, so do not edit those folders by hand.

```sh
node build.mjs            # rebuild from the pinned commit
node build.mjs --latest   # pin the newest relevant cursor/plugins commit, then rebuild
node build.mjs --check    # fail when the committed trees are out of date
```

The build needs Node 22 or later and `git`. It clones cursor/plugins into `.cache/`.

## Credits and license

pstack is by Lauren Tan ([poteto](https://x.com/poteto)) at Cursor. `cursor-team-kit` is by Cursor. Both are MIT licensed, and their licenses ship in `LICENSES/`. This port is MIT licensed too. See `LICENSE`.

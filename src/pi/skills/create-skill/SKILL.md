---
name: create-skill
description: Author or revise an Agent Skills SKILL.md for Pi. Stands in for Cursor's built-in create-skill, which pstack skills name. Use when writing or editing a skill.
---

# Author a skill in Pi

This stands in for Cursor's built-in `create-skill`. It is an authoring guide, not Cursor's implementation.

1. Define when the skill applies, its inputs, its observable outcome, its approval boundaries, and how it fails. Read nearby skills before you design its interface.
2. Place it. A project skill goes in `.pi/skills/<name>/SKILL.md`. A user-wide skill goes in `~/.pi/agent/skills/<name>/SKILL.md`, and only when the user asked for user-wide scope.
3. Write YAML frontmatter with `name` equal to the folder name (lowercase words joined by single hyphens, at most 64 characters) and a `description` of at most 1024 characters that says what the skill does and when to use it. Pi skips a skill without a description. Add `disable-model-invocation: true` only for a skill that should run when the user types it.
4. Keep helpers and references beside `SKILL.md`. Resolve relative paths from the skill's own folder. Write Pi tool names and `/skill:<name>` in user-facing examples.
5. Write the smallest draft that works. Run representative success, failure, and ambiguous cases through the real workflow, inside what the user authorized. Run referenced helpers for real where you can. A model-behavior change needs a behavioral trial, not a text match.
6. Read the outputs and revise. Report static checks apart from end-to-end proof, and name the cases you did not test.

Never add global automation or publish a skill without the user's approval.

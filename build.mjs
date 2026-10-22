#!/usr/bin/env node
// Generates the OMP plugin tree (repository root) and the Pi package tree (pi/) from cursor/plugins.
//
//   node build.mjs            regenerate from the commit pinned in upstream.json
//   node build.mjs --latest   pin cursor/plugins main, then regenerate
//   node build.mjs --check    exit 1 when the committed trees differ from a fresh build

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const LOCK = join(ROOT, "upstream.json");
const CACHE = join(ROOT, ".cache", "cursor-plugins");
const LINK = /\]\(([^)\s]+)\)/g;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPANIONS = ["deslop", "control-cli", "control-ui", "verify-this"];
const GENERATED = ["skills", "agents", "docs", "LICENSES"];

// Cursor names the upstream term list misses. Each adapter needs a row for each key a skill uses.
const EXTRA_TERMS = [
  { key: "`/loop`", re: /`\/loop`|\/loop\b/ },
  { key: "`/visualize`", re: /`\/visualize`/ },
  { key: "custom mode", re: /custom mode/i },
  { key: "`create-skill`", re: /\*\*create-skill\*\* skill|Cursor's built-in/ },
];

const WORKER = readFileSync(join(ROOT, "src", "worker.md"), "utf8");

const TARGETS = [
  {
    name: "omp",
    label: "OMP",
    out: ".",
    adapter: "pstack-omp",
    pointer:
      "In OMP, read the `pstack-omp` skill (`skill://pstack-omp`) once per session before you follow this skill. " +
      "It maps the Cursor names in pstack skills to OMP.",
    agents: [
      { name: "poteto-agent", body: "poteto-agent", model: "@pstack-code", autoload: ["poteto-mode"] },
      {
        name: "poteto-agent-judge",
        body: "poteto-agent",
        model: "@pstack-judge",
        autoload: ["poteto-mode"],
        description:
          "poteto-agent on the judgment model. Use for the hardest changes (cross-cutting design, gnarly concurrency, subtle algorithms), prose, and judgment delegates spawned during a `/skill:poteto-mode` run.",
      },
      { name: "comment-sicko", body: "comment-sicko", model: "@pstack-judge", autoload: ["pstack-omp"] },
      {
        name: "pstack-code",
        model: "@pstack-code",
        autoload: ["pstack-omp"],
        description: "pstack worker on the code model. Use for generalPurpose seats: code, exploration, verification, and swarm work.",
      },
      {
        name: "pstack-judge",
        model: "@pstack-judge",
        autoload: ["pstack-omp"],
        description: "pstack worker on the judgment model. Use for generalPurpose seats: prose, review, synthesis, and judgment.",
      },
      {
        name: "pstack-parent",
        autoload: ["pstack-omp"],
        description: "pstack worker on the session model. Use for roles set to auto or inherit-parent.",
      },
    ],
    renderAgent(agent, upstream) {
      const front = [
        "---",
        `name: ${agent.name}`,
        `description: ${JSON.stringify(agent.description ?? upstream.description)}`,
        ...(agent.model ? [`model: ${JSON.stringify(agent.model)}`] : []),
        "autoloadSkills:",
        ...agent.autoload.map((skill) => `  - ${skill}`),
        "---",
      ];
      return `${front.join("\n")}\n\n${upstream.body}`;
    },
  },
  {
    name: "pi",
    label: "Pi",
    out: "pi",
    adapter: "pstack-pi",
    pointer:
      "In Pi, read [the Pi adapter](../pstack-pi/SKILL.md) once per session before you follow this skill. " +
      "It maps the Cursor names in pstack skills to Pi.",
    agentPointer:
      "In Pi, read the Pi adapter at the absolute path your parent gave you, once, before you follow these instructions. " +
      "It maps the Cursor names below to Pi.",
    agents: [
      { name: "poteto-agent", body: "poteto-agent" },
      { name: "comment-sicko", body: "comment-sicko" },
      { name: "pstack-worker" },
    ],
    // Pi has no agent discovery. These files are system prompts for `pi -p --append-system-prompt <file>`.
    renderAgent(agent, upstream) {
      return insertAfterHeading(upstream.body, this.agentPointer);
    },
  },
];

function fail(messages) {
  for (const message of [messages].flat()) console.log(`FAIL ${message}`);
  process.exit(1);
}

function git(args, cwd = CACHE) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function file(path) {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  return { fields: match?.[1] ?? "", body: match ? text.slice(match[0].length).replace(/^\n+/, "") : text };
}

function field(fields, name) {
  return fields.match(new RegExp(`^${name}:(.*)$`, "m"))?.[1].trim();
}

// Decodes a one-line YAML scalar. Block scalars and escapes JSON cannot read fail the build instead of shipping garbage.
function scalar(value, where) {
  if (value === undefined || value === "") fail(`${where} is missing`);
  if (/^[>|]/.test(value)) fail(`${where} is a YAML block scalar, which this build does not decode`);
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      fail(`${where} is a double-quoted scalar this build cannot decode: ${value}`);
    }
  }
  if (value.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(value)) fail(`${where} is not a single-quoted scalar: ${value}`);
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function insertAfterHeading(text, line) {
  const { fields, body } = frontmatter(text);
  const head = fields ? `---\n${fields}\n---\n\n` : "";
  const placed = /^# .*$/m.test(body) ? body.replace(/^(# .*)(?:\n+|$)/m, `$1\n\n${line}\n\n`) : `${line}\n\n${body}`;
  return head + placed;
}

// --- upstream checkout -------------------------------------------------------------------------

// Every push to cursor/plugins moves main, so --latest repins only when a path this build reads changed.
const TRACKED = ["pstack", "cursor-team-kit", "scripts/generate-pstack-harness-trees.mjs"];

// Always resets the worktree, so edits inside .cache never leak into a build. Fetches only a missing commit.
function checkout(commit) {
  if (spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: CACHE }).status !== 0) {
    git(["fetch", "-q", "--depth", "1", "origin", commit]);
  }
  git(["checkout", "-q", "--force", "--detach", commit]);
  git(["clean", "-qfdx"]);
}

function pin(latest) {
  const lock = JSON.parse(readFileSync(LOCK, "utf8"));
  if (!existsSync(join(CACHE, ".git"))) {
    mkdirSync(CACHE, { recursive: true });
    git(["init", "-q"]);
    git(["remote", "add", "origin", lock.repository]);
  }
  checkout(lock.commit);
  if (!latest) return lock;
  const main = execFileSync("git", ["ls-remote", lock.repository, "refs/heads/main"], { encoding: "utf8" }).split(/\s/)[0];
  if (!/^[0-9a-f]{40}$/.test(main)) fail(`cannot resolve main of ${lock.repository}`);
  if (main === lock.commit) return lock;
  git(["fetch", "-q", "--depth", "1", "origin", main]);
  const diff = spawnSync("git", ["diff", "--quiet", lock.commit, main, "--", ...TRACKED], { cwd: CACHE });
  if (diff.status === 0) return lock;
  if (diff.status !== 1) fail(`git diff ${lock.commit} ${main} failed: ${diff.stderr}`);
  checkout(main);
  return { ...lock, commit: main };
}

// Parsed, not evaluated: --latest reads upstream main in a job that holds a write token.
function upstreamTerms(src) {
  const text = readFileSync(join(src, "scripts", "generate-pstack-harness-trees.mjs"), "utf8");
  const terms = text.match(/const TERMS = (\[[\s\S]*?\n\]);/)?.[1];
  const routeKey = text.match(/const ROUTE_KEY = ("[^"\n]+");/)?.[1];
  if (!terms || !routeKey) fail("cannot read TERMS and ROUTE_KEY from upstream scripts/generate-pstack-harness-trees.mjs");
  const entries = [...terms.matchAll(/\{ key: ("(?:[^"\\]|\\.)*"), re: \/((?:[^/\\\n]|\\.)+)\/([a-z]*) \}/g)];
  const count = (terms.match(/\{ key:/g) ?? []).length;
  if (count === 0 || entries.length !== count) fail(`parsed ${entries.length} of ${count} upstream TERMS entries; update upstreamTerms`);
  const parsed = entries.map(([, key, source, flags]) => ({ key: JSON.parse(key), re: new RegExp(source, flags) }));
  return { terms: [...parsed, ...EXTRA_TERMS], routeKey: JSON.parse(routeKey) };
}

// --- rendering ---------------------------------------------------------------------------------

// Tree path -> upstream path for every copied upstream file, shared by both targets.
function sources(src) {
  const map = new Map();
  const add = (from, to) => {
    for (const path of walk(join(src, from))) map.set(posix.join(to, relative(join(src, from), path)), relative(src, path));
  };
  for (const skill of readdirSync(join(src, "pstack", "skills"))) {
    if (existsSync(join(src, "pstack", "skills", skill, "SKILL.md"))) add(`pstack/skills/${skill}`, `skills/${skill}`);
  }
  for (const skill of COMPANIONS) add(`cursor-team-kit/skills/${skill}`, `skills/${skill}`);
  add("pstack/docs/guide", "docs/guide");
  map.set("LICENSES/pstack", "pstack/LICENSE");
  map.set("LICENSES/cursor-team-kit", "cursor-team-kit/LICENSE");
  return map;
}

function usedTerms(text, { terms, routeKey }, skills, self) {
  const others = skills.filter((name) => name !== self).join("|");
  const route = new RegExp(`the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``, "g");
  const used = new Set(terms.filter((term) => term.re.test(text)).map((term) => term.key));
  const namesBareSkill = (line) =>
    [...line.matchAll(route)].some(({ groups }) => !line.includes(`(../${groups.bold ?? groups.command}/`));
  if (text.split("\n").some(namesBareSkill)) used.add(routeKey);
  return used;
}

function render(target, src, lock, vocabulary) {
  const map = sources(src);
  const files = new Map([...map].map(([path, from]) => [path, file(join(src, from))]));
  const upstreamOf = new Map(map);
  const overlay = join(ROOT, "src", target.name, "skills");
  for (const path of walk(overlay)) {
    const to = posix.join("skills", relative(overlay, path));
    if (files.has(to)) fail(`src/${target.name}/skills/${relative(overlay, path)} would overwrite upstream ${to}`);
    files.set(to, file(path));
  }

  const skills = [...new Set([...files.keys()].filter((p) => p.startsWith("skills/")).map((p) => p.split("/")[1]))].sort();
  const problems = [];
  const users = new Map();
  const note = (keys, who) => {
    for (const key of keys) users.set(key, [...(users.get(key) ?? []), who]);
  };

  if (!skills.includes("poteto-mode")) problems.push("upstream has no poteto-mode skill, and both adapters say poteto-mode embeds them");
  for (const skill of skills) {
    const path = `skills/${skill}/SKILL.md`;
    if (!files.has(path)) {
      problems.push(`${path} is missing`);
      continue;
    }
    const { fields } = frontmatter(files.get(path).bytes.toString("utf8"));
    const raw = field(fields, "name");
    const name = raw === undefined ? undefined : scalar(raw, `${path} name`);
    if (name !== skill) problems.push(`${path} has name ${JSON.stringify(name ?? "")}, not its folder name`);
    if (!SKILL_NAME.test(skill) || skill.length > 64) problems.push(`skills/${skill} is not a valid Agent Skills name`);
    if (!field(fields, "description")) problems.push(`${path} has no description`);
  }

  // A cursor-team-kit skill that pstack starts naming must be copied too, or the agent asks for a skill that is not there.
  const kit = readdirSync(join(src, "cursor-team-kit", "skills")).filter((name) => !skills.includes(name));
  const kitRef = new RegExp(`\`/?(${kit.join("|")})\`|\\*\\*(${kit.join("|")})\\*\\*`);
  const noteKit = (text, who) => {
    const hit = kit.length > 0 && text.match(kitRef);
    if (hit) problems.push(`${who} names cursor-team-kit skill ${hit[1] ?? hit[2]}; add it to COMPANIONS`);
  };

  // Only upstream skills carry Cursor names. Overlay skills are already written for the harness.
  const wrapped = [];
  for (const skill of skills.filter((name) => upstreamOf.has(`skills/${name}/SKILL.md`))) {
    const paths = [...files.keys()].filter((p) => p.startsWith(`skills/${skill}/`) && p.endsWith(".md"));
    for (const p of paths) noteKit(files.get(p).bytes.toString("utf8"), p);
    const used = new Set(paths.flatMap((p) => [...usedTerms(files.get(p).bytes.toString("utf8"), vocabulary, skills, skill)]));
    note(used, skill);
    const path = `skills/${skill}/SKILL.md`;
    const text = files.get(path).bytes.toString("utf8");
    if (skill === "poteto-mode") {
      const { fields, body } = frontmatter(text);
      const adapter = frontmatter(files.get(`skills/${target.adapter}/SKILL.md`).bytes.toString("utf8")).body.trimEnd();
      files.get(path).bytes = Buffer.from(`---\n${fields}\n---\n\n${adapter}\n\n---\n\n${body}`);
    } else if (used.size > 0) {
      files.get(path).bytes = Buffer.from(insertAfterHeading(text, target.pointer));
      wrapped.push(skill);
    }
  }

  const audit = "skills/poteto-mode/scripts/worktree-audit.sh";
  if (!files.has(audit)) problems.push(`${audit} moved upstream; the adapters promise its guard, so move the guard too`);
  else {
    const guard =
      `printf '%s\\n' 'Unavailable in ${target.label}: this audit reads Cursor transcripts. ` +
      `Use git worktree list and check each checkout, its unpushed commits, and its session owner instead.' >&2\nexit 2\n`;
    files.get(audit).bytes = Buffer.from(files.get(audit).bytes.toString("utf8").replace(/^(#!.*\n)?/, `$1${guard}`));
  }
  for (const [path, from] of upstreamOf) {
    if (path === audit || path.endsWith(".md") || !/agent-transcripts|\.cursor\/projects/.test(readFileSync(join(src, from), "utf8"))) continue;
    problems.push(`${path} reads Cursor transcripts; guard it like ${audit}`);
  }

  for (const name of readdirSync(join(src, "pstack", "agents")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3))) {
    if (!target.agents.some((agent) => agent.body === name)) problems.push(`pstack/agents/${name}.md has no ${target.label} agent in TARGETS`);
  }

  for (const agent of target.agents) {
    for (const name of agent.autoload ?? []) {
      if (!skills.includes(name)) problems.push(`${target.label} agent ${agent.name} autoloads ${name}, which is not in the tree`);
    }
    let upstream = { description: agent.description, body: WORKER };
    if (agent.body) {
      const from = `pstack/agents/${agent.body}.md`;
      if (!existsSync(join(src, from))) fail(`${from} no longer exists upstream`);
      const { fields, body } = frontmatter(readFileSync(join(src, from), "utf8"));
      upstream = { description: agent.description ?? scalar(field(fields, "description"), `${from} description`), body };
      upstreamOf.set(`agents/${agent.name}.md`, from);
      noteKit(body, from);
    }
    note(usedTerms(upstream.body, vocabulary, skills, agent.name), `agents/${agent.name}`);
    files.set(`agents/${agent.name}.md`, { bytes: Buffer.from(target.renderAgent(agent, upstream)), executable: false });
  }

  const adapter = files.get(`skills/${target.adapter}/SKILL.md`)?.bytes.toString("utf8");
  if (!adapter) fail(`src/${target.name}/skills/${target.adapter}/SKILL.md is missing`);
  for (const [key, using] of users) {
    if (!adapter.includes(key)) problems.push(`${target.label} adapter has no row for ${key}, used by ${using.join(", ")}`);
  }
  if (problems.length > 0) fail(problems);

  // A relative link that points at a copied file keeps working. One that points at an upstream file
  // outside the tree becomes a GitHub link at the pinned commit.
  const github = lock.repository.replace(/\.git$/, "");
  const inTree = (path) => files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`));
  const treeOf = new Map();
  for (const [to, from] of upstreamOf) if (!treeOf.has(from)) treeOf.set(from, to);
  // Copies keep their folder layout, so a directory maps by trimming the same suffix from any file under it.
  const mapped = (path) => {
    if (treeOf.has(path)) return treeOf.get(path);
    for (const [from, to] of treeOf) {
      const rest = from.slice(path.length);
      if (from.startsWith(`${path}/`) && to.endsWith(rest)) return to.slice(0, -rest.length);
    }
    return undefined;
  };
  const dangling = [];
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    const from = upstreamOf.get(path);
    let text = entry.bytes.toString("utf8");
    if (from) {
      text = text.replace(LINK, (link, href) => {
        const dest = href.replace(/[#?].*/, "");
        if (!dest || /^[a-z][a-z0-9+.-]*:/i.test(dest)) return link;
        const resolved = posix.join(posix.dirname(from), dest).replace(/\/$/, "");
        if (resolved.startsWith("..") || !existsSync(join(src, resolved))) return link;
        const suffix = href.slice(href.search(/[#?]|$/));
        const local = mapped(resolved);
        if (local !== undefined) {
          const rel = posix.relative(posix.dirname(path), local) || ".";
          return `](${rel}${dest.endsWith("/") ? "/" : ""}${suffix})`;
        }
        const kind = statSync(join(src, resolved)).isDirectory() ? "tree" : "blob";
        return `](${github}/${kind}/${lock.commit}/${resolved}${suffix})`;
      });
      entry.bytes = Buffer.from(text);
    }
    for (const [, href] of text.matchAll(LINK)) {
      const dest = href.replace(/[#?].*/, "");
      if (!dest || /^[a-z][a-z0-9+.-]*:/i.test(dest)) continue;
      const resolved = posix.join(posix.dirname(path), dest).replace(/\/$/, "");
      // Upstream prose has template links such as `[PR #123](url)`. Like upstream, only real targets count.
      const placeholder =
        from && readFileSync(join(src, from), "utf8").includes(`](${href})`) && !existsSync(join(src, posix.join(posix.dirname(from), dest)));
      if (!inTree(resolved) && !placeholder) dangling.push(`${posix.join(target.out, path)} links to ${href}, which is not in the ${target.label} tree`);
    }
  }
  if (dangling.length > 0) fail(dangling);

  return { files: new Map([...files].map(([path, entry]) => [posix.join(target.out, path), entry])), skills, wrapped };
}

// --- write or check ----------------------------------------------------------------------------

function onDisk(target) {
  const entries = new Map();
  for (const dir of GENERATED) {
    const base = join(ROOT, target.out, dir);
    if (existsSync(base)) for (const path of walk(base)) entries.set(relative(ROOT, path).split("\\").join("/"), file(path));
  }
  return entries;
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const lock = pin(args.includes("--latest"));
const vocabulary = upstreamTerms(CACHE);
const version = JSON.parse(readFileSync(join(CACHE, "pstack", "plugin.json"), "utf8")).version;
const builds = TARGETS.map((target) => ({ target, ...render(target, CACHE, lock, vocabulary) }));

const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const stale = manifest.version !== version;

if (check) {
  const drifted = builds.flatMap(({ target, files }) => {
    const have = onDisk(target);
    return [...new Set([...files.keys(), ...have.keys()])].sort().filter((path) => {
      const [want, got] = [files.get(path), have.get(path)];
      return !want || !got || !want.bytes.equals(got.bytes) || want.executable !== got.executable;
    });
  });
  if (stale) drifted.push(`package.json version ${manifest.version}, upstream pstack ${version}`);
  for (const path of drifted.slice(0, 20)) console.log(`drift ${path}`);
  if (drifted.length > 0) fail(`${drifted.length} generated paths are out of date. Run \`node build.mjs\` and commit the result.`);
  console.log(`up to date with ${lock.repository} ${lock.commit.slice(0, 7)} (pstack ${version})`);
} else {
  for (const { target, files } of builds) {
    for (const dir of GENERATED) rmSync(join(ROOT, target.out, dir), { recursive: true, force: true });
    for (const [path, { bytes, executable }] of files) {
      mkdirSync(dirname(join(ROOT, path)), { recursive: true });
      writeFileSync(join(ROOT, path), bytes);
      chmodSync(join(ROOT, path), executable ? 0o755 : 0o644);
    }
  }
  if (stale) writeFileSync(join(ROOT, "package.json"), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  for (const { target, skills, wrapped } of builds) {
    console.log(`${target.label}: ${skills.length} skills, ${wrapped.length} with the adapter line, ${target.agents.length} agents -> ${target.out}/`);
  }
  console.log(`pstack ${version} from ${lock.repository} ${lock.commit.slice(0, 7)}`);
}

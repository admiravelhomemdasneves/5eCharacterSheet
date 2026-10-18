// Turns 5etools JSON data into the sheet's compact data format (Compendium).
// Pure: files are read through the `read` callback, so the same code runs in the plugin
// (importing the user's own 5etools data) and in Node scripts (building the bundled SRD set).
//
// Links are NOT resolved here. References inside text become tokens ⟦kind|name|source|display⟧
// and entity links are attached at runtime by Linker (src/data/links.ts), depending on whether
// and where the user keeps a compendium of notes.
import type {
  Abil, AdventuresFile, BooksFile, ClassFile, FileIndex, RacesFile, RawAbility, RawBackground, RawBase, RawCell,
  RawClassFeatureRef, RawEntry, RawFeat, RawItem, RawProf, RawProfItem, RawSkillChoice, RawSpeed, RawSpell,
  RawSubclassFeature, RawSubrace, RawTableValue, SpellSourcesFile,
} from "./fivetools.ts";
import type {
  AbilityOption, BackgroundData, ClassData, Compendium, FeatData, Feature, ItemData, ProfList, RaceData,
  SpellData, Speeds, SubclassData, SubraceData,
} from "../rules/engine.ts";

/** Reads a 5etools data file (path relative to the `data` folder) and returns its parsed JSON. */
export type ReadJson = (relPath: string) => Promise<unknown>;
export interface BuildOptions {
  read: ReadJson;
  /** keep only SRD 5.1 content (uses 5etools' `srd` flags and SRD names) */
  srdOnly?: boolean;
  /** drop 2024-edition content (XPHB/XDMG/XMM and entries marked edition "one") */
  rules2014Only?: boolean;
  /** extra filter, e.g. "only entries that have a note in my compendium" */
  keep?: (kind: string, name: string, source: string) => boolean;
}

const lc = (s: string | number | null | undefined) => String(s ?? "").toLowerCase();
const ABILS: Abil[] = ["str", "dex", "con", "int", "wis", "cha"];
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const SOURCES_2024 = new Set(["XPHB", "XDMG", "XMM", "XScreen"]);
/** Name given to a race's unnamed 5etools subrace (the race without a variant). */
export const STANDARD_SUBRACE = "Standard";
export const TOKEN = /⟦([^|⟧]*)\|([^|⟧]*)\|([^|⟧]*)\|([^⟧]*)⟧/g;
const tok = (kind: string, name: string, source: string, display: string) => `⟦${kind}|${name}|${source}|${display}⟧`;

// ---------------------------------------------------------------- 5etools text rendering
const TAG_KIND: Record<string, string> = { spell: "spells", item: "items", creature: "bestiary", feat: "feats", race: "races", background: "backgrounds", class: "classes", optfeature: "optional-features" };
const CONDITIONS = new Set(["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"]);

function renderTag(tag: string, body: string): string {
  const parts = body.split("|");
  const text = parts[0];
  switch (tag) {
    case "b": case "bold": return `**${renderStr(text)}**`;
    case "i": case "italic": return `*${renderStr(text)}*`;
    case "dice": case "damage": case "d20": return parts[1] || text;
    case "hit": return (text.startsWith("-") ? "" : "+") + text;
    case "dc": return `DC ${text}`;
    case "chance": return `${text}%`;
    case "recharge": return `(Recharge ${text || 6}–6)`;
    case "scaledamage": case "scaledice": return parts[2] || text;
    case "condition": return CONDITIONS.has(lc(text)) ? tok("rule:conditions", title(text), "", parts[2] || text) : parts[2] || text;
    case "skill": return tok("rule:skills", title(text), "", parts[2] || text);
    case "sense": return tok("rule:senses", title(text), "", parts[2] || text);
    case "action": return tok("rule:actions", title(text), "", parts[2] || text);
    case "filter": return text;
    default: {
      const kind = TAG_KIND[tag];
      return kind ? tok(kind, text, parts[1] || "phb", parts[2] || text) : parts[2] || text;
    }
  }
}
export function renderStr(s: string | number): string {
  let out = String(s);
  for (let i = 0; i < 6 && /\{@/.test(out); i++) out = out.replace(/\{@(\w+) ?([^{}]*)\}/g, (_m, tag: string, body: string) => renderTag(tag, body));
  return out;
}
function renderCell(c: RawCell): string {
  if (typeof c !== "object") return renderStr(c);
  if (c.roll) return renderEntries(`${c.roll.exact ?? `${c.roll.min}–${c.roll.max}`}`);
  return renderEntries(c.entry ?? c);
}
export function renderEntries(entries: RawEntry | RawEntry[] | null | undefined, depth = 0): string {
  if (entries == null) return "";
  const list = Array.isArray(entries) ? entries : [entries];
  const out: string[] = [];
  for (const e of list) {
    if (typeof e === "string") { out.push(renderStr(e)); continue; }
    switch (e.type) {
      case "list":
        out.push((e.items || []).map((it) => {
          if (typeof it === "string") return `- ${renderStr(it)}`;
          const name = it.name ? `**${renderStr(it.name)}** ` : "";
          return `- ${name}${renderEntries(it.entries || it.entry, depth + 1).replace(/\n\n/g, " ")}`;
        }).join("\n"));
        break;
      case "table": {
        const head = (e.colLabels || []).map(renderStr);
        const rows = (e.rows || []).map((r) => (Array.isArray(r) ? r : r.row || []).map(renderCell));
        if (e.caption) out.push(`**${renderStr(e.caption)}**`);
        if (head.length) out.push(`| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n` + rows.map((r) => `| ${r.join(" | ")} |`).join("\n"));
        break;
      }
      case "inset": case "insetReadaloud": case "quote":
        out.push(renderEntries(e.entries, depth + 1).split("\n").map((l) => `> ${l}`).join("\n"));
        break;
      case "item":
        out.push(`**${renderStr(e.name ?? "")}** ${renderEntries(e.entries || e.entry, depth + 1)}`);
        break;
      case "refClassFeature": case "refSubclassFeature": case "refOptionalfeature":
        break; // resolved separately as their own features
      case "abilityDc":
        out.push(`**Spell save DC** = 8 + your proficiency bonus + your ${(e.attributes || []).map((a) => a.toUpperCase()).join("/")} modifier`);
        break;
      case "abilityAttackMod":
        out.push(`**Spell attack modifier** = your proficiency bonus + your ${(e.attributes || []).map((a) => a.toUpperCase()).join("/")} modifier`);
        break;
      default: {
        const body = renderEntries(e.entries || e.entry || e.items, depth + 1);
        if (e.name) out.push(depth === 0 ? `**${renderStr(e.name)}.** ${body}` : `***${renderStr(e.name)}.*** ${body}`);
        else if (body) out.push(body);
      }
    }
  }
  return out.filter(Boolean).join("\n\n");
}
/** text with link tokens reduced to their display text */
export const plain = (s: string) => s.replace(TOKEN, (_m, _k, _n, _s, d: string) => d);

// ---------------------------------------------------------------- helpers
const idOf = (...p: string[]) => p.map((x) => lc(x).replace(/[^a-z0-9]+/g, "-")).join("|");
function speedOf(sp: RawSpeed | undefined): Speeds {
  if (sp == null) return { walk: 30 };
  if (typeof sp === "number") return { walk: sp };
  const o: Speeds = {};
  for (const k of ["walk", "fly", "swim", "climb", "burrow"] as const) {
    const v = sp[k];
    if (v == null) continue;
    o[k] = v === true ? "walk" : typeof v === "object" ? v.number : (v as number);
  }
  return o;
}
function abilityOf(ab: RawAbility[] | undefined, lineage?: string | boolean): AbilityOption[] {
  if (lineage) {
    return [
      { label: "+2 / +1", fixed: {}, choose: [{ from: ABILS, count: 1, amount: 2 }, { from: ABILS, count: 1, amount: 1, distinct: true }] },
      { label: "+1 / +1 / +1", fixed: {}, choose: [{ from: ABILS, count: 3, amount: 1 }] },
    ];
  }
  if (!ab) return [];
  return ab.map((a) => {
    const opt: AbilityOption = { label: "", fixed: {}, choose: [] };
    for (const k of ABILS) if (typeof a[k] === "number") opt.fixed[k] = a[k];
    if (a.choose) {
      const w = a.choose.weighted;
      if (w) (w.weights || []).forEach((amt) => opt.choose.push({ from: w.from, count: 1, amount: amt, distinct: true }));
      else opt.choose.push({ from: a.choose.from, count: a.choose.count || 1, amount: a.choose.amount || 1 });
    }
    opt.label = [...Object.entries(opt.fixed).map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? "+" : ""}${v}`), ...opt.choose.map((c) => `+${c.amount} to ${c.count} of ${c.from.length === 6 ? "any" : c.from.map((x) => x.toUpperCase()).join("/")}`)].join(", ");
    return opt;
  });
}
function profList(arr: RawProf[] | undefined): ProfList {
  const fixed: string[] = [], choose: ProfList["choose"] = [];
  for (const o of arr || []) for (const [k, v] of Object.entries(o)) {
    if (k === "choose" && typeof v === "object") choose.push({ from: v.from, count: v.count || 1 });
    else if ((k === "any" || k === "anyStandard") && typeof v === "number") choose.push({ from: "any", count: v });
    else if (v === true) fixed.push(k);
  }
  return { fixed, choose };
}
function langText(arr: RawProf[] | undefined): string[] {
  const out: string[] = [];
  for (const o of arr || []) for (const [k, v] of Object.entries(o)) {
    if (v === true) out.push(title(k));
    else if ((k === "anyStandard" || k === "any") && typeof v === "number") out.push(`${v} of your choice`);
    else if (k === "choose" && typeof v === "object") out.push(`${v.count || 1} from ${v.from.map(title).join(", ")}`);
  }
  return out;
}
function resolveCopy<T extends RawBase>(list: T[], x: T): T {
  if (!x._copy) return x;
  const from = x._copy;
  const base = list.find((y) => y.name === from.name && y.source === from.source);
  if (!base) return x;
  const merged: T = { ...resolveCopy(list, base), ...x };
  delete merged._copy;
  // a copy is its own entry: it must not inherit the SRD flag of what it copies
  merged.srd = x.srd;
  return merged;
}
/** Fold a race's only subrace into the race itself (e.g. the SRD Human, whose +1s are on its unnamed subrace). */
function mergeSubrace(race: RaceData, sub: SubraceData) {
  if (sub.ability?.length) {
    race.ability = sub.overwriteAbility || !race.ability.length ? sub.ability : race.ability.map((ro) => {
      const so = sub.ability![0], fixed = { ...ro.fixed };
      for (const [k, v] of Object.entries(so.fixed)) fixed[k as Abil] = (fixed[k as Abil] || 0) + (v || 0);
      return { label: [ro.label, so.label].filter(Boolean).join(", "), fixed, choose: [...ro.choose, ...so.choose] };
    });
  }
  if (sub.speed) race.speed = { ...race.speed, ...sub.speed };
  if (sub.darkvision != null) race.darkvision = sub.darkvision;
  race.skills = { fixed: [...race.skills.fixed, ...sub.skills.fixed], choose: [...race.skills.choose, ...sub.skills.choose] };
  race.languages = [...race.languages, ...sub.languages];
  race.resist = [...race.resist, ...sub.resist];
  race.traits = [...race.traits, ...sub.traits];
  race.spells = race.spells || sub.spells;
  race.subraces = [];
  race.subraceRequired = false;
}
const traitsOf = (entries: RawEntry[] | undefined) =>
  (entries || []).flatMap((e) => (typeof e === "object" && e.name ? [{ name: e.name, text: renderEntries(e.entries) }] : []));
const skillChoices = (skills: RawSkillChoice[] | undefined): ClassData["skills"] =>
  (skills || []).map((s) => (s.choose ? { from: s.choose.from, count: s.choose.count } : { from: "any", count: s.any || 0 }));
/** value of a class table cell as text or number */
function tableValue(v: RawTableValue | undefined): string | number | null {
  if (v && typeof v === "object") return v.value ?? (v.toRoll ? v.toRoll.map((d) => `${d.number}d${d.faces}`).join("+") : plain(renderStr(JSON.stringify(v))));
  return typeof v === "string" ? plain(renderStr(v)) : v ?? null;
}
function prereqText(p: Record<string, unknown>): string {
  return Object.entries(p).map(([k, v]) => {
    if (k === "ability") return (v as Record<string, number>[]).map((a) => Object.entries(a).map(([ab, n]) => `${ab.toUpperCase()} ${n}`).join(" or ")).join("; ");
    if (k === "race") return (v as { name: string; subrace?: string }[]).map((r) => title(r.name) + (r.subrace ? ` (${r.subrace})` : "")).join(" or ");
    if (k === "level") return `Level ${typeof v === "object" && v !== null ? (v as { level: number }).level : String(v)}`;
    if (k === "spellcasting" || k === "spellcasting2020") return "Spellcasting";
    if (k === "proficiency") return (v as Record<string, string>[]).map((x) => Object.entries(x).map(([a, b]) => `${b} ${a}`).join(", ")).join("; ");
    return typeof v === "string" ? v : "";
  }).filter(Boolean).join(", ");
}

// ---------------------------------------------------------------- build
export async function buildCompendium(o: BuildOptions): Promise<Compendium> {
  const read = <T>(rel: string) => o.read(rel) as Promise<T>;
  const is2024 = (e: RawBase) => SOURCES_2024.has(e.source) || e.edition === "one";
  // SRD: 5etools marks SRD entries with srd: true, or srd: "<SRD name>" when the SRD renames them
  const srdName = (e: RawBase): string | null => (e.srd === true ? e.name : typeof e.srd === "string" ? e.srd : null);
  const allowed = (kind: string, e: RawBase, name = e.name) =>
    // the SRD flag itself, not the SRD name: unnamed subraces (e.g. the standard Human) have none
    (!o.srdOnly || e.srd === true || typeof e.srd === "string") && (!o.rules2014Only || !is2024(e)) && (!o.keep || o.keep(kind, name, e.source));
  const nameOf = (e: RawBase) => (o.srdOnly ? srdName(e) || e.name : e.name);

  // races
  const racesJson = await read<RacesFile>("races.json");
  const races: RaceData[] = [];
  for (const r0 of racesJson.race) {
    const r = resolveCopy(racesJson.race, r0);
    if (o.rules2014Only && is2024(r)) continue;
    const subOut: SubraceData[] = [];
    // An unnamed subrace is the race as written: 5etools keeps e.g. the standard Human's +1 to every
    // ability there. Next to named subraces (Variant Human, the dragonmarks, which replace those +1s)
    // it is offered as "Standard"; on its own it is merged into the race below. Most races' unnamed
    // subrace is an empty placeholder (their bonuses are on the race), which is skipped as before.
    const hasContent = (s: RawSubrace) => !!(s.ability || s.entries?.length || s.speed || s.darkvision || s.skillProficiencies || s.languageProficiencies || s.resist || s.additionalSpells);
    const subs = racesJson.subrace.filter((x) => x.raceName === r.name && x.raceSource === r.source && (x.name || hasContent(x)));
    for (const s of subs) {
      const name = s.name || STANDARD_SUBRACE;
      if (!allowed("races", s, s.name ? `${r.name} (${s.name})` : r.name)) continue;
      subOut.push({
        id: idOf(r.name, name, s.source), name, source: s.source, link: null,
        ability: s.ability ? abilityOf(s.ability) : null,
        overwriteAbility: !!s.overwrite?.ability,
        speed: s.speed ? speedOf(s.speed) : null,
        darkvision: s.darkvision ?? null,
        skills: profList(s.skillProficiencies),
        languages: langText(s.languageProficiencies),
        resist: s.resist || [],
        traits: traitsOf(s.entries),
        spells: s.additionalSpells || null,
        hpPerLevel: /hit point maximum increases by 1/i.test(JSON.stringify(s.entries || "")) ? 1 : 0,
      });
    }
    const baseOk = allowed("races", r);
    if (!baseOk && !subOut.length) continue;
    const SIZE: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large" };
    const standard = subOut.find((x) => x.name === STANDARD_SUBRACE && subs.some((s) => !s.name && idOf(r.name, STANDARD_SUBRACE, s.source) === x.id));
    const race: RaceData = {
      id: idOf(r.name, r.source), name: nameOf(r), source: r.source, link: null,
      size: (r.size || ["M"]).map((s) => SIZE[s] || s),
      speed: speedOf(r.speed),
      ability: abilityOf(r.ability, r.lineage),
      darkvision: r.darkvision ?? null,
      skills: profList(r.skillProficiencies), tools: profList(r.toolProficiencies),
      weapons: profList(r.weaponProficiencies), armor: profList(r.armorProficiencies),
      languages: langText(r.languageProficiencies),
      resist: r.resist || [], feats: r.feats || null,
      traits: traitsOf(r.entries),
      spells: r.additionalSpells || null,
      subraces: subOut,
      // with a "Standard" subrace the race alone is incomplete (its bonuses live in the subraces)
      subraceRequired: subOut.length > 0 && (!baseOk || !!standard),
    };
    if (standard && subOut.length === 1) mergeSubrace(race, standard);
    races.push(race);
  }

  // classes
  const classes: ClassData[] = [];
  const classIndex = await read<FileIndex>("class/index.json");
  for (const file of Object.values(classIndex)) {
    const cj = await read<ClassFile>(`class/${file}`);
    const classFeatures = cj.classFeature || [], subclassFeatures = cj.subclassFeature || [];
    for (const c of cj.class || []) {
      if (!allowed("classes", c)) continue;
      const featOk = (f: RawBase) => !o.srdOnly || !!f.srd;
      const feat = (ref: RawClassFeatureRef): Feature | null => {
        const s = typeof ref === "string" ? ref : ref.classFeature;
        const [name, cls, clsSrc, lvl, src] = s.split("|");
        const f = classFeatures.find((x) => x.name === name && x.className === cls && x.level === +lvl && x.source === (src || clsSrc || "PHB"));
        if (!f || !featOk(f)) return null;
        return { name, level: +lvl, source: f.source, text: renderEntries(f.entries), optional: !!f.isClassFeatureVariant, subclassFeature: typeof ref === "object" && !!ref.gainSubclassFeature, link: null };
      };
      const features = (c.classFeatures || []).map(feat).filter((f): f is Feature => f !== null)
        .filter((f) => !f.optional || !o.rules2014Only || !SOURCES_2024.has(f.source));
      const tableCols: ClassData["tableCols"] = [];
      for (const g of c.classTableGroups || []) {
        if (g.rowsSpellProgression) continue;
        (g.colLabels || []).forEach((lab, i) => {
          const label = plain(renderStr(lab));
          if (/cantrips known|spells known|spell slots|slot level|prepared/i.test(label)) return;
          tableCols.push({ label, rows: (g.rows || []).map((row) => tableValue(row[i])) });
        });
      }
      const subclasses: SubclassData[] = [];
      for (const sc of (cj.subclass || []).filter((x) => x.className === c.name && x.classSource === c.source)) {
        if (!allowed("classes", sc)) continue;
        const sfeats: Feature[] = [];
        const pushSub = (name: string, scShort: string, scSrc: string, lvl: string, src: string, clsSrc = "PHB"): RawSubclassFeature | null => {
          const f = subclassFeatures.find((x) => x.name === name && x.subclassShortName === scShort && x.level === +lvl && x.source === (src || scSrc || clsSrc || "PHB"));
          if (!f || !featOk(f) || sfeats.some((y) => y.name === name && y.level === +lvl)) return null;
          sfeats.push({ name, level: +lvl, source: f.source, text: renderEntries(f.entries), link: null });
          return f;
        };
        for (const ref of sc.subclassFeatures || []) {
          const [name, , clsSrc, scShort, scSrc, lvl, src] = ref.split("|");
          const f = pushSub(name, scShort, scSrc, lvl, src, clsSrc);
          // nested refs inside the first feature (e.g. "Evocation Savant" inside "School of Evocation")
          if (f) for (const m of JSON.stringify(f.entries).matchAll(/"subclassFeature":"([^"]+)"/g)) {
            const [n2, , , s2, ss2, l2, src2] = m[1].split("|");
            pushSub(n2, s2, ss2, l2, src2);
          }
        }
        subclasses.push({
          id: idOf(c.name, sc.shortName, sc.source), name: nameOf(sc), shortName: sc.shortName, source: sc.source, link: null,
          features: sfeats.sort((a, b) => a.level - b.level),
          spellcasting: sc.casterProgression && sc.spellcastingAbility ? { ability: sc.spellcastingAbility, progression: sc.casterProgression, cantrips: sc.cantripProgression || null, known: sc.spellsKnownProgression || null, list: "Wizard" } : null,
          additionalSpells: sc.additionalSpells || null,
        });
      }
      const sp = c.startingProficiencies || {};
      const profText = (a: RawProfItem) => plain(renderStr(typeof a === "string" ? a : a.full || a.proficiency || ""));
      const pact = c.casterProgression === "pact"
        ? (c.classTableGroups || []).flatMap((g) => {
          const labels = g.colLabels || [];
          if (!labels.includes("Spell Slots")) return [];
          const iSlots = labels.indexOf("Spell Slots"), iLevel = labels.indexOf("Slot Level");
          return [(g.rows || []).map((row) => ({ slots: Number(row[iSlots]) || 0, level: parseInt(String(tableValue(row[iLevel]))) || 1 }))];
        })[0] || null
        : null;
      const mc = c.multiclassing;
      classes.push({
        id: idOf(c.name, c.source), name: nameOf(c), source: c.source, link: null,
        hd: c.hd?.faces || 8, saves: c.proficiency || [],
        armor: (sp.armor || []).map(profText), weapons: (sp.weapons || []).map(profText), tools: (sp.tools || []).map(profText),
        skills: skillChoices(sp.skills),
        spellcasting: c.casterProgression && c.spellcastingAbility ? { ability: c.spellcastingAbility, progression: c.casterProgression, prepared: c.preparedSpells || null, cantrips: c.cantripProgression || null, known: c.spellsKnownProgression || null, knownFixed: c.spellsKnownProgressionFixed || null, list: c.name } : null,
        pactSlots: pact,
        tableCols,
        subclassTitle: c.subclassTitle || "Subclass",
        subclassLevel: features.find((f) => f.subclassFeature)?.level || 3,
        features,
        multiclass: mc ? {
          requirements: mc.requirements || {},
          armor: (mc.proficienciesGained?.armor || []).map(profText),
          weapons: (mc.proficienciesGained?.weapons || []).map(profText),
          skills: (mc.proficienciesGained?.skills || []).flatMap((s) => (s.choose ? [{ from: s.choose.from, count: s.choose.count }] : [])),
        } : null,
        subclasses,
      });
    }
  }

  // backgrounds
  const bgJson = await read<{ background: RawBackground[] }>("backgrounds.json");
  const backgrounds: BackgroundData[] = [];
  const findFeature = (es: RawEntry[] | undefined): { name: string; entries?: RawEntry[] } | null => {
    for (const e of es || []) if (typeof e === "object") { if (e.name && /^Feature:/.test(e.name)) return { name: e.name, entries: e.entries }; const r = findFeature(e.entries); if (r) return r; }
    return null;
  };
  for (const b0 of bgJson.background) {
    const b = resolveCopy(bgJson.background, b0);
    if (!allowed("backgrounds", b)) continue;
    const fe = findFeature(b.entries);
    backgrounds.push({
      id: idOf(b.name, b.source), name: nameOf(b), source: b.source, link: null,
      skills: profList(b.skillProficiencies), tools: profList(b.toolProficiencies), languages: langText(b.languageProficiencies),
      feature: fe ? { name: fe.name.replace(/^Feature:\s*/, ""), heading: fe.name, text: renderEntries(fe.entries), link: null } : null,
      feats: b.feats || null,
    });
  }

  // feats
  const feats: FeatData[] = [];
  for (const f of (await read<{ feat: RawFeat[] }>("feats.json")).feat) {
    if (!allowed("feats", f)) continue;
    const prereq = (f.prerequisite || []).map(prereqText).join(" or ");
    feats.push({ id: idOf(f.name, f.source), name: nameOf(f), source: f.source, link: null, prereq, ability: f.ability ? abilityOf(f.ability) : [], text: renderEntries(f.entries) });
  }

  // spells
  const spellSources = await read<SpellSourcesFile>("spells/sources.json");
  const SCHOOL: Record<string, string> = { A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment", V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation" };
  const spells: SpellData[] = [];
  for (const file of Object.values(await read<FileIndex>("spells/index.json"))) {
    for (const s of (await read<{ spell?: RawSpell[] }>(`spells/${file}`)).spell || []) {
      if (!allowed("spells", s)) continue;
      const lists = spellSources[s.source]?.[s.name] || {};
      const classes2 = [...new Set([...(lists.class || []), ...(lists.classVariant || [])].map((c) => c.name))];
      const t = s.time?.[0];
      const dist = s.range?.distance;
      const range = dist ? (dist.amount ? `${dist.amount} ${dist.type}` : title(dist.type)) + (s.range?.type !== "point" ? ` (${s.range?.type})` : "") : title(s.range?.type || "");
      const dur = s.duration?.[0];
      const m = s.components?.m;
      spells.push({
        id: idOf(s.name, s.source), name: nameOf(s), source: s.source, link: null,
        level: s.level, school: SCHOOL[s.school] || s.school,
        time: t ? `${t.number} ${t.unit}${t.number > 1 ? "s" : ""}` : "",
        range,
        components: [s.components?.v && "V", s.components?.s && "S", m && `M (${typeof m === "string" ? m : m.text})`].filter(Boolean).join(", "),
        duration: dur ? (dur.type === "timed" && dur.duration ? `${dur.concentration ? "Concentration, up to " : ""}${dur.duration.amount} ${dur.duration.type}${dur.duration.amount > 1 ? "s" : ""}` : title(dur.type)) : "",
        concentration: !!dur?.concentration, ritual: !!s.meta?.ritual, classes: classes2,
        attack: (s.spellAttack || []).length > 0, save: (s.savingThrow || [])[0] || null, damage: s.damageInflict || [],
        text: renderEntries(s.entries) + (s.entriesHigherLevel ? "\n\n" + renderEntries(s.entriesHigherLevel) : ""),
      });
    }
  }

  // items (base + magic)
  const DMG: Record<string, string> = { B: "bludgeoning", P: "piercing", S: "slashing", N: "necrotic", R: "radiant", F: "fire", C: "cold", O: "force", L: "lightning", T: "thunder", A: "acid", I: "poison", Y: "psychic" };
  const PROP: Record<string, string> = { A: "ammunition", AF: "ammunition", BF: "burst fire", F: "finesse", H: "heavy", L: "light", LD: "loading", R: "reach", RLD: "reload", S: "special", T: "thrown", "2H": "two-handed", V: "versatile" };
  const ARMOR: Record<string, string> = { LA: "light", MA: "medium", HA: "heavy", S: "shield" };
  const items: ItemData[] = [];
  const pushItem = (it: RawItem, magic: boolean) => {
    if (!allowed("items", it)) return;
    const type = (it.type || "").split("|")[0];
    const armorType = ARMOR[type] || null;
    items.push({
      id: idOf(it.name, it.source), name: nameOf(it), source: it.source, link: null,
      kind: armorType ? "armor" : it.weapon || it.weaponCategory || ["M", "R"].includes(type) ? "weapon" : "gear",
      armorType, ac: it.ac ?? null, strength: it.strength ? +it.strength : null, stealth: !!it.stealth,
      weaponCategory: it.weaponCategory || null, ranged: type === "R",
      dmg1: it.dmg1 || null, dmg2: it.dmg2 || null, dmgType: (it.dmgType && DMG[it.dmgType]) || null,
      properties: (it.property || []).map((p) => PROP[(typeof p === "string" ? p : p.uid || "").split("|")[0]] || "").filter(Boolean),
      range: it.range || null, weight: it.weight ?? null, value: it.value ?? null,
      magic, rarity: it.rarity && it.rarity !== "none" ? it.rarity : null, attunement: !!it.reqAttune,
      bonusAc: it.bonusAc ? parseInt(it.bonusAc) : 0, bonusWeapon: it.bonusWeapon ? parseInt(it.bonusWeapon) : 0,
      baseItem: it.baseItem ? it.baseItem.split("|")[0] : null,
    });
  };
  (await read<{ baseitem: RawItem[] }>("items-base.json")).baseitem.forEach((i) => pushItem(i, false));
  (await read<{ item: RawItem[] }>("items.json")).item.forEach((i) => pushItem(i, true));
  // magic armour and weapons inherit the stats of their base item
  const inherited = ["kind", "armorType", "ac", "strength", "stealth", "weaponCategory", "ranged", "dmg1", "dmg2", "dmgType", "properties", "range"] as const;
  for (const it of items) {
    if (!it.baseItem) continue;
    const baseName = it.baseItem;
    const base = items.find((b) => lc(b.name) === lc(baseName) && !b.magic);
    if (!base) continue;
    const target = it as unknown as Record<string, unknown>, source = base as unknown as Record<string, unknown>;
    for (const k of inherited) {
      const v = target[k];
      if (v == null || (Array.isArray(v) && !v.length) || (k === "kind" && it.kind === "gear")) target[k] = source[k];
    }
    if (it.weight == null) it.weight = base.weight;
  }

  // names only for the sources that are actually used
  const used = new Set<string>([...races, ...races.flatMap((r) => r.subraces), ...classes, ...classes.flatMap((c) => c.subclasses), ...backgrounds, ...feats, ...spells, ...items].map((x) => x.source));
  const books = (await read<BooksFile>("books.json")).book, adventures = (await read<AdventuresFile>("adventures.json")).adventure;
  const sources = Object.fromEntries([...books, ...adventures].filter((b) => used.has(b.id)).map((b) => [b.id, b.name]));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    meta: { generated: new Date().toISOString(), srdOnly: !!o.srdOnly, sources },
    races: races.sort(byName), classes: classes.sort(byName), backgrounds: backgrounds.sort(byName), feats: feats.sort(byName),
    spells: spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)), items: items.sort(byName),
  };
}

export function summarize(d: Pick<Compendium, "races" | "classes" | "backgrounds" | "feats" | "spells" | "items">) {
  return `races ${d.races.length} (subraces ${d.races.reduce((a, r) => a + r.subraces.length, 0)}), classes ${d.classes.length} (subclasses ${d.classes.reduce((a, c) => a + c.subclasses.length, 0)}), backgrounds ${d.backgrounds.length}, feats ${d.feats.length}, spells ${d.spells.length}, items ${d.items.length}`;
}

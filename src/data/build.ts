// Turns 5etools JSON data into the sheet's compact data format (Compendium).
// Pure: files are read through the `read` callback, so the same code runs in the plugin
// (importing the user's own 5etools data) and in Node scripts (building the bundled SRD set).
//
// Links are NOT resolved here. References inside text become tokens ⟦kind|name|source|display⟧
// and entity links are attached at runtime by Linker (src/data/links.ts), depending on whether
// and where the user keeps a compendium of notes.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type ReadJson = (relPath: string) => Promise<any>;
export interface BuildOptions {
  read: ReadJson;
  /** keep only SRD 5.1 content (uses 5etools' `srd` flags and SRD names) */
  srdOnly?: boolean;
  /** drop 2024-edition content (XPHB/XDMG/XMM and entries marked edition "one") */
  rules2014Only?: boolean;
  /** extra filter, e.g. "only entries that have a note in my compendium" */
  keep?: (kind: string, name: string, source: string) => boolean;
}

const lc = (s: unknown) => String(s ?? "").toLowerCase();
const ABILS = ["str", "dex", "con", "int", "wis", "cha"];
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const SOURCES_2024 = new Set(["XPHB", "XDMG", "XMM", "XScreen"]);
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
export function renderStr(s: unknown): string {
  let out = String(s);
  for (let i = 0; i < 6 && /\{@/.test(out); i++) out = out.replace(/\{@(\w+) ?([^{}]*)\}/g, (_, tag, body) => renderTag(tag, body));
  return out;
}
export function renderEntries(entries: any, depth = 0): string {
  if (entries == null) return "";
  if (!Array.isArray(entries)) entries = [entries];
  const out: string[] = [];
  for (const e of entries) {
    if (typeof e === "string") { out.push(renderStr(e)); continue; }
    if (!e || typeof e !== "object") continue;
    switch (e.type) {
      case "list":
        out.push((e.items || []).map((it: any) => {
          if (typeof it === "string") return `- ${renderStr(it)}`;
          const name = it.name ? `**${renderStr(it.name)}** ` : "";
          return `- ${name}${renderEntries(it.entries || it.entry, depth + 1).replace(/\n\n/g, " ")}`;
        }).join("\n"));
        break;
      case "table": {
        const head = (e.colLabels || []).map(renderStr);
        const rows = (e.rows || []).map((r: any) => (Array.isArray(r) ? r : r.row || []).map((c: any) => typeof c === "object" ? renderEntries(c.roll ? `${c.roll.exact ?? `${c.roll.min}–${c.roll.max}`}` : c.entry || c) : renderStr(c)));
        if (e.caption) out.push(`**${renderStr(e.caption)}**`);
        if (head.length) out.push(`| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n` + rows.map((r: string[]) => `| ${r.join(" | ")} |`).join("\n"));
        break;
      }
      case "inset": case "insetReadaloud": case "quote":
        out.push(renderEntries(e.entries, depth + 1).split("\n").map((l) => `> ${l}`).join("\n"));
        break;
      case "item":
        out.push(`**${renderStr(e.name)}** ${renderEntries(e.entries || e.entry, depth + 1)}`);
        break;
      case "refClassFeature": case "refSubclassFeature": case "refOptionalfeature":
        break; // resolved separately as their own features
      case "abilityDc":
        out.push(`**Spell save DC** = 8 + your proficiency bonus + your ${e.attributes.map((a: string) => a.toUpperCase()).join("/")} modifier`);
        break;
      case "abilityAttackMod":
        out.push(`**Spell attack modifier** = your proficiency bonus + your ${e.attributes.map((a: string) => a.toUpperCase()).join("/")} modifier`);
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
export const plain = (s: string) => s.replace(TOKEN, (_m, _k, _n, _s, d) => d);

// ---------------------------------------------------------------- helpers
const idOf = (...p: unknown[]) => p.map((x) => lc(x).replace(/[^a-z0-9]+/g, "-")).join("|");
function speedOf(sp: any) {
  if (sp == null) return { walk: 30 };
  if (typeof sp === "number") return { walk: sp };
  const o: Record<string, any> = {};
  for (const k of ["walk", "fly", "swim", "climb", "burrow"]) {
    if (sp[k] == null) continue;
    o[k] = sp[k] === true ? "walk" : typeof sp[k] === "object" ? sp[k].number : sp[k];
  }
  return o;
}
function abilityOf(ab: any, lineage?: any) {
  if (lineage) {
    return [
      { label: "+2 / +1", fixed: {}, choose: [{ from: ABILS, count: 1, amount: 2 }, { from: ABILS, count: 1, amount: 1, distinct: true }] },
      { label: "+1 / +1 / +1", fixed: {}, choose: [{ from: ABILS, count: 3, amount: 1 }] },
    ];
  }
  if (!ab) return [];
  return ab.map((a: any) => {
    const opt: any = { fixed: {}, choose: [] };
    for (const [k, v] of Object.entries(a)) {
      if (ABILS.includes(k)) opt.fixed[k] = v;
      else if (k === "choose") {
        if (a.choose.weighted) {
          const w = a.choose.weighted;
          (w.weights || []).forEach((amt: number) => opt.choose.push({ from: w.from, count: 1, amount: amt, distinct: true }));
        } else opt.choose.push({ from: a.choose.from, count: a.choose.count || 1, amount: a.choose.amount || 1 });
      }
    }
    opt.label = [...Object.entries(opt.fixed).map(([k, v]: [string, any]) => `${k.toUpperCase()} ${v > 0 ? "+" : ""}${v}`), ...opt.choose.map((c: any) => `+${c.amount} to ${c.count} of ${c.from.length === 6 ? "any" : c.from.map((x: string) => x.toUpperCase()).join("/")}`)].join(", ");
    return opt;
  });
}
const profList = (arr: any) => {
  if (!arr) return { fixed: [] as string[], choose: [] as any[] };
  const fixed: string[] = [], choose: any[] = [];
  for (const o of arr) for (const [k, v] of Object.entries(o) as [string, any][]) {
    if (k === "choose") choose.push({ from: v.from, count: v.count || 1 });
    else if (k === "any" || k === "anyStandard") choose.push({ from: "any", count: v });
    else if (v === true) fixed.push(k);
  }
  return { fixed, choose };
};
const langText = (arr: any) => {
  if (!arr) return [] as string[];
  const out: string[] = [];
  for (const o of arr) for (const [k, v] of Object.entries(o) as [string, any][]) {
    if (v === true) out.push(title(k));
    else if (k === "anyStandard" || k === "any") out.push(`${v} of your choice`);
    else if (k === "choose") out.push(`${v.count || 1} from ${v.from.map(title).join(", ")}`);
  }
  return out;
};
function resolveCopy(list: any[], x: any): any {
  if (!x._copy) return x;
  const base = list.find((y) => y.name === x._copy.name && y.source === x._copy.source);
  if (!base) return x;
  const merged = { ...resolveCopy(list, base), ...x };
  delete merged._copy;
  // a copy is its own entry: it must not inherit the SRD flag of what it copies
  merged.srd = x.srd;
  return merged;
}

// ---------------------------------------------------------------- build
export async function buildCompendium(o: BuildOptions) {
  const read = o.read;
  const is2024 = (e: any) => SOURCES_2024.has(e.source) || e.edition === "one";
  // SRD: 5etools marks SRD entries with srd: true, or srd: "<SRD name>" when the SRD renames them
  const srdName = (e: any): string | null => (e.srd === true ? e.name : typeof e.srd === "string" ? e.srd : null);
  const allowed = (kind: string, e: any, name = e.name) =>
    (!o.srdOnly || !!srdName(e)) && (!o.rules2014Only || !is2024(e)) && (!o.keep || o.keep(kind, name, e.source));
  const nameOf = (e: any) => (o.srdOnly ? srdName(e) || e.name : e.name);

  // races
  const racesJson = await read("races.json");
  const races: any[] = [];
  for (const r0 of racesJson.race) {
    const r = resolveCopy(racesJson.race, r0);
    if (o.rules2014Only && is2024(r)) continue;
    const subs = racesJson.subrace.filter((s: any) => s.raceName === r.name && s.raceSource === r.source && s.name);
    const subOut: any[] = [];
    for (const s of subs) {
      if (!allowed("races", s, `${r.name} (${s.name})`)) continue;
      subOut.push({
        id: idOf(r.name, s.name, s.source), name: s.name, source: s.source, link: null,
        ability: s.ability ? abilityOf(s.ability) : null,
        overwriteAbility: !!(s.overwrite && s.overwrite.ability),
        speed: s.speed ? speedOf(s.speed) : null,
        darkvision: s.darkvision ?? null,
        skills: profList(s.skillProficiencies),
        languages: langText(s.languageProficiencies),
        resist: s.resist || [],
        traits: (s.entries || []).filter((e: any) => e.name).map((e: any) => ({ name: e.name, text: renderEntries(e.entries) })),
        spells: s.additionalSpells || null,
        hpPerLevel: /hit point maximum increases by 1/i.test(JSON.stringify(s.entries || "")) ? 1 : 0,
      });
    }
    const baseOk = allowed("races", r);
    if (!baseOk && !subOut.length) continue;
    races.push({
      id: idOf(r.name, r.source), name: nameOf(r), source: r.source, link: null,
      size: (r.size || ["M"]).map((s: string) => ({ T: "Tiny", S: "Small", M: "Medium", L: "Large" } as Record<string, string>)[s] || s),
      speed: speedOf(r.speed),
      ability: abilityOf(r.ability, r.lineage),
      darkvision: r.darkvision ?? null,
      skills: profList(r.skillProficiencies), tools: profList(r.toolProficiencies),
      weapons: profList(r.weaponProficiencies), armor: profList(r.armorProficiencies),
      languages: langText(r.languageProficiencies),
      resist: r.resist || [], feats: r.feats || null,
      traits: (r.entries || []).filter((e: any) => e.name).map((e: any) => ({ name: e.name, text: renderEntries(e.entries) })),
      spells: r.additionalSpells || null,
      subraces: subOut,
      subraceRequired: subOut.length > 0 && !baseOk,
    });
  }

  // classes
  const sourcesSeen = new Set<string>();
  const classes: any[] = [];
  const classIndex = await read("class/index.json");
  for (const file of Object.values(classIndex) as string[]) {
    const cj = await read(`class/${file}`);
    for (const c of cj.class || []) {
      if (!allowed("classes", c)) continue;
      const featOk = (f: any) => !o.srdOnly || !!f.srd;
      const feat = (ref: any) => {
        const s = typeof ref === "string" ? ref : ref.classFeature;
        const [name, cls, clsSrc, lvl, src] = s.split("|");
        const f = cj.classFeature.find((x: any) => x.name === name && x.className === cls && x.level === +lvl && x.source === (src || clsSrc || "PHB"));
        if (!f || !featOk(f)) return null;
        return { name, level: +lvl, source: f.source, text: renderEntries(f.entries), optional: !!f.isClassFeatureVariant, subclassFeature: typeof ref === "object" && !!ref.gainSubclassFeature, link: null };
      };
      const features = (c.classFeatures || []).map(feat).filter(Boolean)
        .filter((f: any) => !f.optional || !o.rules2014Only || !SOURCES_2024.has(f.source));
      const tableCols: any[] = [];
      for (const g of c.classTableGroups || []) {
        if (g.rowsSpellProgression) continue;
        (g.colLabels || []).forEach((lab: any, i: number) => {
          const label = plain(renderStr(lab));
          if (/cantrips known|spells known|spell slots|slot level|prepared/i.test(label)) return;
          tableCols.push({ label, rows: g.rows.map((r: any) => {
            const v = r[i];
            if (v && typeof v === "object") return v.value ?? (v.toRoll ? v.toRoll.map((d: any) => `${d.number}d${d.faces}`).join("+") : plain(renderStr(JSON.stringify(v))));
            return typeof v === "string" ? plain(renderStr(v)) : v;
          }) });
        });
      }
      const subclasses: any[] = [];
      for (const sc of (cj.subclass || []).filter((s: any) => s.className === c.name && s.classSource === c.source)) {
        if (!allowed("classes", sc)) continue;
        const sfeats: any[] = [];
        const pushSub = (name: string, scShort: string, scSrc: string, lvl: string, src: string, clsSrc = "PHB") => {
          const f = cj.subclassFeature.find((x: any) => x.name === name && x.subclassShortName === scShort && x.level === +lvl && x.source === (src || scSrc || clsSrc || "PHB"));
          if (!f || !featOk(f) || sfeats.some((y) => y.name === name && y.level === +lvl)) return null;
          sfeats.push({ name, level: +lvl, source: f.source, text: renderEntries(f.entries), link: null });
          return f;
        };
        for (const ref of sc.subclassFeatures || []) {
          const [name, , clsSrc, scShort, scSrc, lvl, src] = ref.split("|");
          const f = pushSub(name, scShort, scSrc, lvl, src, clsSrc);
          // nested refs inside the first feature (e.g. "Evocation Savant" inside "School of Evocation")
          if (f) JSON.stringify(f.entries).replace(/"subclassFeature":"([^"]+)"/g, (_m: string, rr: string) => {
            const [n2, , , s2, ss2, l2, src2] = rr.split("|");
            pushSub(n2, s2, ss2, l2, src2);
            return "";
          });
        }
        sourcesSeen.add(sc.source);
        subclasses.push({
          id: idOf(c.name, sc.shortName, sc.source), name: nameOf(sc), shortName: sc.shortName, source: sc.source, link: null,
          features: sfeats.sort((a, b) => a.level - b.level),
          spellcasting: sc.casterProgression ? { ability: sc.spellcastingAbility, progression: sc.casterProgression, cantrips: sc.cantripProgression || null, known: sc.spellsKnownProgression || null, list: sc.spellcastingAbility ? "Wizard" : null } : null,
          additionalSpells: sc.additionalSpells || null,
        });
      }
      const sp = c.startingProficiencies || {};
      const profText = (a: any) => plain(renderStr(typeof a === "string" ? a : a.full || a.proficiency || ""));
      sourcesSeen.add(c.source);
      classes.push({
        id: idOf(c.name, c.source), name: nameOf(c), source: c.source, link: null,
        hd: c.hd?.faces || 8, saves: c.proficiency || [],
        armor: (sp.armor || []).map(profText), weapons: (sp.weapons || []).map(profText), tools: (sp.tools || []).map(profText),
        skills: (sp.skills || []).map((s: any) => (s.choose ? { from: s.choose.from, count: s.choose.count } : { from: "any", count: s.any })),
        spellcasting: c.casterProgression ? { ability: c.spellcastingAbility, progression: c.casterProgression, prepared: c.preparedSpells || null, cantrips: c.cantripProgression || null, known: c.spellsKnownProgression || null, knownFixed: c.spellsKnownProgressionFixed || null, list: c.name } : null,
        pactSlots: c.casterProgression === "pact" ? (c.classTableGroups || []).flatMap((g: any) => (g.colLabels?.includes("Spell Slots") ? [g.rows.map((r: any) => ({ slots: r[g.colLabels.indexOf("Spell Slots")], level: parseInt(plain(renderStr(r[g.colLabels.indexOf("Slot Level")]))) || 1 }))] : []))[0] || null : null,
        tableCols,
        subclassTitle: c.subclassTitle || "Subclass",
        subclassLevel: features.find((f: any) => f.subclassFeature)?.level || 3,
        features,
        multiclass: c.multiclassing ? {
          requirements: c.multiclassing.requirements || {},
          armor: (c.multiclassing.proficienciesGained?.armor || []).map(profText),
          weapons: (c.multiclassing.proficienciesGained?.weapons || []).map(profText),
          skills: c.multiclassing.proficienciesGained?.skills?.map((s: any) => (s.choose ? { from: s.choose.from, count: s.choose.count } : null)).filter(Boolean) || [],
        } : null,
        subclasses,
      });
    }
  }

  // backgrounds
  const bgJson = await read("backgrounds.json");
  const backgrounds: any[] = [];
  for (const b0 of bgJson.background) {
    const b = resolveCopy(bgJson.background, b0);
    if (!allowed("backgrounds", b)) continue;
    const fe = (function find(es: any[]): any {
      for (const e of es || []) if (e && typeof e === "object") { if (e.name && /^Feature:/.test(e.name)) return e; const r = find(e.entries); if (r) return r; }
      return null;
    })(b.entries);
    backgrounds.push({
      id: idOf(b.name, b.source), name: nameOf(b), source: b.source, link: null,
      skills: profList(b.skillProficiencies), tools: profList(b.toolProficiencies), languages: langText(b.languageProficiencies),
      feature: fe ? { name: fe.name.replace(/^Feature:\s*/, ""), heading: fe.name, text: renderEntries(fe.entries), link: null } : null,
      feats: b.feats || null,
    });
  }

  // feats
  const feats: any[] = [];
  for (const f of (await read("feats.json")).feat) {
    if (!allowed("feats", f)) continue;
    const prereq = (f.prerequisite || []).map((p: any) => Object.entries(p).map(([k, v]: [string, any]) => {
      if (k === "ability") return v.map((a: any) => Object.entries(a).map(([ab, n]) => `${ab.toUpperCase()} ${n}`).join(" or ")).join("; ");
      if (k === "race") return v.map((r: any) => title(r.name) + (r.subrace ? ` (${r.subrace})` : "")).join(" or ");
      if (k === "level") return `Level ${typeof v === "object" ? v.level : v}`;
      if (k === "spellcasting" || k === "spellcasting2020") return "Spellcasting";
      if (k === "proficiency") return v.map((x: any) => Object.entries(x).map(([a, b]) => `${b} ${a}`).join(", ")).join("; ");
      return typeof v === "string" ? v : "";
    }).filter(Boolean).join(", ")).join(" or ");
    feats.push({ id: idOf(f.name, f.source), name: nameOf(f), source: f.source, link: null, prereq, ability: f.ability ? abilityOf(f.ability) : [], text: renderEntries(f.entries) });
  }

  // spells
  const spellSources = await read("spells/sources.json");
  const SCHOOL: Record<string, string> = { A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment", V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation" };
  const spells: any[] = [];
  for (const file of Object.values(await read("spells/index.json")) as string[]) {
    for (const s of (await read(`spells/${file}`)).spell || []) {
      if (!allowed("spells", s)) continue;
      const lists = spellSources[s.source]?.[s.name] || {};
      const classes2 = [...new Set([...(lists.class || []), ...(lists.classVariant || [])].map((c: any) => c.name))];
      const t = s.time?.[0];
      const range = s.range?.distance ? (s.range.distance.amount ? `${s.range.distance.amount} ${s.range.distance.type}` : title(s.range.distance.type)) + (s.range.type !== "point" ? ` (${s.range.type})` : "") : title(s.range?.type || "");
      const dur = s.duration?.[0];
      spells.push({
        id: idOf(s.name, s.source), name: nameOf(s), source: s.source, link: null,
        level: s.level, school: SCHOOL[s.school] || s.school,
        time: t ? `${t.number} ${t.unit}${t.number > 1 ? "s" : ""}` : "",
        range,
        components: [s.components?.v && "V", s.components?.s && "S", s.components?.m && `M (${typeof s.components.m === "string" ? s.components.m : s.components.m.text})`].filter(Boolean).join(", "),
        duration: dur ? (dur.type === "timed" ? `${dur.concentration ? "Concentration, up to " : ""}${dur.duration.amount} ${dur.duration.type}${dur.duration.amount > 1 ? "s" : ""}` : title(dur.type)) : "",
        concentration: !!dur?.concentration, ritual: !!s.meta?.ritual, classes: classes2,
        attack: (s.spellAttack || []).length > 0, save: (s.savingThrow || [])[0] || null, damage: s.damageInflict || [],
        text: renderEntries(s.entries) + (s.entriesHigherLevel ? "\n\n" + renderEntries(s.entriesHigherLevel) : ""),
      });
    }
  }

  // items (base + magic)
  const DMG: Record<string, string> = { B: "bludgeoning", P: "piercing", S: "slashing", N: "necrotic", R: "radiant", F: "fire", C: "cold", O: "force", L: "lightning", T: "thunder", A: "acid", I: "poison", Y: "psychic" };
  const PROP: Record<string, string> = { A: "ammunition", AF: "ammunition", BF: "burst fire", F: "finesse", H: "heavy", L: "light", LD: "loading", R: "reach", RLD: "reload", S: "special", T: "thrown", "2H": "two-handed", V: "versatile" };
  const items: any[] = [];
  const pushItem = (it: any, magic: boolean) => {
    if (!allowed("items", it)) return;
    const type = (it.type || "").split("|")[0];
    const armorType = ({ LA: "light", MA: "medium", HA: "heavy", S: "shield" } as Record<string, string>)[type] || null;
    items.push({
      id: idOf(it.name, it.source), name: nameOf(it), source: it.source, link: null,
      kind: armorType ? "armor" : it.weapon || it.weaponCategory || ["M", "R"].includes(type) ? "weapon" : "gear",
      armorType, ac: it.ac ?? null, strength: it.strength ? +it.strength : null, stealth: !!it.stealth,
      weaponCategory: it.weaponCategory || null, ranged: type === "R",
      dmg1: it.dmg1 || null, dmg2: it.dmg2 || null, dmgType: DMG[it.dmgType] || null,
      properties: (it.property || []).map((p: any) => PROP[(typeof p === "string" ? p : p.uid || "").split("|")[0]] || "").filter(Boolean),
      range: it.range || null, weight: it.weight ?? null, value: it.value ?? null,
      magic, rarity: it.rarity && it.rarity !== "none" ? it.rarity : null, attunement: !!it.reqAttune,
      bonusAc: it.bonusAc ? parseInt(it.bonusAc) : 0, bonusWeapon: it.bonusWeapon ? parseInt(it.bonusWeapon) : 0,
      baseItem: it.baseItem ? it.baseItem.split("|")[0] : null,
    });
  };
  (await read("items-base.json")).baseitem.forEach((i: any) => pushItem(i, false));
  (await read("items.json")).item.forEach((i: any) => pushItem(i, true));
  for (const it of items) {
    if (!it.baseItem) continue;
    const base = items.find((b) => lc(b.name) === lc(it.baseItem) && !b.magic);
    if (!base) continue;
    for (const k of ["kind", "armorType", "ac", "strength", "stealth", "weaponCategory", "ranged", "dmg1", "dmg2", "dmgType", "properties", "range"]) {
      if (it[k] == null || (Array.isArray(it[k]) && !it[k].length) || (k === "kind" && it.kind === "gear")) it[k] = base[k];
    }
    if (it.weight == null) it.weight = base.weight;
  }

  // names only for the sources that are actually used
  const used = new Set<string>([...races, ...races.flatMap((r) => r.subraces), ...classes, ...classes.flatMap((c) => c.subclasses), ...backgrounds, ...feats, ...spells, ...items].map((x: any) => x.source));
  const books = Object.fromEntries([...(await read("books.json")).book, ...(await read("adventures.json")).adventure].filter((b: any) => used.has(b.id)).map((b: any) => [b.id, b.name]));
  const byName = (a: any, b: any) => a.name.localeCompare(b.name);
  return {
    meta: { generated: new Date().toISOString(), srdOnly: !!o.srdOnly, sources: books },
    races: races.sort(byName), classes: classes.sort(byName), backgrounds: backgrounds.sort(byName), feats: feats.sort(byName),
    spells: spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)), items: items.sort(byName),
  };
}

export function summarize(d: { races: any[]; classes: any[]; backgrounds: any[]; feats: any[]; spells: any[]; items: any[] }) {
  return `races ${d.races.length} (subraces ${d.races.reduce((a, r) => a + r.subraces.length, 0)}), classes ${d.classes.length} (subclasses ${d.classes.reduce((a, c) => a + c.subclasses.length, 0)}), backgrounds ${d.backgrounds.length}, feats ${d.feats.length}, spells ${d.spells.length}, items ${d.items.length}`;
}

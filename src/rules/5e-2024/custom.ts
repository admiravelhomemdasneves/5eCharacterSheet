// The custom entries of the 2024 rules (D&D 5e, SRD 5.2): the kinds of the 2014 rules, with what the 2024
// rules change. Species have no ability increases, backgrounds do and give an origin feat, feats have a
// category, weapons a mastery, and classes prepare spells by a table.
import type { Ruleset, Choice, CustomContext, FieldDef, KindDef } from "../../custom/schema.ts";
import { num, str, strs } from "../../custom/schema.ts";
import type { CustomEntry } from "../../custom/format.ts";
import { ABILITIES, PROFILE_2024, type Ability, type AbilityOption, type Compendium, type ChoiceOption, type Spellcasting } from "../engine.ts";
import { KINDS_5E, LEVELS_HELP, abilityChoices, numbersByLevel } from "../5e-2014/custom.ts";

const MASTERIES = ["Cleave", "Graze", "Nick", "Push", "Sap", "Slow", "Topple", "Vex"];
const FEAT_CATEGORIES: Choice[] = [{ value: "O", label: "Origin" }, { value: "G", label: "General" }, { value: "FS", label: "Fighting Style" }, { value: "EB", label: "Epic Boon" }];
const ABILITY_FIELDS = ["abilityFixed", "abilityChoose"];

const base = (kind: string) => KINDS_5E.find((k) => k.kind === kind)!;
/** A kind of the 2014 rules with `over` in its place, and `after` run on what it added to the data. */
function changed(kind: string, over: Partial<KindDef>, after: (e: CustomEntry, data: Compendium) => void = () => {}): KindDef {
  const k = base(kind);
  return { ...k, ...over, apply: (e, data) => { const problem = k.apply(e, data); if (!problem) after(e, data); return problem; } };
}
const without = (fields: FieldDef[], keys: string[]) => fields.filter((f) => !keys.includes(f.key));
/** `fields` with a new field after the one of `key`. */
const insertedAfter = (fields: FieldDef[], key: string, ...added: FieldDef[]) => fields.flatMap((f) => (f.key === key ? [f, ...added] : [f]));

const originFeats = (ctx: CustomContext): Choice[] => ctx.data.feats.filter((f) => f.category === "O").map((f) => ({ value: f.id, label: `${f.name} (${f.source})` }));
/** The +2/+1 or +1/+1/+1 of a background, among `from` */
function backgroundAbility(from: Ability[]): AbilityOption[] {
  const one = (amount: number) => ({ from, count: 1, amount, distinct: true });
  return from.length ? [{ label: "+2 / +1", fixed: {}, choose: [one(2), one(1)] }, { label: "+1 / +1 / +1", fixed: {}, choose: [one(1), one(1), one(1)] }] : [];
}

const species = changed("race", {
  label: ["Species", "Species"],
  fields: [
    ...without(base("race").fields, [...ABILITY_FIELDS, "subraceRequired"]),
    { key: "hpPerLevel", label: "Hit points per level", help: "Extra hit points at each level, as the dwarf's.", type: "number", min: 0, max: 5 },
    { key: "originFeat", label: "Gives an origin feat", help: "As the human: the player chooses one in Character Creation.", type: "checkbox" },
    { key: "subraceRequired", label: "A lineage must be chosen", help: "Character Creation asks for one while none is chosen.", type: "checkbox" },
  ],
  manual: { ...base("race").manual!, label: "species" },
}, (e, data) => {
  const r = data.races.find((x) => x.id === e.id)!;
  if (num(e.data, "hpPerLevel")) r.hpPerLevel = num(e.data, "hpPerLevel");
  if (e.data.originFeat === true) r.feats = [{ anyFromCategory: { category: ["O"], count: 1 } }];
});

const lineage = changed("subrace", {
  label: ["Lineage", "Lineages"],
  fields: without(base("subrace").fields, [...ABILITY_FIELDS, "overwriteAbility"]).map((f) => (f.key === "race" ? { ...f, label: "Species", help: "The species it is a lineage of: one of the rules data or your own." } : f)),
  summary: (e) => (base("subrace").summary?.(e) ?? "").replace(/^Subrace/, "Lineage"),
  manual: { ...base("subrace").manual!, label: "lineage" },
});

const speciesTrait = changed("race-feature", { label: ["Species trait", "Species traits"] });

const background = changed("background", {
  fields: [
    { key: "abilityFrom", label: "Ability scores", help: "The three the player increases: +2 to one and +1 to another, or +1 to all three.", type: "multiselect", options: abilityChoices },
    { key: "originFeat", label: "Origin feat", help: "The feat it gives. Your own feats need the Origin category to be here.", type: "select", options: originFeats },
    ...without(base("background").fields, ["featureName", "featureText"]),
  ],
}, (e, data) => {
  const b = data.backgrounds.find((x) => x.id === e.id)!;
  b.ability = backgroundAbility(strs(e.data, "abilityFrom").filter((a): a is Ability => (ABILITIES as string[]).includes(a)));
  b.originFeats = str(e.data, "originFeat") ? [{ id: str(e.data, "originFeat") }] : [];
});

const feat = changed("feat", {
  fields: [{ key: "category", label: "Category", help: "Origin feats are the ones backgrounds and species give.", type: "select", default: "G", options: FEAT_CATEGORIES }, ...base("feat").fields],
}, (e, data) => {
  if (str(e.data, "category")) data.feats.find((x) => x.id === e.id)!.category = str(e.data, "category");
});

const item = changed("item", {
  fields: insertedAfter(base("item").fields, "properties", { key: "mastery", label: "Mastery", help: "The mastery property of the weapon.", type: "select", visible: (d) => str(d, "type") === "weapon", options: MASTERIES.map((m) => ({ value: m, label: m })) }),
}, (e, data) => {
  if (str(e.data, "type") === "weapon" && str(e.data, "mastery")) data.items.find((x) => x.id === e.id)!.mastery = [str(e.data, "mastery")];
});

/** 2024 spellcasting: half casters have slots from level 1, and spells prepared come from a table. */
function spellcastingFields(fields: FieldDef[]): FieldDef[] {
  return fields.map((f): FieldDef => {
    if (f.key === "preparation") return { ...f, default: "prepared" };
    if (f.key === "preparedCount") return { key: "preparedByLevel", label: "Spells prepared", help: LEVELS_HELP, type: "text", placeholder: "1: 4, 2: 5, 3: 6", visible: f.visible };
    if (f.key === "progression" && f.type === "select" && Array.isArray(f.options)) return { ...f, options: f.options.map((o) => (o.value === "1/2" ? { ...o, value: "artificer" } : o)) };
    return f;
  });
}
function preparedByTable(sc: Spellcasting | null, d: Record<string, unknown>) {
  if (!sc?.prepared) return;
  sc.prepared = null;
  const table = numbersByLevel(str(d, "preparedByLevel"));
  if (table) sc.preparedTable = table;
}

const klass = changed("class", {
  fields: insertedAfter(spellcastingFields(base("class").fields), "skillChoiceFrom", { key: "weaponMasteries", label: "Weapon masteries", help: `How many weapons it masters. ${LEVELS_HELP}`, type: "text", placeholder: "1: 2, 4: 3" }),
}, (e, data) => {
  const c = data.classes.find((x) => x.id === e.id)!;
  preparedByTable(c.spellcasting, e.data);
  const counts = numbersByLevel(str(e.data, "weaponMasteries"));
  if (!counts) return;
  const options = data.items.filter((i) => i.mastery?.length).map((i): ChoiceOption => ({ id: i.id, name: `${i.name} (${i.mastery![0]})`, source: i.source, text: "", link: null }));
  c.choices = [...c.choices ?? [], { name: "Weapon Mastery", feature: null, counts, options }];
});

const subclass = changed("subclass", { fields: spellcastingFields(base("subclass").fields) }, (e, data) => {
  const sub = data.classes.flatMap((c) => c.subclasses).find((x) => x.id === e.id);
  if (sub) preparedByTable(sub.spellcasting, e.data);
});

export const RULESET_2024: Ruleset = {
  id: "5e-2024", label: "D&D 5e (2024)", profile: PROFILE_2024,
  kinds: [species, lineage, speciesTrait, klass, subclass, base("class-feature"), background, feat, base("spell"), item],
};

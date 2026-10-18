// The sheet's sections, in the order they appear. Each can be hidden per character (CharState.ui.hidden)
// and left out of new sheets in the settings (SheetSettings.hiddenSections). "Character Creation" is
// not listed: it only appears while choices are pending and goes away by itself.
export const SECTIONS = [
  { key: "abilities", label: "Ability Scores" },
  { key: "combat", label: "Combat" },
  { key: "skills", label: "Skills" },
  { key: "attacks", label: "Attacks" },
  { key: "race-features", label: "Race & Background Features" },
  { key: "class-features", label: "Class Features" },
  { key: "feats", label: "Feats & Ability Score Improvements" },
  { key: "spells", label: "Spellcasting" },
  { key: "inventory", label: "Inventory & Coins" },
  { key: "profs", label: "Proficiencies & Languages" },
  { key: "personality", label: "Personality & Appearance" },
  { key: "biography", label: "Biography & Diary" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
export const sectionLabel = (key: string) => SECTIONS.find((x) => x.key === key)?.label ?? key;

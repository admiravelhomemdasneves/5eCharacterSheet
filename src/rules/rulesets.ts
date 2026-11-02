// The rulesets custom entries can be made for (src/custom/schema.ts): one for now, the 2014 rules.
import type { Ruleset } from "../custom/schema.ts";
import { RULESET_2014 } from "./5e-2014/custom.ts";

export const RULESETS: Ruleset[] = [RULESET_2014];
/** The ruleset of an id (an unknown one: the 2014 rules). */
export const rulesetById = (id: string) => RULESETS.find((r) => r.id === id) ?? RULESET_2014;

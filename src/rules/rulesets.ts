// The rules a character can be made with, and custom entries for (src/custom/schema.ts).
import type { Ruleset } from "../custom/schema.ts";
import { RULESET_2014 } from "./5e-2014/custom.ts";
import { RULESET_2024 } from "./5e-2024/custom.ts";

export const RULESETS: Ruleset[] = [RULESET_2014, RULESET_2024];
/** The ruleset of an id (an unknown one: the 2014 rules). */
export const rulesetById = (id: string) => RULESETS.find((r) => r.id === id) ?? RULESET_2014;

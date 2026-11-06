// The 2024 rules (D&D 5e, SRD 5.2). Custom entries for them use the same forms as for the 2014 rules.
import type { Ruleset } from "../../custom/schema.ts";
import { PROFILE_2024 } from "../engine.ts";
import { KINDS_5E } from "../5e-2014/custom.ts";

export const RULESET_2024: Ruleset = { id: "5e-2024", label: "D&D 5e (2024)", kinds: KINDS_5E, profile: PROFILE_2024 };

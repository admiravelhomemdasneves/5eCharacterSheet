// Small text helpers shared by the importer, the links and the sheet.

/** lowercase text of a value (null and undefined are "") */
export const lc = (s: string | number | null | undefined) => String(s ?? "").toLowerCase();
/** every word capitalised: "sleight of hand" -> "Sleight Of Hand" */
export const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

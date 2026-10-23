import { test } from "node:test";
import assert from "node:assert/strict";
import { renamedPath } from "../src/files.ts";

test("renamed paths: the item itself, what is inside a renamed folder, and nothing else", () => {
  assert.equal(renamedPath("Heroes/Ann.md", "Heroes/Ann.md", "Heroes/Anna.md"), "Heroes/Anna.md");
  assert.equal(renamedPath("Heroes/Ann.md", "Heroes", "Party"), "Party/Ann.md");
  assert.equal(renamedPath("Heroes/Old/Ann.md", "Heroes", "Archive/Heroes"), "Archive/Heroes/Old/Ann.md");
  // a folder whose name starts the same is another folder
  assert.equal(renamedPath("Heroes 2/Ann.md", "Heroes", "Party"), null);
  assert.equal(renamedPath("Ann.md", "Bob.md", "Rob.md"), null);
});

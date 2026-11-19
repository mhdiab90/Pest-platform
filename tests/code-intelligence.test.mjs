import test from "node:test";
import assert from "node:assert/strict";
import "../code-intelligence.js";

const engine = globalThis.window.PEST_CODE_INTELLIGENCE;

test("continues the dominant prefix and preserves zero padding", () => {
  const result = engine.suggestNext({
    records: [{code:"CUS-001"},{code:"CUS-002"},{code:"CUS-009"}],
    fallbackPrefix:"CUS"
  });
  assert.equal(result.code,"CUS-010");
  assert.equal(result.pattern,"CUS-###");
  assert.equal(result.source,"inferred");
  assert.equal(result.matchedCount,3);
});

test("continues a code family containing multiple numeric sections", () => {
  const result = engine.suggestNext({
    records: [{code:"PRJ-2026-004"},{code:"PRJ-2026-005"}],
    fallbackPrefix:"PRJ"
  });
  assert.equal(result.code,"PRJ-2026-006");
  assert.equal(result.pattern,"PRJ-2026-###");
});

test("keeps separate sequences for different project types", () => {
  const result = engine.suggestNext({
    records: [
      {code:"SUP-020",projectType:"supply"},
      {code:"SUP-021",projectType:"supply"},
      {code:"SRV-004",projectType:"service"},
      {code:"SRV-005",projectType:"service"}
    ],
    fallbackPrefix:"PRJ",
    groupBy:"projectType",
    groupValue:"service"
  });
  assert.equal(result.code,"SRV-006");
  assert.equal(result.matchedCount,2);
});

test("continues item sequences within the selected item group only", () => {
  const result = engine.suggestNext({
    records: [
      {code:"RAW-007",groupCode:"RAW"},
      {code:"RAW-008",groupCode:"RAW"},
      {code:"FIN-099",groupCode:"FIN"}
    ],
    fallbackPrefix:"ITM",
    groupBy:"groupCode",
    groupValue:"RAW"
  });
  assert.equal(result.code,"RAW-009");
});

test("supports Arabic and Persian digits when reading legacy codes", () => {
  const result = engine.suggestNext({
    records: [{code:"عميل-٠٠٧"},{code:"عميل-٠٠٨"}],
    fallbackPrefix:"CUS"
  });
  assert.equal(result.code,"عميل-009");
});

test("uses a safe default when no stable sequence can be inferred", () => {
  const result = engine.suggestNext({
    records: [{code:"MAIN"},{code:"SUPPLIER"}],
    fallbackPrefix:"VND"
  });
  assert.equal(result.code,"VND-001");
  assert.equal(result.source,"fallback");
});

test("preserves existing prefixes even when they differ from the old hard-coded prefix", () => {
  const result = engine.suggestNext({
    records: [{code:"A_01"},{code:"A_02"}],
    fallbackPrefix:"ITM"
  });
  assert.equal(result.code,"A_03");
});

test("does not reuse a code that already exists", () => {
  const result = engine.suggestNext({
    records: [{code:"ACC-001"},{code:"ACC-002"},{code:"ACC-003"},{code:"ACC-005"}],
    fallbackPrefix:"ACC"
  });
  assert.equal(result.code,"ACC-006");
});

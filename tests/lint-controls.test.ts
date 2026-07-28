import assert from "node:assert/strict";
import test from "node:test";

import {
  TPS_LINTER_CONTROL_KEY,
  TPS_LINTER_CONTROL_KEYS,
  TPS_LINTER_DISABLED_RULES_KEY,
  TPS_LINTER_MAX_FRONTMATTER_CHARACTERS,
  TPS_LINTER_RULE_IDS,
  parseLintControls,
} from "../src/lint-controls.ts";
import { TPS_LINTER_MAX_FRONTMATTER_LINES } from "../src/frontmatter-sort.ts";

test("exports stable namespaced control keys and rule IDs", () => {
  assert.equal(TPS_LINTER_CONTROL_KEY, "tps-linter");
  assert.equal(
    TPS_LINTER_DISABLED_RULES_KEY,
    "tps-linter-disabled-rules",
  );
  assert.deepEqual(TPS_LINTER_CONTROL_KEYS, [
    "tps-linter",
    "tps-linter-disabled-rules",
  ]);
  assert.deepEqual(TPS_LINTER_RULE_IDS, [
    "filename",
    "whitespace-only-lines",
    "blank-lines",
    "trailing-whitespace",
    "trailing-blank-lines",
    "final-newline",
    "heading-capitalization",
    "heading-levels",
    "frontmatter-blank-line",
    "frontmatter-sort",
    "all",
  ]);
});

test("tps-linter false disables every rule while true is a no-op", () => {
  const disabled = parseLintControls(
    "---\ntps-linter: false\ntitle: Test\n---\nBody\n",
  );
  assert.equal(disabled.controlsPresent, true);
  assert.equal(disabled.disabledAll, true);
  assert.deepEqual([...disabled.disabledRules], []);
  assert.match(disabled.reason ?? "", /tps-linter: false/);

  const enabled = parseLintControls(
    "---\ntps-linter: true\ntitle: Test\n---\nBody\n",
  );
  assert.equal(enabled.controlsPresent, true);
  assert.equal(enabled.disabledAll, false);
  assert.deepEqual([...enabled.disabledRules], []);
  assert.equal(enabled.reason, null);
});

test("top-level controls work in every safe YAML mapping form", () => {
  for (const input of [
    "---\n  tps-linter: false\n  title: Test\n---\nBody\n",
    "---\n{tps-linter: false, title: Test}\n---\nBody\n",
    "---\n? tps-linter\n: false\n---\nBody\n",
    "---\n\"\\u0074ps-linter\": false\n---\nBody\n",
  ]) {
    const result = parseLintControls(input);
    assert.equal(result.controlsPresent, true, input);
    assert.equal(result.disabledAll, true, input);
    assert.match(result.reason ?? "", /tps-linter: false/, input);
  }
});

test("disabled rules accept one stable scalar ID or a sequence", () => {
  const scalar = parseLintControls(
    "---\ntps-linter-disabled-rules: filename\n---\n",
  );
  assert.equal(scalar.disabledAll, false);
  assert.deepEqual([...scalar.disabledRules], ["filename"]);

  const sequence = parseLintControls(
    [
      "---\n",
      "tps-linter-disabled-rules:\n",
      "  - blank-lines\n",
      "  - heading-levels\n",
      "  - frontmatter-sort\n",
      "---\n",
    ].join(""),
  );
  assert.equal(sequence.disabledAll, false);
  assert.deepEqual([...sequence.disabledRules], [
    "blank-lines",
    "heading-levels",
    "frontmatter-sort",
  ]);
  assert.equal(sequence.reason, null);
});

test("all in a scalar or sequence disables every rule", () => {
  for (const input of [
    "---\ntps-linter-disabled-rules: all\n---\n",
    [
      "---\n",
      "tps-linter-disabled-rules: [blank-lines, all]\n",
      "---\n",
    ].join(""),
  ]) {
    const result = parseLintControls(input);
    assert.equal(result.disabledAll, true, input);
    assert.equal(result.disabledRules.has("all"), true, input);
    assert.match(result.reason ?? "", /disabled-rules: all/, input);
  }
});

test("only exact top-level control keys are recognized", () => {
  for (const input of [
    "---\nTPS-Linter: false\n---\n",
    "---\ntps-linter-extra: false\n---\n",
    "---\nparent:\n  tps-linter: false\n---\n",
    "# tps-linter: false\n",
    "Body\n---\ntps-linter: false\n---\n",
  ]) {
    assert.deepEqual(parseLintControls(input), {
      controlsPresent: false,
      disabledAll: false,
      disabledRules: new Set(),
      reason: null,
    });
  }

  const quoted = parseLintControls(
    "---\n\"tps-linter-disabled-rules\": final-newline\n---\n",
  );
  assert.equal(quoted.controlsPresent, true);
  assert.deepEqual([...quoted.disabledRules], ["final-newline"]);
});

test("candidate controls with malformed values or unknown IDs fail closed", () => {
  const unsafeInputs = [
    "---\ntps-linter: \"false\"\n---\n",
    "---\ntps-linter: null\n---\n",
    "---\ntps-linter-disabled-rules: false\n---\n",
    "---\ntps-linter-disabled-rules:\n  nested: blank-lines\n---\n",
    "---\ntps-linter-disabled-rules: unknown-rule\n---\n",
    "---\ntps-linter-disabled-rules: [blank-lines, Unknown]\n---\n",
    "---\ntps-linter-disabled-rules: [blank-lines, blank-lines]\n---\n",
  ];

  for (const input of unsafeInputs) {
    const result = parseLintControls(input);
    assert.equal(result.controlsPresent, true, input);
    assert.equal(result.disabledAll, true, input);
    assert.match(result.reason ?? "", /^Invalid TPS Linter controls:/, input);
  }
});

test("duplicate or unsafe YAML with a candidate control fails closed", () => {
  const unsafeInputs = [
    "---\ntps-linter: true\ntps-linter: false\n---\n",
    "---\ntps-linter: true\nTPS-LINTER: false\n---\n",
    "---\ntps-linter: true\nvalue: &shared one\n---\n",
    "---\ntps-linter: true\nvalue: *shared\n---\n",
    "---\ntps-linter: true\nvalue: !custom one\n---\n",
    "---\ntps-linter: true\n<<: {value: one}\n---\n",
    "---\ntps-linter: [unterminated\n---\n",
    "---\ntps-linter: false\n",
    "---\nparent:\n  tps-linter: false\n  broken: [value\n---\n",
  ];

  for (const input of unsafeInputs) {
    const result = parseLintControls(input);
    assert.equal(result.controlsPresent, true, input);
    assert.equal(result.disabledAll, true, input);
    assert.match(result.reason ?? "", /^Invalid TPS Linter controls:/, input);
  }
});

test("malformed unrelated YAML does not disable linting", () => {
  for (const input of [
    "---\nvalue: [unterminated\n---\n",
    "---\nsame: one\nsame: two\n---\n",
    "---\nvalue: &shared one\n---\n",
    "---\nvalue: [unterminated\n",
  ]) {
    const result = parseLintControls(input);
    assert.equal(result.controlsPresent, false, input);
    assert.equal(result.disabledAll, false, input);
    assert.deepEqual([...result.disabledRules], [], input);
    assert.equal(result.reason, null, input);
  }
});

test("parser is read-only and supports BOM, CRLF, and document-end delimiters", () => {
  const input =
    "\uFEFF---\r\ntps-linter-disabled-rules: [trailing-blank-lines, final-newline]\r\n...\r\nBody\r\n";
  const original = input;
  const result = parseLintControls(input);

  assert.equal(input, original);
  assert.equal(result.disabledAll, false);
  assert.deepEqual([...result.disabledRules], [
    "trailing-blank-lines",
    "final-newline",
  ]);
});

test("pathological frontmatter size fails closed before YAML parsing", () => {
  const input =
    "---\n" +
    "field: value\n".repeat(
      Math.ceil(TPS_LINTER_MAX_FRONTMATTER_CHARACTERS / 13) + 1,
    ) +
    "---\n";
  const controls = parseLintControls(input);

  assert.equal(controls.disabledAll, true);
  assert.match(controls.reason ?? "", /frontmatter exceeds.*safety limit/);
});

test("pathological frontmatter line counts fail closed before YAML parsing", () => {
  const input =
    "---\n" +
    "field: value\n".repeat(TPS_LINTER_MAX_FRONTMATTER_LINES + 1) +
    "---\n";
  const controls = parseLintControls(input);

  assert.equal(controls.disabledAll, true);
  assert.match(controls.reason ?? "", /line safety limit/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  TPS_LINTER_MAX_FRONTMATTER_FIELDS,
  TPS_LINTER_MAX_FRONTMATTER_LINES,
  sortTopLevelFrontmatterFields,
} from "../src/frontmatter-sort.ts";

test("priority fields lead and remaining fields sort case-insensitively", () => {
  const input = [
    'title: "Quoted: value"\n',
    "Status: open\n",
    "Zulu: 3\n",
    "alpha: 1\n",
    "bravo: 2\n",
    "priority: high\n",
  ].join("");

  const result = sortTopLevelFrontmatterFields(input, [
    "status",
    "priority",
    "tags",
  ]);

  assert.equal(
    result.output,
    [
      "Status: open\n",
      "priority: high\n",
      "alpha: 1\n",
      "bravo: 2\n",
      'title: "Quoted: value"\n',
      "Zulu: 3\n",
    ].join(""),
  );
  assert.equal(result.changed, true);
  assert.equal(result.fieldsReordered, 6);
  assert.equal(result.skippedReason, null);
});

test("comments, nested collections, quoted values, and block scalars stay intact", () => {
  const input = [
    "# vault metadata\n",
    "zeta:\n",
    "  nested: true\n",
    "  items:\n",
    "    - one\n",
    "    - two\n",
    "# description belongs with the next field\n",
    "description: |\n",
    "  First line.\n",
    "  Second line.\n",
    "alpha: 'kept: quoted'\n",
    "# trailing frontmatter comment\n",
  ].join("");

  const result = sortTopLevelFrontmatterFields(input, []);

  assert.equal(
    result.output,
    [
      "# vault metadata\n",
      "alpha: 'kept: quoted'\n",
      "# description belongs with the next field\n",
      "description: |\n",
      "  First line.\n",
      "  Second line.\n",
      "zeta:\n",
      "  nested: true\n",
      "  items:\n",
      "    - one\n",
      "    - two\n",
      "# trailing frontmatter comment\n",
    ].join(""),
  );
  assert.equal(result.changed, true);
  assert.equal(result.fieldsReordered, 2);
  assert.equal(result.skippedReason, null);
});

test("CRLF and missing final newline are preserved", () => {
  const result = sortTopLevelFrontmatterFields("z: 1\r\na: 2", []);

  assert.equal(result.output, "a: 2\r\nz: 1");
  assert.equal(result.changed, true);
  assert.equal(result.fieldsReordered, 2);
});

test("already sorted frontmatter stays byte-identical", () => {
  const input = "# leading\r\nstatus: open\r\nalpha: one\r\nzeta: two\r\n";
  const result = sortTopLevelFrontmatterFields(input, ["status"]);

  assert.deepEqual(result, {
    output: input,
    changed: false,
    fieldsReordered: 0,
    skippedReason: null,
  });
});

test("sorting is idempotent", () => {
  const input = "zeta: last\nstatus: open\nalpha: first\n";
  const first = sortTopLevelFrontmatterFields(input, ["status"]);
  const second = sortTopLevelFrontmatterFields(first.output, ["status"]);

  assert.equal(first.changed, true);
  assert.deepEqual(second, {
    output: first.output,
    changed: false,
    fieldsReordered: 0,
    skippedReason: null,
  });
});

test("non-priority key ordering is locale-independent and deterministic", () => {
  const input = [
    "éclair: 1\n",
    "Zulu: 2\n",
    "alpha: 3\n",
    "Ångström: 4\n",
  ].join("");
  const first = sortTopLevelFrontmatterFields(input, []);
  const second = sortTopLevelFrontmatterFields(first.output, []);

  assert.equal(
    first.output,
    [
      "alpha: 3\n",
      "Zulu: 2\n",
      "Ångström: 4\n",
      "éclair: 1\n",
    ].join(""),
  );
  assert.equal(second.changed, false);
  assert.equal(second.output, first.output);
});

test("only fields whose positions change count as reordered", () => {
  const result = sortTopLevelFrontmatterFields(
    "alpha: 1\ngamma: 3\nbeta: 2\n",
    [],
  );

  assert.equal(result.output, "alpha: 1\nbeta: 2\ngamma: 3\n");
  assert.equal(result.fieldsReordered, 2);
});

test("quoted Templater expressions remain byte-identical inside sorted fields", () => {
  const result = sortTopLevelFrontmatterFields(
    'zeta: "<% tp.date.now() %>"\nalpha: one\n',
    [],
  );

  assert.equal(
    result.output,
    'alpha: one\nzeta: "<% tp.date.now() %>"\n',
  );
  assert.equal(result.skippedReason, null);
});

test("malformed, duplicate, case-colliding, non-map, and complex-key YAML fail closed", () => {
  const unsafeInputs = [
    "valid: [unterminated\n",
    "same: 1\nsame: 2\n",
    "Status: active\nstatus: duplicate\n",
    '" status ": active\nstatus: duplicate\n',
    "- one\n- two\n",
    "? [a, b]\n: value\nz: 1\n",
    "1: numeric key\nz: value\n",
    "true: boolean key\nz: value\n",
  ];

  for (const input of unsafeInputs) {
    const result = sortTopLevelFrontmatterFields(input, []);
    assert.equal(result.output, input, input);
    assert.equal(result.changed, false, input);
    assert.equal(result.fieldsReordered, 0, input);
    assert.ok(result.skippedReason, input);
  }
});

test("directives, anchors, aliases, merge keys, and tags fail closed", () => {
  const unsafeInputs = [
    "%YAML 1.2\n---\nz: 1\na: 2\n",
    "z: &shared\n  nested: true\na: plain\n",
    "z: value\na: *shared\n",
    "<<:\n  nested: true\na: plain\n",
    "z: !custom value\na: plain\n",
  ];

  for (const input of unsafeInputs) {
    const result = sortTopLevelFrontmatterFields(input, []);
    assert.equal(result.output, input, input);
    assert.equal(result.changed, false, input);
    assert.equal(result.fieldsReordered, 0, input);
    assert.ok(result.skippedReason, input);
  }
});

test("frontmatter line and field work budgets fail closed before rewriting", () => {
  const tooManyFields = Array.from(
    { length: TPS_LINTER_MAX_FRONTMATTER_FIELDS + 1 },
    (_value, index) => `field-${String(index).padStart(4, "0")}: ${index}\n`,
  ).reverse().join("");
  const fieldResult = sortTopLevelFrontmatterFields(tooManyFields, []);
  assert.equal(fieldResult.output, tooManyFields);
  assert.equal(fieldResult.changed, false);
  assert.match(fieldResult.skippedReason ?? "", /field safety limit/);

  const tooManyLines =
    "value: |\n" +
    "  safe block content\n".repeat(TPS_LINTER_MAX_FRONTMATTER_LINES);
  const lineResult = sortTopLevelFrontmatterFields(tooManyLines, []);
  assert.equal(lineResult.output, tooManyLines);
  assert.equal(lineResult.changed, false);
  assert.match(lineResult.skippedReason ?? "", /line safety limit/);
});

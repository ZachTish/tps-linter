import assert from "node:assert/strict";
import test from "node:test";

import {
  TPS_LINTER_MAX_FRONTMATTER_CHARACTERS,
  TPS_LINTER_MAX_FRONTMATTER_FIELDS,
  TPS_LINTER_MAX_FRONTMATTER_LINES,
  inspectTopLevelFrontmatterSafety,
  semanticEquals,
  sortTopLevelFrontmatterFields,
} from "../src/frontmatter-sort.ts";

function legacySemanticEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) =>
        legacySemanticEquals(value, right[index]),
      )
    );
  }
  if (left instanceof Map && right instanceof Map) {
    if (left.size !== right.size) {
      return false;
    }
    const unmatched = [...right.entries()];
    for (const [leftKey, leftValue] of left.entries()) {
      const matchIndex = unmatched.findIndex(
        ([rightKey, rightValue]) =>
          legacySemanticEquals(leftKey, rightKey) &&
          legacySemanticEquals(leftValue, rightValue),
      );
      if (matchIndex < 0) {
        return false;
      }
      unmatched.splice(matchIndex, 1);
    }
    return true;
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      legacySemanticEquals(leftKeys, rightKeys) &&
      leftKeys.every((key) =>
        legacySemanticEquals(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

function deterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomSemanticValue(
  random: () => number,
  depth: number,
): unknown {
  const scalarChoice = Math.floor(random() * 8);
  if (depth <= 0 || scalarChoice < 6) {
    switch (scalarChoice) {
      case 0:
        return null;
      case 1:
        return random() < 0.5;
      case 2:
        return Math.floor(random() * 11) - 5;
      case 3:
        return `value-${Math.floor(random() * 8)}`;
      case 4:
        return random() < 0.5 ? Number.NaN : -0;
      default:
        return undefined;
    }
  }

  if (scalarChoice === 6) {
    const length = Math.floor(random() * 4);
    return Array.from(
      { length },
      () => randomSemanticValue(random, depth - 1),
    );
  }

  const collectionChoice = Math.floor(random() * 3);
  if (collectionChoice === 0) {
    return new Date(Math.floor(random() * 6) * 1_000);
  }
  if (collectionChoice === 1) {
    const record: Record<string, unknown> = {};
    const length = Math.floor(random() * 4);
    for (let index = 0; index < length; index += 1) {
      record[`key-${Math.floor(random() * 5)}`] =
        randomSemanticValue(random, depth - 1);
    }
    return record;
  }

  const map = new Map<unknown, unknown>();
  const length = Math.floor(random() * 4);
  for (let index = 0; index < length; index += 1) {
    map.set(
      randomSemanticValue(random, depth - 1),
      randomSemanticValue(random, depth - 1),
    );
  }
  return map;
}

function semanticClone(value: unknown): unknown {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (Array.isArray(value)) {
    return value.map(semanticClone);
  }
  if (value instanceof Map) {
    return new Map(
      [...value.entries()]
        .reverse()
        .map(([key, entryValue]) => [
          semanticClone(key),
          semanticClone(entryValue),
        ]),
    );
  }
  if (value !== null && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(value).reverse()) {
      clone[key] = semanticClone(
        (value as Record<string, unknown>)[key],
      );
    }
    return clone;
  }
  return value;
}

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

test("frontmatter character, line, and field work budgets fail closed before rewriting", () => {
  const blockLine = `  ${"x".repeat(560)}\n`;
  const tooManyCharacters =
    "payload: |\n" + blockLine.repeat(900);
  assert.ok(
    tooManyCharacters.length >
      TPS_LINTER_MAX_FRONTMATTER_CHARACTERS,
  );
  assert.ok(
    tooManyCharacters.split("\n").length <
      TPS_LINTER_MAX_FRONTMATTER_LINES,
  );
  assert.match(
    inspectTopLevelFrontmatterSafety(tooManyCharacters) ?? "",
    /character safety limit/,
  );
  const characterResult = sortTopLevelFrontmatterFields(
    tooManyCharacters,
    [],
  );
  assert.equal(characterResult.output, tooManyCharacters);
  assert.equal(characterResult.changed, false);
  assert.equal(characterResult.fieldsReordered, 0);
  assert.match(
    characterResult.skippedReason ?? "",
    /character safety limit/,
  );

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

test("semantic Map comparison preserves string and structural key behavior", () => {
  assert.equal(
    semanticEquals(
      new Map([
        ["alpha", { nested: true }],
        ["bravo", undefined],
      ]),
      new Map([
        ["bravo", undefined],
        ["alpha", { nested: true }],
      ]),
    ),
    true,
  );
  assert.equal(
    semanticEquals(
      new Map([["alpha", undefined]]),
      new Map([["bravo", undefined]]),
    ),
    false,
    "a missing string key must not equal a present undefined value",
  );
  assert.equal(
    semanticEquals(
      new Map([["value", -0]]),
      new Map([["value", 0]]),
    ),
    false,
  );
  assert.equal(
    semanticEquals(
      new Map([["value", Number.NaN]]),
      new Map([["value", Number.NaN]]),
    ),
    true,
  );
  assert.equal(
    semanticEquals(
      new Map([[Number.NaN, "same"]]),
      new Map([[Number.NaN, "same"]]),
    ),
    true,
  );
  assert.equal(
    semanticEquals(
      new Map([[-0, "same"]]),
      new Map([[0, "same"]]),
    ),
    true,
  );

  const leftObjectKeys = new Map<unknown, unknown>([
    [{ id: 1 }, "first"],
    [{ id: 1 }, "second"],
  ]);
  const rightObjectKeys = new Map<unknown, unknown>([
    [{ id: 1 }, "second"],
    [{ id: 1 }, "first"],
  ]);
  assert.equal(semanticEquals(leftObjectKeys, rightObjectKeys), true);
  assert.equal(
    semanticEquals(
      new Map([
        [
          new Map([
            ["alpha", 1],
            ["bravo", 2],
          ]),
          { value: "same" },
        ],
      ]),
      new Map([
        [
          new Map([
            ["bravo", 2],
            ["alpha", 1],
          ]),
          { value: "same" },
        ],
      ]),
    ),
    true,
  );
  assert.equal(
    semanticEquals(
      new Map<unknown, unknown>([[new String("alpha"), 1]]),
      new Map<unknown, unknown>([["alpha", 1]]),
    ),
    false,
  );
  assert.equal(
    semanticEquals(
      new Map<unknown, unknown>([["alpha", 1]]),
      new Map<unknown, unknown>([[new String("alpha"), 1]]),
    ),
    false,
  );
  assert.equal(
    semanticEquals(
      new Map<unknown, unknown>([
        ["alpha", 1],
        [{ nested: true }, 2],
      ]),
      new Map<unknown, unknown>([
        [{ nested: true }, 2],
        ["alpha", 1],
      ]),
    ),
    true,
  );

  const rightWithLaterMutation = new Map<string, unknown>([
    ["alpha", { value: 1 }],
    ["bravo", "original"],
  ]);
  const mutatingValue: Record<string, unknown> = {};
  Object.defineProperty(mutatingValue, "value", {
    enumerable: true,
    get() {
      rightWithLaterMutation.set("bravo", "mutated");
      return 1;
    },
  });
  const leftWithMutatingValue = new Map<string, unknown>([
    ["alpha", mutatingValue],
    ["bravo", "original"],
  ]);
  assert.equal(
    semanticEquals(leftWithMutatingValue, rightWithLaterMutation),
    legacySemanticEquals(
      leftWithMutatingValue,
      new Map<string, unknown>([
        ["alpha", { value: 1 }],
        ["bravo", "original"],
      ]),
    ),
    "string-key lookup must retain the released right-side snapshot behavior",
  );
  assert.equal(rightWithLaterMutation.get("bravo"), "mutated");
});

test("semantic comparison matches the released generic algorithm", () => {
  const random = deterministicRandom(0x5e6a_4d31);
  for (let index = 0; index < 25_000; index += 1) {
    const left = randomSemanticValue(random, 3);
    const right =
      index % 2 === 0
        ? semanticClone(left)
        : randomSemanticValue(random, 3);
    assert.equal(
      semanticEquals(left, right),
      legacySemanticEquals(left, right),
      `differential case ${index}`,
    );
  }
});

test("maximum safe field count completes semantic verification", () => {
  const input = Array.from(
    { length: TPS_LINTER_MAX_FRONTMATTER_FIELDS },
    (_value, index) =>
      `field-${String(index).padStart(4, "0")}: ${index}\n`,
  ).reverse().join("");
  const result = sortTopLevelFrontmatterFields(input, []);

  assert.equal(result.skippedReason, null);
  assert.equal(result.changed, true);
  assert.equal(
    result.fieldsReordered,
    TPS_LINTER_MAX_FRONTMATTER_FIELDS,
  );
  assert.match(result.output, /^field-0000: 0\n/);
  assert.match(result.output, /field-0999: 999\n$/);
});

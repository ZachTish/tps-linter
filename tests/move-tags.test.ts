import test from 'node:test';
import assert from 'node:assert/strict';
import { moveTagsToFrontmatter } from '../src/move-tags.ts';
test('merges tags without changing tasks, prose or fenced examples', () => {
 const before = '---\ntitle: Test\ntags: [old]\n---\n#old #new/tag\nProse #keep\n- [ ] Task #keep\n```md\n#code\n```\n';
 const result = moveTagsToFrontmatter(before);
 assert.equal(result.moved, 2); assert.match(result.output, /new\/tag/); assert.match(result.output, /Prose #keep/); assert.match(result.output, /Task #keep/); assert.match(result.output, /#code/);
 assert.equal(moveTagsToFrontmatter(result.output).output, result.output);
});
test('invalid YAML, tag types, and protected HTML remain unchanged', () => {
 for (const text of ['---\ntags: 5\n---\n#tag\n','---\ntags: [\n---\n#tag\n','<!--\n#tag\n-->\n']) assert.equal(moveTagsToFrontmatter(text).output,text);
});

import { cleanMarkdown } from '../src/cleaner.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
test('normal cleanup honors the opt-in and disabled-rule control', () => {
 const options = {...DEFAULT_SETTINGS, moveTagsToFrontmatter:true, frontmatterPriorityKeys:[]};
 assert.match(cleanMarkdown('#food/healthy\n', options).output, /tags:/);
 const protectedNote = '---\ntps-linter-disabled-rules: [move-tags-to-frontmatter]\n---\n#keep\n';
 assert.match(cleanMarkdown(protectedNote, options).output, /#keep/);
});

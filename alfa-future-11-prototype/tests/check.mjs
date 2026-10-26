// Сверка движка с expected_output на всех профилях: node tests/check.mjs
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const Engine = require('../engine.js');
const data = JSON.parse(fs.readFileSync(new URL('../data/bundle.json', import.meta.url), 'utf8'));

function diff(a, b, path, out) {
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    if (a !== b) out.push(path + ': получили ' + JSON.stringify(a) + ', ждали ' + JSON.stringify(b));
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(path + ': тип'); return; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diff(a[k], b[k], path + '.' + k, out);
}

let ok = 0;
for (const p of data.profiles) {
  const input = Object.assign({}, p);
  delete input.expected_output;
  const got = Engine.engine(input, data.params, data.hooks);
  delete got._meta;
  const errors = [];
  diff(got, p.expected_output, p.profile_id, errors);
  const orderGot = Object.keys(got.ranking_after || {}).join(' > ');
  const orderExp = Object.keys(p.expected_output.ranking_after || {}).join(' > ');
  if (orderGot !== orderExp) errors.push(p.profile_id + ': порядок ранжирования ' + orderGot + ' вместо ' + orderExp);
  if (errors.length) console.log('✗', p.profile_id, '\n  ' + errors.join('\n  '));
  else { ok += 1; console.log('✓', p.profile_id, got.offer || got.action); }
}
console.log('\nСовпало ' + ok + ' из ' + data.profiles.length);
process.exit(ok === data.profiles.length ? 0 : 1);

#!/usr/bin/env node
// arch-map の仕上げ: ビューア(index.html)の設置・更新、arch-data.js の検証・整形・日付と commit の記録。
// 使い方: node archmap.mjs [出力フォルダ=docs/arch-map]   ※プロジェクトのルートで実行する
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'viewer.html');
const outDir = process.argv[2] || 'docs/arch-map';
const dataPath = join(outDir, 'arch-data.js');
const viewerPath = join(outDir, 'index.html');
const HEADER = '// arch-map のデータです。/arch-map スキルが読み書きします（手で直すときは JSON の書式を守ってください）';
const COLORS = ['orange', 'blue', 'green', 'purple', 'cyan', 'pink', 'gray'];
const ID = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_LOG = 30;
const KEYS = {
  root: ['version', 'project', 'groups', 'nodes', 'edges', 'glossary', 'log'],
  project: ['name', 'summary', 'updated', 'commit'],
  group: ['id', 'name', 'desc', 'color', 'tool', 'row', 'cols'],
  node: ['id', 'group', 'step', 'name', 'role', 'detail', 'analogy', 'actor', 'output', 'service', 'plan', 'built'],
  service: ['name', 'provider', 'docs', 'env'],
  plan: ['tech', 'note'],
  built: ['tech', 'note', 'progress', 'files', 'issue'],
  edge: ['from', 'to', 'label', 'kind', 'only'],
  glossary: ['term', 'desc'],
  log: ['date', 'view', 'text'],
};
const SECRETS = [
  /AKIA[0-9A-Z]{16}/, /\bsk-[A-Za-z0-9_-]{20,}/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bAIza[0-9A-Za-z_-]{35}\b/, /\b(?:password|passwd|secret)\s*[:=]\s*\S{6,}/i,
];

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEV_ONLY = /開発者|開発用|開発ツール|developer|\beval\b|ベンチマーク|精度チェック/i;
const stepsOf = (n) => (Array.isArray(n.step) ? n.step : n.step === undefined ? [] : [n.step]);
const errors = [];
const warns = [];
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string' && x.trim() !== '';
const len = (s) => [...s].length;

function die(lines) {
  console.error(`✕ ${dataPath} に直すべき点が ${lines.length} 件あります（ファイルは書き換えていません）`);
  for (const l of lines) console.error(`  - ${l}`);
  if (warns.length) console.error(`\n⚠ あわせて気になる点 ${warns.length} 件\n${warns.map((w) => `  - ${w}`).join('\n')}`);
  process.exit(1);
}

function viewerVersion(file) {
  const m = readFileSync(file, 'utf8').match(/name="arch-map-viewer" content="(\d+)"/);
  return m ? Number(m[1]) : 0;
}

function installViewer() {
  mkdirSync(outDir, { recursive: true });
  const latest = viewerVersion(TEMPLATE);
  if (!existsSync(viewerPath)) { copyFileSync(TEMPLATE, viewerPath); return `設置しました (v${latest})`; }
  if (viewerVersion(viewerPath) < latest) { copyFileSync(TEMPLATE, viewerPath); return `v${latest} に更新しました`; }
  return `最新です (v${latest})`;
}

function readData() {
  if (!existsSync(dataPath)) die([`${dataPath} がありません。先にデータを書いてください`]);
  const src = readFileSync(dataPath, 'utf8');
  const m = src.match(/window\.ARCH_MAP\s*=\s*/);
  if (!m) die(['`window.ARCH_MAP = { ... };` の形になっていません']);
  const body = src.slice(m.index + m[0].length).trim().replace(/;\s*$/, '');
  try {
    return { data: JSON.parse(body), body };
  } catch (e) {
    return die([`JSON として読めません（末尾のカンマ・コメント・引用符の抜けに注意）: ${e.message}`]);
  }
}

// 旧形式（version 1 の layers / layer）を groups / group に置き換える
function migrate(D) {
  if (!isObj(D)) return false;
  let changed = false;
  if (D.layers !== undefined && D.groups === undefined) { D.groups = D.layers; delete D.layers; changed = true; }
  if (Array.isArray(D.nodes)) {
    for (const n of D.nodes) if (isObj(n) && n.layer !== undefined && n.group === undefined) { n.group = n.layer; delete n.layer; changed = true; }
  }
  if (D.version === 1) { D.version = 2; changed = true; }
  return changed;
}

// 項目の並びを KEYS の順にそろえる（知らない項目は後ろに残す）
function ordered(obj, kind) {
  if (!isObj(obj)) return obj;
  const keys = [...KEYS[kind].filter((k) => k in obj), ...Object.keys(obj).filter((k) => !KEYS[kind].includes(k))];
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

function checkKeys(obj, kind, at) {
  for (const k of Object.keys(obj)) if (!KEYS[kind].includes(k)) warns.push(`${at} の「${k}」は使われない項目です（書き間違い？ 使える項目: ${KEYS[kind].join(', ')}）`);
}

function list(D, key, optional) {
  if (D[key] === undefined && optional) return (D[key] = []);
  if (!Array.isArray(D[key])) { errors.push(`${key} は配列 [ ] にしてください`); return []; }
  return D[key];
}

function validate(D, body) {
  if (!isObj(D)) die(['一番外側は { } のオブジェクトにしてください']);
  checkKeys(D, 'root', 'ルート');
  if (D.version !== 2) errors.push('version は 2 にしてください');
  if (!isObj(D.project) || !isStr(D.project.name)) errors.push('project.name（プロジェクト名）が必要です');
  else {
    checkKeys(D.project, 'project', 'project');
    if (!isStr(D.project.summary)) warns.push('project.summary（アプリ全体のひとこと説明）があると初心者にわかりやすくなります');
  }
  const groups = list(D, 'groups');
  const nodes = list(D, 'nodes');
  const edges = list(D, 'edges', true);
  const glossary = list(D, 'glossary', true);
  const log = list(D, 'log', true);

  const groupIds = new Set();
  if (!groups.length) errors.push('groups（まとまり）が 1 つ以上必要です');
  groups.forEach((g, i) => {
    const at = `groups[${i}]`;
    if (!isObj(g)) return errors.push(`${at} は { } にしてください`);
    checkKeys(g, 'group', at);
    if (!isStr(g.id) || !ID.test(g.id)) errors.push(`${at}.id は英小文字・数字・ - _ で書いてください`);
    else if (groupIds.has(g.id)) errors.push(`${at}.id「${g.id}」が重複しています`);
    else groupIds.add(g.id);
    if (!isStr(g.name)) errors.push(`${at}.name が必要です`);
    if (g.color !== undefined && !COLORS.includes(g.color)) errors.push(`${at}.color は ${COLORS.join(' / ')} のどれかにしてください`);
    if (g.tool !== undefined && g.tool !== true) errors.push(`${at}.tool は true にするか、項目ごと消してください（実装用の道具のグループなら true）`);
    if (g.row !== undefined && !(Number.isInteger(g.row) && g.row >= 1)) errors.push(`${at}.row は 1 以上の整数にしてください（同じ row のグループは横に並ぶ）`);
    if (g.cols !== undefined && !(Number.isInteger(g.cols) && g.cols >= 1 && g.cols <= 8)) errors.push(`${at}.cols は 1〜8 の整数にしてください（1 行に並べる箱の数）`);
  });

  const byId = new Map();
  if (!nodes.length) errors.push('nodes（箱）が 1 つもありません');
  nodes.forEach((n, i) => {
    const at = `nodes[${i}]${isObj(n) && isStr(n.id) ? `(${n.id})` : ''}`;
    if (!isObj(n)) return errors.push(`${at} は { } にしてください`);
    checkKeys(n, 'node', at);
    if (!isStr(n.id) || !ID.test(n.id)) errors.push(`${at}.id は英小文字・数字・ - _ で書いてください`);
    else if (byId.has(n.id)) errors.push(`${at}.id「${n.id}」が重複しています`);
    else byId.set(n.id, n);
    if (!groupIds.has(n.group)) errors.push(`${at}.group「${n.group}」が groups にありません`);
    if (!isStr(n.name)) errors.push(`${at}.name が必要です`);
    else if (len(n.name) > 12) warns.push(`${at}.name が ${len(n.name)} 文字です（12 文字以内だと箱に収まります）`);
    if (!isStr(n.role)) errors.push(`${at}.role（箱に出るひとこと）が必要です`);
    else if (len(n.role) > 24) warns.push(`${at}.role が ${len(n.role)} 文字です（24 文字以内がおすすめ）`);
    if (!isStr(n.detail)) warns.push(`${at}.detail（くわしい説明）がありません`);
    if (!isStr(n.analogy)) warns.push(`${at}.analogy（たとえ）がありません`);
    if (n.actor !== undefined && n.actor !== true) errors.push(`${at}.actor は true にするか、項目ごと消してください`);
    if (n.step !== undefined) {
      const st = stepsOf(n);
      if (!st.length || !st.every((x) => Number.isInteger(x) && x >= 1) || new Set(st).size !== st.length) errors.push(`${at}.step は 1 以上の整数か、その配列（例: [1, 12]）にしてください`);
    }
    if (n.output !== undefined && n.output !== true) errors.push(`${at}.output は true にするか、項目ごと消してください`);
    if (n.actor && n.output) errors.push(`${at} は人（actor）なので output（最後の出力）にはできません。受け取るものを別の箱にしてください`);
    if (n.actor && (n.plan !== undefined || n.built !== undefined)) warns.push(`${at} は actor（人など）なので plan / built は使われません`);
    if (!n.actor && n.plan === undefined && n.built === undefined) errors.push(`${at} には plan か built の少なくとも一方が必要です（中身が無ければ {} で可）`);
    for (const side of ['plan', 'built']) {
      const s = n[side];
      if (s === undefined) continue;
      if (!isObj(s)) { errors.push(`${at}.${side} は { } にしてください`); continue; }
      checkKeys(s, side, `${at}.${side}`);
      for (const k of ['tech', 'note', 'issue']) if (s[k] !== undefined && !isStr(s[k])) errors.push(`${at}.${side}.${k} は文字列にしてください`);
    }
    if (n.service !== undefined) {
      const sv = n.service;
      if (!isObj(sv) || !isStr(sv.name)) errors.push(`${at}.service は {"name": "サービスの正式名", ...} にしてください`);
      else {
        checkKeys(sv, 'service', `${at}.service`);
        if (sv.provider !== undefined && !isStr(sv.provider)) errors.push(`${at}.service.provider は文字列にしてください`);
        if (sv.docs !== undefined && !(typeof sv.docs === 'string' && /^https:\/\/\S+$/.test(sv.docs))) errors.push(`${at}.service.docs は https:// で始まる URL にしてください`);
        if (sv.env !== undefined && !(Array.isArray(sv.env) && sv.env.every((k) => typeof k === 'string' && ENV_NAME.test(k)))) errors.push(`${at}.service.env は環境変数の「名前」だけの配列にしてください（値は書かない）`);
      }
    } else if (/\bAPI\b|\bSDK\b|SaaS/i.test([n.plan?.tech, n.built?.tech].filter(isStr).join(' '))) {
      warns.push(`${at} は外部サービスを使っていそうです。service（サービス名・提供元・必要な設定）を書くと図で明示されます`);
    }
    if (isObj(n.built)) {
      const { progress, files } = n.built;
      if (progress !== undefined && !(typeof progress === 'number' && progress >= 0 && progress <= 1)) errors.push(`${at}.built.progress は 0〜1 の数にしてください`);
      if (files !== undefined && !(Array.isArray(files) && files.every(isStr))) errors.push(`${at}.built.files は文字列の配列にしてください`);
    }
  });

  const pairs = new Set();
  const has = (id, side) => byId.get(id)?.actor === true || isObj(byId.get(id)?.[side]);
  const shows = (e, side) => has(e.from, side) && has(e.to, side) && e.only !== (side === 'plan' ? 'built' : 'plan');
  edges.forEach((e, i) => {
    const at = `edges[${i}]${isObj(e) ? `(${e.from}→${e.to})` : ''}`;
    if (!isObj(e)) return errors.push(`${at} は { } にしてください`);
    checkKeys(e, 'edge', at);
    for (const k of ['from', 'to']) if (!byId.has(e[k])) errors.push(`${at}.${k}「${e[k]}」という id の箱がありません`);
    if (e.from === e.to) errors.push(`${at} が自分自身につながっています`);
    if (e.only !== undefined && !['plan', 'built'].includes(e.only)) errors.push(`${at}.only は "plan" か "built" にしてください`);
    if (e.kind !== undefined && !['call', 'result'].includes(e.kind)) errors.push(`${at}.kind は "result"（結果が返る・出力される流れ）にするか、項目ごと消してください`);
    if (!isStr(e.label)) warns.push(`${at}.label（何を頼むか）があると線の意味が伝わります`);
    const key = `${e.from}>${e.to}`;
    if (pairs.has(key)) warns.push(`${at} と同じ向きの線がすでにあります`);
    pairs.add(key);
    if (byId.has(e.from) && byId.has(e.to) && !shows(e, 'plan') && !shows(e, 'built')) warns.push(`${at} は計画・実装どちらの図にも出ません（両端の plan / built を確認）`);
  });

  glossary.forEach((g, i) => {
    if (!isObj(g) || !isStr(g.term) || !isStr(g.desc)) errors.push(`glossary[${i}] は {"term": "...", "desc": "..."} にしてください`);
    else checkKeys(g, 'glossary', `glossary[${i}]`);
  });
  log.forEach((x, i) => {
    if (!isObj(x) || (x.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) || !isStr(x.text) || !['plan', 'built', 'both'].includes(x.view)) errors.push(`log[${i}] は {"date": "YYYY-MM-DD"（省略可）, "view": "plan|built|both", "text": "..."} にしてください`);
    else checkKeys(x, 'log', `log[${i}]`);
  });

  const toolGroups = new Set(groups.filter((g) => isObj(g) && g.tool === true).map((g) => g.id));
  const isTool = (n) => isObj(n) && toolGroups.has(n.group);
  for (const [side, label] of [['plan', '計画'], ['built', '実装']]) {
    const vis = nodes.filter((n) => isObj(n) && !n.actor && !isTool(n) && isObj(n[side]));
    if (vis.length > 18) warns.push(`${label}の箱が ${vis.length} 個あります（初心者向けには 15 個以内がおすすめ。まとめられる箱をまとめる）`);
    for (const g of groups) {
      const c = vis.filter((n) => n.group === g.id).length;
      if (c > 8) warns.push(`${label}の「${g.name}」に箱が ${c} 個あります（8 個以内だと見やすい。中で分かれるなら別のグループに）`);
    }
    // 起きる順の流れ（step）
    const all = nodes.filter((n) => isObj(n) && !isTool(n) && (n.actor || isObj(n[side])));
    const noStep = all.filter((n) => !stepsOf(n).length);
    if (!vis.length) { /* 人の箱しかない図は対象外 */ } else if (noStep.length === all.length) warns.push(`${label}の図に起きる順番（step）がありません。各箱に step を付けると、最初の入力から結果を受け取るところまで、起きる順の流れで描かれます`);
    else if (noStep.length) warns.push(`${label}の図で step がない箱があります（${noStep.map((n) => n.name).join('・')}）。全部の箱に付けると流れの図になります`);
    else {
      for (const e of edges.filter((x) => isObj(x) && byId.has(x.from) && byId.has(x.to) && !isTool(byId.get(x.from)) && !isTool(byId.get(x.to)) && shows(x, side))) {
        const up = stepsOf(byId.get(e.from)).every((a) => stepsOf(byId.get(e.to)).every((b) => b < a));
        if (up) warns.push(`${label}で「${byId.get(e.from).name}」→「${byId.get(e.to).name}」の線が流れを逆戻りしています。戻り先の箱を後の段にも置く（"step": [3, 12] のように）と、一方向の流れになります`);
      }
    }
    if (vis.length && !vis.some((n) => n.output)) warns.push(`${label}の図に「最後の出力」（"output": true の箱）がありません。入力から、利用者などが最後に受け取るもの（画面に出る結果・ファイル・レポート・通知など）まで描いてください`);
    for (const n of vis.filter((x) => x.output)) {
      if (!edges.some((e) => isObj(e) && e.to === n.id && e.kind === 'result' && shows(e, side))) warns.push(`${label}の「${n.name}」（最後の出力）に、結果を届ける線（"kind": "result"）がつながっていません`);
      if (!edges.some((e) => isObj(e) && e.from === n.id && e.kind === 'result' && shows(e, side))) warns.push(`${label}の「${n.name}」（最後の出力）から、受け取る人（actor）や先の箱への線（"kind": "result"）がありません。流れを受け取る人のところで閉じてください`);
    }
    for (const n of nodes.filter((x) => isTool(x) && isObj(x[side]))) {
      if (!edges.some((e) => isObj(e) && (e.from === n.id || e.to === n.id) && shows(e, side))) warns.push(`${label}の「${n.name}」（実装用の道具）が、どの箱ともつながっていません。作る・試す・調整する相手の箱へ線を引いてください`);
    }
    for (const n of vis) {
      if (vis.length > 1 && !edges.some((e) => isObj(e) && (e.from === n.id || e.to === n.id) && shows(e, side))) warns.push(`${label}の「${n.name}」はどの線ともつながっていません`);
    }
  }

  for (const re of SECRETS) {
    const m = body.match(re);
    if (m) errors.push(`秘密情報（APIキーやパスワード）らしき文字列があります。消してください: ${m[0].slice(0, 6)}…`);
  }
}

function git(args) {
  try {
    return execFileSync('git', ['-C', outDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function inline(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  return `{${Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')}}`;
}

// 短い配列・オブジェクトは 1 行にまとめ、読みやすさと差分の小ささを両立させる。
// ビューア（assets/viewer.html）の保存も同じ整形をしているので、変えるときは両方そろえる
function format(v, indent = '') {
  const flat = inline(v);
  if (v === null || typeof v !== 'object' || indent.length + flat.length <= 110) return flat;
  const next = `${indent}  `;
  if (Array.isArray(v)) return `[\n${v.map((x) => next + format(x, next)).join(',\n')}\n${indent}]`;
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  return `{\n${entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${format(x, next)}`).join(',\n')}\n${indent}}`;
}

const viewerMsg = installViewer();
const { data: D, body } = readData();
const migrated = migrate(D);
validate(D, body);
if (Array.isArray(D.groups) && Array.isArray(D.nodes)) {
  const tg = new Set(D.groups.filter((g) => isObj(g) && g.tool === true).map((g) => g.id));
  const devActors = D.nodes.filter((n) => isObj(n) && n.actor && DEV_ONLY.test(n.name || '')).map((n) => n.name);
  const devParts = [...D.groups.filter((g) => isObj(g) && !g.tool && DEV_ONLY.test(g.name || '')).map((g) => g.name), ...D.nodes.filter((n) => isObj(n) && !n.actor && !tg.has(n.group) && DEV_ONLY.test(n.name || '')).map((n) => n.name)];
  if (devActors.length) warns.push(`開発者（${devActors.join('・')}）が人の箱として入っています。アプリの図には描かず、使う道具は「実装用の道具」のグループに入れてください`);
  if (devParts.length) warns.push(`開発・テスト用の道具らしきものが、本番の部品と同じ列に入っています（${devParts.join('・')}）。実装用の道具なら "tool": true のグループに分けてください（このアプリ自体が開発者向けの製品なら、そのままでよい）`);
  for (const g of D.groups) if (isObj(g) && !D.nodes.some((n) => n.group === g.id)) warns.push(`グループ「${g.name}」にはどの箱も入っていません`);
}
if (errors.length) die(errors);

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
D.project.updated = today;
D.log = D.log.map((x) => (x.date ? x : { date: today, ...x }));
const commit = git(['rev-parse', '--short', 'HEAD']);
if (commit) D.project.commit = commit;
else delete D.project.commit;
if (D.log.length > MAX_LOG) D.log = D.log.slice(-MAX_LOG);
// 流れの図（本番の箱すべてに step がある）では、段の図用の row / cols は使わないので消す
const coreNodes = D.nodes.filter((n) => !D.groups.some((g) => g.id === n.group && g.tool === true));
if (coreNodes.length && coreNodes.every((n) => stepsOf(n).length)) for (const g of D.groups) { delete g.row; delete g.cols; }
const out = ordered({ ...D, groups: D.groups.map((g) => ordered(g, 'group')), nodes: D.nodes.map((n) => ordered({ ...n, service: n.service && ordered(n.service, 'service') }, 'node')) }, 'root');
out.project = ordered(out.project, 'project');
writeFileSync(dataPath, `${HEADER}\nwindow.ARCH_MAP = ${format(out)};\n`);

const things = D.nodes.filter((n) => !n.actor);
const status = (n) => (!n.built ? 'todo' : !n.plan ? 'extra' : (n.built.progress ?? 1) >= 1 ? 'done' : 'wip');
const count = { done: 0, wip: 0, todo: 0, extra: 0 };
things.forEach((n) => { count[status(n)] += 1; });
const planN = things.filter((n) => n.plan).length;
const builtN = things.filter((n) => n.built).length;
const issueN = things.filter((n) => n.built?.issue).length;
console.log(`✓ arch-map OK: ${dataPath}`);
const svcN = D.nodes.filter((n) => n.service).length;
const outN = D.nodes.filter((n) => n.output).length;
const stepN = new Set(D.nodes.flatMap(stepsOf)).size;
const toolIds = new Set(D.groups.filter((g) => g.tool === true).map((g) => g.id));
const toolN = D.nodes.filter((n) => toolIds.has(n.group)).length;
console.log(`  計画 ${planN} 個 / 実装 ${builtN} 個 / 線 ${D.edges.length} 本 / グループ ${D.groups.length} / 外部サービス ${svcN} / 最後の出力 ${outN}${stepN ? ` / 段 ${stepN}` : ''}${toolN ? ` / 実装用の道具 ${toolN}` : ''}`);
if (planN && builtN) console.log(`  比較: 完成 ${count.done} · 作業中 ${count.wip} · 未着手 ${count.todo} · 計画外 ${count.extra}${issueN ? ` · 要確認 ${issueN}` : ''}`);
console.log(`  ビューア: ${viewerMsg}`);
if (migrated) console.log('  形式: 旧形式（layers / layer）を groups / group に変換しました');
console.log(`  記録: 更新日 ${D.project.updated}${commit ? ` · commit ${commit}` : '（git なし）'}`);
if (warns.length) {
  console.log(`\n⚠ 気になる点 ${warns.length} 件（表示はできます。直せるものは直してください）`);
  for (const w of warns) console.log(`  - ${w}`);
}

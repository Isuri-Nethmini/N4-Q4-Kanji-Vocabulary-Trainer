/* 藍 — N4 Kanji & Vocabulary Trainer
   Local-only. Progress persists in this browser's localStorage. */
'use strict';
const D = window.DATA, LK = D.lookalike;
const $ = s => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.random() * a.length | 0];
const HOUR = 36e5, DAY = 864e5;

/* ================= item set =================
   Two kinds of item:
   kanji-word  (id kw:<word>)  — word in kanji, reading, meaning, source kanji
   vocab       (id vk:<kana>)  — kana word, meaning, optional kanji form
=============================================== */
const ITEMS = [];
const byId = new Map();
{
  const seen = new Set();
  D.kanji.forEach(k => k.words.forEach(w => {
    const id = 'kw:' + w.w;
    if (seen.has(id)) return; seen.add(id);
    ITEMS.push({ id, kind: 'kw', jp: w.w, read: w.r, mean: w.m, k: k.k, level: w.level });
  }));
  D.vocab.forEach(v => {
    const id = 'vk:' + v.kana + (v.kanji || '');
    if (seen.has(id)) return; seen.add(id);
    ITEMS.push({
      id, kind: 'vk', jp: v.kanji || v.kana, read: v.kana, mean: v.m,
      kana: v.kana, kanji: v.kanji, note: v.note,
      lesson: v.lesson, level: v.book === 'I' ? 'N5' : 'N4'
    });
  });
  ITEMS.forEach(i => byId.set(i.id, i));
}
/* pools for distractors */
const ALL_READ = [...new Set(ITEMS.map(i => i.read))];
const ALL_MEAN = [...new Set(ITEMS.map(i => i.mean))];
const KANJI_WORDS = ITEMS.filter(i => /[\u4e00-\u9fff]/.test(i.jp));
const READ_OF = new Map();          // jp form -> set of valid readings
ITEMS.forEach(i => {
  if (!READ_OF.has(i.jp)) READ_OF.set(i.jp, new Set());
  READ_OF.get(i.jp).add(i.read);
});

/* ================= progress ================= */
const SKEY = 'ai-n4-trainer-v1';
let S = load();
function load() {
  try {
    const r = JSON.parse(localStorage.getItem(SKEY));
    if (r && r.p) return r;
  } catch (e) { }
  return { p: {}, cfg: { scope: 'all', mode: 'kw', len: 20, examIn: 12 }, log: {}, newlog: {} };
}
function save() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { } }
const rec = id => S.p[id] || (S.p[id] = { lv: 0, due: 0, seen: 0, ok: 0, bad: 0 });
/* interval ladder, in ms.
   Long ladder for open-ended study; a compressed one when an exam is close,
   so every item still comes back several times before the date. */
const IVL_LONG = [0, 4 * HOUR, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 90 * DAY];
const IVL_CRAM = [0, 25 * 60e3, 2 * HOUR, 8 * HOUR, DAY, 2 * DAY, 3 * DAY, 4 * DAY];
function daysLeft() { const n = S.cfg.examIn; return (n == null || n < 0) ? null : n; }
function ladder() {
  const dl = daysLeft();
  if (dl === null || dl > 25) return IVL_LONG;
  // nothing may be scheduled past the exam: cap at a third of the time left
  const cap = Math.max(20 * 60e3, (dl / 3) * DAY);
  return IVL_CRAM.map(v => Math.min(v, cap));
}
const IVL = IVL_LONG;   // kept for the stats labels
function grade(id, good) {
  const r = rec(id);
  if (r.seen === 0) {            // first time this item has ever been answered
    const dk = new Date().toISOString().slice(0, 10);
    S.newlog = S.newlog || {};
    S.newlog[dk] = (S.newlog[dk] || 0) + 1;
  }
  r.seen++;
  const L = ladder();
  if (good) { r.ok++; r.lv = Math.min(L.length - 1, r.lv + 1); }
  else { r.bad++; r.lv = Math.max(0, r.lv - 2); }
  r.due = Date.now() + (good ? L[r.lv] : (daysLeft() !== null && daysLeft() <= 25 ? 6 * 60e3 : 10 * 60e3));
  const d = new Date().toISOString().slice(0, 10);
  S.log[d] = (S.log[d] || 0) + 1;
  save();
}
const isDue = id => { const r = S.p[id]; return !r || r.due <= Date.now(); };
const MASTER_LONG = 5;
Object.defineProperty(window, 'MASTER', { get: () => (daysLeft() !== null && daysLeft() <= 25) ? 4 : MASTER_LONG });
const MASTER = 4;  // placeholder; real value via masterLv()
function masterLv() { return (daysLeft() !== null && daysLeft() <= 25) ? 4 : MASTER_LONG; }

/* ================= scope ================= */
function inScope(i) {
  const s = S.cfg.scope;
  if (s === 'n5') return i.level === 'N5';
  if (s === 'n4') return i.level === 'N4';
  if (s === 'kanji') return i.kind === 'kw';
  if (s === 'vocab') return i.kind === 'vk';
  return true;
}
const scoped = () => ITEMS.filter(inScope);

/* queue: due first (weakest first), then unseen, then soonest-due */
function queue(n, filter) {
  let pool = scoped().filter(filter || (() => true));
  const due = [], fresh = [], rest = [];
  pool.forEach(i => {
    const r = S.p[i.id];
    if (!r) fresh.push(i);
    else if (r.due <= Date.now()) due.push(i);
    else rest.push(i);
  });
  due.sort((a, b) => (S.p[b.id].bad - S.p[a.id].bad) || (S.p[a.id].lv - S.p[b.id].lv));
  shuffle(fresh); rest.sort((a, b) => S.p[a.id].due - S.p[b.id].due);
  return [...due, ...fresh, ...rest].slice(0, n);
}

/* ================= distractors ================= */
const YOON_OK = new Set([...'きしちにひみりぎじぢびぴ']);
const ROWS = ['あいうえお', 'かきくけこ', 'がぎぐげご', 'さしすせそ', 'ざじずぜぞ',
  'たちつてと', 'だぢづでど', 'なにぬねの', 'はひふへほ', 'ばびぶべぼ',
  'ぱぴぷぺぽ', 'まみむめも', 'やゆよ', 'らりるれろ'];
const VOICE = { 'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご', 'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ', 'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど', 'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ' };
const UNV = Object.fromEntries(Object.entries(VOICE).map(([a, b]) => [b, a]));
const PLO = { 'は': 'ぱ', 'ひ': 'ぴ', 'ふ': 'ぷ', 'へ': 'ぺ', 'ほ': 'ぽ', 'ば': 'ぱ', 'び': 'ぴ', 'ぶ': 'ぷ', 'べ': 'ぺ', 'ぼ': 'ぽ' };
const SML = { 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ' }, BIG = { 'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ' };

function validKana(s) {
  if (!s) return false;
  if ('っんゃゅょ'.includes(s[0])) return false;
  if (s.includes('っっ') || s.includes('んん')) return false;
  for (let i = 0; i < s.length; i++) {
    if ('ゃゅょ'.includes(s[i]) && (i === 0 || !YOON_OK.has(s[i - 1]))) return false;
    if (s[i] === 'っ' && i === s.length - 1) return false;
  }
  return true;
}
/* phonetic near-misses: the mistakes people actually make */
function readingVariants(r) {
  const o = new Set();
  if (r.includes('う')) o.add(r.replace('う', ''));
  for (let i = 0; i < r.length; i++) {
    if ('おこそとのほもよろごぞどぼぽしきちにひみりじ'.includes(r[i])) o.add(r.slice(0, i + 1) + 'う' + r.slice(i + 1));
  }
  if (r.includes('っ')) { o.add(r.replace('っ', '')); o.add(r.replace('っ', 'つ')); }
  else for (let i = 1; i < r.length; i++) o.add(r.slice(0, i) + 'っ' + r.slice(i));
  for (let i = 0; i < r.length; i++) {
    [VOICE, UNV, PLO].forEach(t => { if (t[r[i]]) o.add(r.slice(0, i) + t[r[i]] + r.slice(i + 1)); });
    if (SML[r[i]]) o.add(r.slice(0, i) + SML[r[i]] + r.slice(i + 1));
    if (BIG[r[i]] && i > 0) o.add(r.slice(0, i) + BIG[r[i]] + r.slice(i + 1));
    ROWS.forEach(row => {
      if (row.includes(r[i])) for (const a of row) if (a !== r[i]) o.add(r.slice(0, i) + a + r.slice(i + 1));
    });
  }
  o.delete(r);
  return [...o].filter(validKana);
}
function readOpts(it) {
  const bad = READ_OF.get(it.jp) || new Set([it.read]);
  let c = shuffle(readingVariants(it.read).filter(v => !bad.has(v)));
  const same = c.filter(x => x.length === it.read.length);
  const out = [];
  for (const x of [...same, ...c]) { if (!out.includes(x)) out.push(x); if (out.length === 3) break; }
  while (out.length < 3) { const r = pick(ALL_READ); if (r !== it.read && !out.includes(r)) out.push(r); }
  return out;
}
/* lookalike swaps: one kanji changed -> plausible non-word */
function spellOpts(it) {
  const w = it.jp, out = [];
  const idx = [...w].map((c, i) => LK[c] ? i : -1).filter(i => i >= 0);
  for (let t = 0; t < 500 && out.length < 3; t++) {
    if (!idx.length) break;
    const i = pick(idx), sub = pick([...LK[w[i]]]);
    const cand = w.slice(0, i) + sub + w.slice(i + 1);
    if (cand === w || out.includes(cand)) continue;
    if ((READ_OF.get(cand) || new Set()).has(it.read)) continue;  // never a 2nd right answer
    out.push(cand);
  }
  while (out.length < 3) {
    const o = pick(KANJI_WORDS);
    if (o.jp !== w && !out.includes(o.jp) && !(READ_OF.get(o.jp) || new Set()).has(it.read)) out.push(o.jp);
  }
  return out;
}
function meanOpts(it) {
  const out = [];
  for (let t = 0; t < 900 && out.length < 3; t++) {
    const m = pick(ALL_MEAN);
    if (m !== it.mean && !out.includes(m)) out.push(m);
  }
  return out;
}
function wordOpts(it) {
  const out = [], same = KANJI_WORDS.filter(x => x.jp.length === it.jp.length && x.jp !== it.jp);
  const pool = same.length > 8 ? same : ITEMS;
  for (let t = 0; t < 900 && out.length < 3; t++) {
    const o = pick(pool);
    if (o.jp !== it.jp && o.mean !== it.mean && !out.includes(o.jp)) out.push(o.jp);
  }
  return out;
}

/* ================= question builders ================= */
const HAS_KANJI = i => /[\u4e00-\u9fff]/.test(i.jp);
const QTYPES = {
  read: {
    label: 'Read it', need: HAS_KANJI,
    build: it => ({ tag: 'What is the reading?', jp: it.jp, size: it.jp.length > 3 ? 'sz-md' : 'sz-lg', sub: null, right: it.read, opts: readOpts(it), font: 'jp' })
  },
  spell: {
    label: 'Choose the kanji', need: HAS_KANJI,
    build: it => ({ tag: 'Which spelling is correct?', jp: it.read, size: 'sz-md', sub: it.mean, right: it.jp, opts: spellOpts(it), font: 'jp' })
  },
  mean: {
    label: 'Meaning', need: () => true,
    build: it => ({ tag: 'What does it mean?', jp: it.jp, size: it.jp.length > 3 ? 'sz-md' : 'sz-lg', sub: it.read !== it.jp ? it.read : null, right: it.mean, opts: meanOpts(it), font: 'en' })
  },
  recall: {
    label: 'Meaning → word', need: () => true,
    build: it => ({ tag: 'Which word is this?', en: it.mean, right: it.jp, opts: wordOpts(it), font: 'jp' })
  },
  type: {
    label: 'Type the reading', need: HAS_KANJI,
    build: it => ({ tag: 'Type the reading in hiragana', jp: it.jp, size: it.jp.length > 3 ? 'sz-md' : 'sz-lg', sub: null, right: it.read, typing: true })
  }
};

/* ================= UI shell ================= */
let view = 'drill', session = null, kb = null, timer = null;
function clearTimer(){ if(timer){ clearInterval(timer); timer=null; } }
const NAV = [
  ['PLAN', null],
  ['plan', '計', 'What to do now', ''],
  ['PRACTICE', null],
  ['drill', '藍', 'Smart drill', 'SRS'],
  ['read', '読', 'Reading', ''],
  ['spell', '書', 'Kanji choice', ''],
  ['mean', '意', 'Meaning', ''],
  ['type', '打', 'Type reading', ''],
  ['GAMES', null],
  ['match', '合', 'Match', ''],
  ['sprint', '速', 'Sprint', '60s'],
  ['EXAM', null],
  ['exam', '試', 'Mock section', '35Q'],
  ['REVIEW', null],
  ['stats', '録', 'Progress', ''],
  ['leech', '弱', 'Weak items', ''],
  ['browse', '覧', 'Browse all', ''],
  ['cfg', '設', 'Settings', '']
];
function buildNav() {
  const n = $('#nav'); n.innerHTML = '';
  NAV.forEach(r => {
    if (r[1] === null) { n.appendChild(el('h4', null, r[0])); return; }
    const [id, jp, label, note] = r;
    const b = el('button', view === id ? 'on' : '');
    b.appendChild(el('span', 'jp', jp));
    b.appendChild(el('span', null, label));
    if (note) b.appendChild(el('small', null, note));
    b.onclick = () => go(id);
    n.appendChild(b);
  });
}
function head() {
  const sc = scoped(), ids = sc.map(i => i.id);
  $('#h-due').textContent = ids.filter(isDue).length;
  $('#h-seen').textContent = ids.filter(i => S.p[i]).length;
  $('#h-mast').textContent = ids.filter(i => S.p[i] && S.p[i].lv >= masterLv()).length;
}
function meter(a, b) { $('#meter i').style.width = b ? (a / b * 100) + '%' : '0%'; }
function sessHead() { $('#h-sess').textContent = session ? `${session.i}/${session.q.length}` : '0/0'; }

function go(v) {
  clearTimer();
  view = v; session = null; kb = null; meter(0, 1); sessHead(); buildNav();
  const s = $('#stage'); s.innerHTML = '';
  ({
    drill: () => startDrill(null), read: () => startDrill('read'), spell: () => startDrill('spell'),
    mean: () => startDrill('mean'), type: () => startDrill('type'),
    match: startMatch, sprint: startSprint, exam: startExam,
    stats: showStats, leech: showLeech, browse: showBrowse, cfg: showCfg, plan: showPlan
  }[v] || (() => { }))();
  head();
}

/* ================= drill ================= */
function startDrill(force) {
  const types = force ? [force] : ['read', 'spell', 'mean', 'recall', 'type'];
  const n = S.cfg.len;
  const q = queue(n, i => types.some(t => QTYPES[t] ? QTYPES[t].need(i) : true));
  if (!q.length) return emptyState();
  session = { q, i: 0, ok: 0, types, force, kind: 'drill' };
  nextQ();
}
function emptyState() {
  const s = $('#stage'); s.innerHTML = '';
  const d = el('div', 'empty');
  d.appendChild(el('span', 'jp', '空'));
  d.appendChild(el('p', null, 'Nothing in scope. Widen the scope in Settings.'));
  const b = el('button', 'btn', 'Open settings'); b.onclick = () => go('cfg');
  d.appendChild(b); s.appendChild(d);
}
function nextQ() {
  if (session.i >= session.q.length) return finish();
  const it = session.q[session.i];
  let t = session.force;
  if (!t) {
    const ok = session.types.filter(x => QTYPES[x].need(it));
    const r = S.p[it.id];
    // unseen / weak items start with recognition; strong items get production
    t = (!r || r.lv < 2) ? pick(ok.filter(x => x !== 'type')) || pick(ok)
      : (Math.random() < .3 && ok.includes('type') ? 'type' : pick(ok));
  }
  if (!QTYPES[t].need(it)) t = 'mean';
  renderQ(it, t, QTYPES[t].build(it));
  meter(session.i, session.q.length); sessHead();
}
function renderQ(it, type, q) {
  const s = $('#stage'); s.innerHTML = '';
  const card = el('div', 'card');
  card.appendChild(el('div', 'tag', q.tag));
  if (q.en) card.appendChild(el('div', 'prompt-en', q.en));
  else { const p = el('div', 'prompt-jp ' + q.size, q.jp); card.appendChild(p); }
  if (q.sub) card.appendChild(el('div', 'sub', q.sub));
  s.appendChild(card);

  const fb = el('div', 'fb');
  if (q.typing) {
    const box = el('div', 'typebox');
    const inp = el('input'); inp.placeholder = 'ひらがな'; inp.autocapitalize = 'off'; inp.autocomplete = 'off'; inp.spellcheck = false;
    const go2 = el('button', null, 'Check');
    const submit = () => {
      const v = inp.value.trim();
      if (!v) return;
      const good = (READ_OF.get(it.jp) || new Set([q.right])).has(v) || v === q.right;
      inp.disabled = true; go2.disabled = true;
      grade(it.id, good); if (good) session.ok++;
      showFb(fb, good, q.right, it, good ? null : v);
      kb = { advance: true };
    };
    go2.onclick = submit;
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.disabled ? nextQ() : submit(); } };
    box.appendChild(inp); box.appendChild(go2); s.appendChild(box); s.appendChild(fb);
    setTimeout(() => inp.focus(), 30);
    kb = { reveal: submit };
    return;
  }
  const opts = shuffle([q.right, ...q.opts]);
  const wrap = el('div', 'opts' + (q.font === 'en' ? '' : ' two'));
  const btns = [];
  opts.forEach((o, i) => {
    const b = el('button', 'opt');
    b.appendChild(el('kbd', null, String(i + 1)));
    b.appendChild(el('span', 'txt' + (q.font === 'en' ? ' en' : ''), o));
    b.onclick = () => {
      if (btns[0].disabled) return;
      const good = o === q.right;
      btns.forEach(x => { x.disabled = true; if (x.dataset.v === q.right) x.className = 'opt right'; else x.className = 'opt dim'; });
      if (!good) b.className = 'opt wrong';
      grade(it.id, good); if (good) session.ok++;
      showFb(fb, good, q.right, it, null);
      kb = { advance: true };
    };
    b.dataset.v = o; btns.push(b); wrap.appendChild(b);
  });
  s.appendChild(wrap); s.appendChild(fb);
  kb = { choose: n => { if (btns[n]) btns[n].click(); } };
}
function showFb(fb, good, right, it, typed) {
  fb.className = 'fb show ' + (good ? 'ok' : 'no');
  fb.innerHTML = '';
  fb.style.cursor = 'pointer';
  fb.onclick = () => { if (session) { session.i++; nextQ(); } };
  const nx = el('span', 'nx', 'tap or Enter →');
  const hd = el('div', 'hd', good ? 'Correct' : 'Not that one');
  hd.appendChild(nx); fb.appendChild(hd);
  const b = el('div', 'jp');
  b.textContent = (typed ? `You wrote ${typed}. ` : '') + `${it.jp}（${it.read}）— ${it.mean}`;
  fb.appendChild(b);
  if (it.kind === 'kw' && it.k) {
    const kd = D.kanji.find(x => x.k === it.k);
    if (kd) fb.appendChild(el('div', 'jp', `${kd.k} = ${kd.gloss}　音 ${kd.on || '—'}　訓 ${kd.kun || '—'}`));
  }
}
function finish() {
  const s = $('#stage'); s.innerHTML = '';
  const pct = Math.round(session.ok / session.q.length * 100);
  const p = el('div', 'panel');
  p.appendChild(el('h2', null, `${session.ok} / ${session.q.length}`));
  p.appendChild(el('p', 'lede', pct >= 90 ? 'Strong round. The scheduler has pushed these further out.'
    : pct >= 70 ? 'Decent. The ones you missed come back within the hour.'
      : 'Rough round — that is what this is for. Missed items are queued to return soon.'));
  const r = el('div', 'row');
  const again = el('button', 'btn go', 'Another round'); again.onclick = () => go(view);
  const st = el('button', 'btn', 'See progress'); st.onclick = () => go('stats');
  r.appendChild(again); r.appendChild(st); p.appendChild(r);
  s.appendChild(p);
  meter(1, 1); session = null; sessHead(); head();
  kb = { advance: false, restart: () => go(view) };
}

/* ================= keyboard ================= */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') return go('drill');
  if (!kb) return;
  if (/^[1-4]$/.test(e.key) && kb.choose) { e.preventDefault(); kb.choose(+e.key - 1); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (kb.advance && session) { session.i++; nextQ(); }
    else if (kb.restart) kb.restart();
    return;
  }
  if (e.key === ' ' && kb.reveal) { e.preventDefault(); kb.reveal(); }
});

/* ================= match game ================= */
function startMatch(){
  const s=$('#stage'); s.innerHTML='';
  const pairs=queue(8, HAS_KANJI).slice(0,8);
  if(pairs.length<4) return emptyState();
  const cells=[];
  pairs.forEach(it=>{
    cells.push({id:it.id,txt:it.jp,jp:true});
    cells.push({id:it.id,txt:it.read,jp:false});
  });
  shuffle(cells);
  const st={sel:null,left:pairs.length,t0:Date.now(),miss:0};
  const p=el('div','panel');
  p.appendChild(el('h2',null,'Match'));
  p.appendChild(el('p','lede','Pair each word with its reading. Wrong pairs count against the item.'));
  const g=el('div','grid');
  cells.forEach(c=>{
    const t=el('div','tile'+(c.jp?' jp':''),c.txt);
    t.onclick=()=>{
      if(t.classList.contains('gone'))return;
      if(!st.sel){st.sel=[t,c];t.classList.add('sel');return;}
      if(st.sel[0]===t){t.classList.remove('sel');st.sel=null;return;}
      const [pt,pc]=st.sel; pt.classList.remove('sel'); st.sel=null;
      if(pc.id===c.id && pc.jp!==c.jp){
        grade(c.id,true); pt.classList.add('gone'); t.classList.add('gone');
        if(--st.left===0){
          const secs=((Date.now()-st.t0)/1000).toFixed(1);
          p.appendChild(el('p','lede',`Cleared in ${secs}s with ${st.miss} mismatch${st.miss===1?'':'es'}.`));
          const b=el('button','btn go','Play again'); b.onclick=startMatch; p.appendChild(b);
          head();
        }
      }else{
        st.miss++; grade(c.id,false);
        [pt,t].forEach(x=>{x.classList.add('miss');setTimeout(()=>x.classList.remove('miss'),260);});
      }
    };
    g.appendChild(t);
  });
  p.appendChild(g); s.appendChild(p);
}

/* ================= sprint: 60 seconds ================= */
function startSprint(){
  const s=$('#stage'); s.innerHTML='';
  const q=queue(200,HAS_KANJI); if(!q.length) return emptyState();
  let i=0,score=0,streak=0,best=0,left=60;
  const wrap=el('div','exam-q');
  const hd=el('div','exam-hd');
  const sc=el('span',null,'0'); const stk=el('span',null,''); const tm=el('span','t','60');
  hd.appendChild(el('span',null,'Sprint'));hd.appendChild(sc);hd.appendChild(stk);hd.appendChild(tm);
  const slot=el('div'); wrap.appendChild(hd); wrap.appendChild(slot); s.appendChild(wrap);
  clearTimer();
  timer=setInterval(()=>{
    left--; tm.textContent=left; if(left<=10) tm.classList.add('low');
    if(left<=0){clearTimer();done();}
  },1000);
  function done(){
    slot.innerHTML='';
    const p=el('div','panel');
    p.appendChild(el('h2',null,`${score} correct`));
    p.appendChild(el('p','lede',`Best streak ${best}. Every answer still counted toward scheduling.`));
    const b=el('button','btn go','Go again'); b.onclick=startSprint; p.appendChild(b);
    slot.appendChild(p); kb={restart:startSprint}; head();
  }
  function step(){
    if(left<=0)return;
    const it=q[i++%q.length];
    const t=Math.random()<.5?'read':'mean';
    const qq=QTYPES[t].build(it);
    slot.innerHTML='';
    const card=el('div','card');
    card.appendChild(el('div','tag',qq.tag));
    card.appendChild(el('div','prompt-jp '+qq.size,qq.jp));
    slot.appendChild(card);
    const opts=shuffle([qq.right,...qq.opts]);
    const w=el('div','opts'+(qq.font==='en'?'':' two')),btns=[];
    opts.forEach((o,n)=>{
      const b=el('button','opt');
      b.appendChild(el('kbd',null,String(n+1)));
      b.appendChild(el('span','txt'+(qq.font==='en'?' en':''),o));
      b.onclick=()=>{
        if(btns[0].disabled)return;
        const good=o===qq.right; grade(it.id,good);
        if(good){score++;streak++;best=Math.max(best,streak);sc.textContent=score;stk.textContent=streak>2?`streak ${streak}`:'';}
        else{streak=0;stk.textContent='';left=Math.max(0,left-3);tm.textContent=left;}
        btns.forEach(x=>{x.disabled=true;if(x.dataset.v===qq.right)x.className='opt right';else x.className='opt dim';});
        if(!good)b.className='opt wrong';
        setTimeout(step,good?180:900);
      };
      b.dataset.v=o;btns.push(b);w.appendChild(b);
    });
    slot.appendChild(w);
    kb={choose:n=>{if(btns[n])btns[n].click();}};
  }
  step();
}

/* ================= mock exam section ================= */
function startExam(){
  const s=$('#stage'); s.innerHTML='';
  const pool=scoped().filter(HAS_KANJI);
  if(pool.length<40) return emptyState();
  const chosen=shuffle([...pool]).slice(0,35);
  const qs=chosen.map((it,n)=>{
    const t = n<14?'read' : n<22?'spell' : n<30?'mean':'recall';
    return {it,t,q:QTYPES[t].build(it)};
  });
  let i=0,ans=[],left=25*60;
  const wrap=el('div','exam-q'); s.appendChild(wrap);
  clearTimer();
  timer=setInterval(()=>{left--;if(left<=0){clearTimer();report();}else paintTime();},1000);
  let tmEl=null;
  function paintTime(){ if(!tmEl)return;
    const m=Math.floor(left/60),ss=String(left%60).padStart(2,'0');
    tmEl.textContent=`${m}:${ss}`; if(left<120)tmEl.classList.add('low');
  }
  function draw(){
    if(i>=qs.length){clearTimer();return report();}
    const {it,t,q}=qs[i];
    wrap.innerHTML='';
    const hd=el('div','exam-hd');
    hd.appendChild(el('span',null,`問題 ${i+1} / ${qs.length}`));
    hd.appendChild(el('span',null,{read:'読み',spell:'表記',mean:'意味',recall:'語彙'}[t]));
    tmEl=el('span','t'); hd.appendChild(tmEl); paintTime();
    wrap.appendChild(hd);
    const card=el('div','card');
    card.appendChild(el('div','tag',q.tag));
    if(q.en)card.appendChild(el('div','prompt-en',q.en));
    else card.appendChild(el('div','prompt-jp '+q.size,q.jp));
    if(q.sub)card.appendChild(el('div','sub',q.sub));
    wrap.appendChild(card);
    const opts=shuffle([q.right,...q.opts]);
    const w=el('div','opts'+(q.font==='en'?'':' two')),btns=[];
    opts.forEach((o,n)=>{
      const b=el('button','opt');
      b.appendChild(el('kbd',null,String(n+1)));
      b.appendChild(el('span','txt'+(q.font==='en'?' en':''),o));
      b.onclick=()=>{ans[i]={ok:o===q.right,it,t,chose:o,right:q.right};i++;draw();};
      b.dataset.v=o;btns.push(b);w.appendChild(b);
    });
    wrap.appendChild(w);
    kb={choose:n=>{if(btns[n])btns[n].click();}};
    meter(i,qs.length);
  }
  function report(){
    ans.forEach(a=>a&&grade(a.it.id,a.ok));
    const got=ans.filter(a=>a&&a.ok).length;
    const per={};
    ans.forEach(a=>{if(!a)return;per[a.t]=per[a.t]||[0,0];per[a.t][1]++;if(a.ok)per[a.t][0]++;});
    wrap.innerHTML='';
    const p=el('div','panel');
    p.appendChild(el('h2',null,`${got} / ${qs.length}`));
    const pct=Math.round(got/qs.length*100);
    p.appendChild(el('p','lede',pct>=85?'Comfortably above what this section needs.'
      :pct>=70?'Around the pass line — no margin yet.'
      :'Below where you want to be. The breakdown below says where.'));
    const k=el('div','kpis');
    Object.entries(per).forEach(([t,[a,b]])=>{
      const d=el('div','kpi');
      d.appendChild(el('b',null,`${a}/${b}`));
      d.appendChild(el('span',null,{read:'読み reading',spell:'表記 kanji choice',mean:'意味 meaning',recall:'語彙 vocabulary'}[t]));
      k.appendChild(d);
    });
    p.appendChild(k);
    const wrong=ans.filter(a=>a&&!a.ok);
    if(wrong.length){
      p.appendChild(el('h4',null,''));
      const tb=el('table','leech');
      const tr=el('tr');['Item','Correct','You chose'].forEach(h=>tr.appendChild(el('th',null,h)));
      tb.appendChild(tr);
      wrong.forEach(a=>{
        const r=el('tr');
        r.appendChild(el('td','jp',a.it.jp));
        r.appendChild(el('td','r',a.right));
        r.appendChild(el('td','r',a.chose));
        tb.appendChild(r);
      });
      p.appendChild(tb);
    }
    const row=el('div','row'); row.style.marginTop='20px';
    const b=el('button','btn go','New paper'); b.onclick=startExam;
    const b2=el('button','btn','Drill what I missed');
    b2.onclick=()=>{const ids=new Set(wrong.map(a=>a.it.id));
      session={q:ITEMS.filter(x=>ids.has(x.id)),i:0,ok:0,types:['read','spell','mean'],force:null,kind:'drill'};
      view='drill';buildNav();if(session.q.length)nextQ();else go('drill');};
    row.appendChild(b);row.appendChild(b2);p.appendChild(row);
    wrap.appendChild(p); meter(1,1); head();
    kb={restart:startExam};
  }
  draw();
}

/* ================= progress ================= */
function showStats(){
  const s=$('#stage'); s.innerHTML='';
  const sc=scoped(), ids=sc.map(i=>i.id);
  const seen=ids.filter(i=>S.p[i]), due=ids.filter(isDue);
  const mast=ids.filter(i=>S.p[i]&&S.p[i].lv>=masterLv());
  const leech=ids.filter(i=>S.p[i]&&S.p[i].bad>=4&&S.p[i].lv<masterLv());
  const today=S.log[new Date().toISOString().slice(0,10)]||0;
  const p=el('div','panel');
  p.appendChild(el('h2',null,'Progress'));
  p.appendChild(el('p','lede',daysLeft()!==null&&daysLeft()<=25
    ? `Exam in ${daysLeft()} days, so intervals are compressed — nothing is scheduled past the date. Mastered means level 4 or higher here.`
    : 'Mastered means level 5 or higher — you have answered it right several times across days, not minutes.'));
  const k=el('div','kpis');
  [['due',due.length,'due now'],['',seen.length,'items started'],['',mast.length,'mastered'],
   ['leech',leech.length,'weak items'],['',today,'answers today'],['',sc.length,'in scope']]
   .forEach(([cls,v,l])=>{
    const d=el('div','kpi'+(cls?' '+cls:''));
    d.appendChild(el('b',null,String(v)));d.appendChild(el('span',null,l));k.appendChild(d);
  });
  p.appendChild(k);
  const lv=Array(IVL.length).fill(0);
  ids.forEach(i=>{const r=S.p[i];lv[r?r.lv:0]++;});
  const L=ladder();
  const fmt=v=>v===0?'now':v<HOUR?Math.round(v/60e3)+' min':v<DAY?Math.round(v/HOUR)+' h':Math.round(v/DAY)+' d';
  const names=L.map((v,i)=>i===0?'unseen / reset':fmt(v));
  const bars=el('div','bars'); const mx=Math.max(...lv,1);
  lv.forEach((n,i)=>{
    const b=el('div','bar');
    b.appendChild(el('span','lbl',names[i]));
    const tr=el('div','track'); const f=el('i',i>=masterLv()?'m':''); f.style.width=(n/mx*100)+'%'; tr.appendChild(f);
    b.appendChild(tr); b.appendChild(el('span','n',String(n)));
    bars.appendChild(b);
  });
  p.appendChild(bars);
  const row=el('div','row'); row.style.marginTop='22px';
  const g=el('button','btn go','Drill due items'); g.onclick=()=>go('drill');
  row.appendChild(g);
  if(leech.length){const w=el('button','btn','Work on weak items');w.onclick=()=>go('leech');row.appendChild(w);}
  p.appendChild(row);
  s.appendChild(p);
}

function showLeech(){
  const s=$('#stage'); s.innerHTML='';
  const rows=scoped().filter(i=>{const r=S.p[i.id];return r&&r.bad>=3;})
    .sort((a,b)=>S.p[b.id].bad-S.p[a.id].bad).slice(0,60);
  const p=el('div','panel');
  p.appendChild(el('h2',null,'Weak items'));
  if(!rows.length){
    p.appendChild(el('p','lede','Nothing here yet. Items appear once you have missed them three times or more.'));
    s.appendChild(p);return;
  }
  p.appendChild(el('p','lede','Ranked by how often you have got them wrong. These are worth writing out by hand — repetition alone has not fixed them.'));
  const r0=el('div','row');
  const b=el('button','btn go','Drill only these');
  b.onclick=()=>{session={q:rows.slice(0,20),i:0,ok:0,types:['read','spell','mean'],force:null,kind:'drill'};
    view='drill';buildNav();nextQ();};
  r0.appendChild(b); p.appendChild(r0);
  const tb=el('table','leech');
  const tr=el('tr');['Word','Reading','Meaning','Wrong'].forEach(h=>tr.appendChild(el('th',null,h)));
  tb.appendChild(tr);
  rows.forEach(i=>{
    const r=el('tr');
    r.appendChild(el('td','jp',i.jp));
    r.appendChild(el('td','r',i.read));
    r.appendChild(el('td',null,i.mean));
    r.appendChild(el('td','x',String(S.p[i.id].bad)));
    tb.appendChild(r);
  });
  p.appendChild(tb); s.appendChild(p);
}

/* ================= browse ================= */
function showBrowse(){
  const s=$('#stage'); s.innerHTML='';
  const p=el('div','panel');
  p.appendChild(el('h2',null,'Browse'));
  p.appendChild(el('p','lede','Every kanji in scope with its readings and the words built from it. Search by kanji, reading, or English.'));
  const row=el('div','row');
  const inp=el('input'); inp.placeholder='search…';
  inp.style.cssText='flex:1;background:var(--ink-2);border:1px solid var(--ink-3);border-radius:3px;color:var(--washi);padding:9px 12px';
  row.appendChild(inp); p.appendChild(row);
  const out=el('div'); p.appendChild(out); s.appendChild(p);
  let shown=40;
  function paint(){
    const q=inp.value.trim().toLowerCase();
    out.innerHTML='';
    const all=D.kanji.filter(k=>{
      if(S.cfg.scope==='n5'&&k.level!=='N5')return false;
      if(S.cfg.scope==='n4'&&k.level!=='N4')return false;
      if(!q)return true;
      return k.k.includes(q)||k.gloss.toLowerCase().includes(q)||
        (k.on+k.kun).includes(q)||k.words.some(w=>w.w.includes(q)||w.r.includes(q)||w.m.toLowerCase().includes(q));
    });
    if(!all.length){out.appendChild(el('p','lede','No match.'));return;}
    const ks=all.slice(0,shown);
    const cnt=el('p','lede');
    cnt.style.cssText='margin:0 0 4px;font-size:13px';
    cnt.textContent=`Showing ${ks.length} of ${all.length} kanji in scope.`;
    out.appendChild(cnt);
    ks.forEach(k=>{
      const box=el('div'); box.style.cssText='border-top:1px solid var(--ink-3);padding:14px 0;display:flex;gap:18px;align-items:flex-start';
      const big=el('div',null,k.k); big.style.cssText='font-family:var(--jp-serif);font-size:52px;line-height:1;flex:0 0 62px';
      box.appendChild(big);
      const info=el('div'); info.style.flex='1';
      const t=el('div',null,`${k.gloss}　·　音 ${k.on||'—'}　訓 ${k.kun||'—'}`);
      t.style.cssText='font-family:var(--jp-sans);color:var(--mute);font-size:13px;margin-bottom:6px';
      info.appendChild(t);
      k.words.forEach(w=>{
        const l=el('div',null,`${w.w}（${w.r}）— ${w.m}`);
        l.style.cssText='font-family:var(--jp-sans);font-size:14.5px;padding:2px 0';
        info.appendChild(l);
      });
      box.appendChild(info); out.appendChild(box);
    });
    if(all.length>ks.length){
      const more=el('button','btn go',`Show ${Math.min(40,all.length-ks.length)} more`);
      more.style.marginTop='16px';
      more.onclick=()=>{shown+=40;paint();};
      out.appendChild(more);
    } else if(all.length>40){
      const top=el('button','btn','Back to top');
      top.style.marginTop='16px';
      top.onclick=()=>{shown=40;paint();out.scrollIntoView({block:'start'});};
      out.appendChild(top);
    }
  }
  inp.oninput=()=>{shown=40;paint();}; paint();
}

/* ================= settings ================= */
function showCfg(){
  const s=$('#stage'); s.innerHTML='';
  const p=el('div','panel');
  p.appendChild(el('h2',null,'Settings'));
  p.appendChild(el('p','lede','Scope controls what every mode draws from. Narrow it when a specific level or list is weak; widen it before a mock exam.'));
  const mk=(label,opts,cur,set)=>{
    const r=el('div','row'); r.appendChild(el('label',null,label));
    const g=el('div','seg');
    opts.forEach(([v,t])=>{
      const b=el('button',cur===v?'on':'',t);
      b.onclick=()=>{set(v);save();showCfg();head();};
      g.appendChild(b);
    });
    r.appendChild(g); p.appendChild(r);
  };
  mk('Scope',[['all','Everything'],['n5','N5 only'],['n4','N4 only'],['kanji','Kanji words'],['vocab','Vocabulary']],
     S.cfg.scope,v=>S.cfg.scope=v);
  mk('Round length',[[10,'10'],[20,'20'],[35,'35'],[60,'60']],S.cfg.len,v=>S.cfg.len=+v);
  mk('Exam in',[[7,'7 days'],[12,'12 days'],[21,'21 days'],[-1,'no date']],S.cfg.examIn,v=>S.cfg.examIn=+v);
  if(daysLeft()!==null&&daysLeft()<=25){
    const w=el('p','lede');
    w.style.cssText='margin-top:-4px;color:var(--brass)';
    const L=ladder();
    w.textContent=`Compressed schedule active: ${Math.round(L[1]/60e3)} min → ${Math.round(L[2]/36e5)} h → ${Math.round(L[3]/36e5)} h → ${(L[4]/864e5).toFixed(1)} d → ${(L[6]/864e5).toFixed(1)} d. Nothing lands after the exam.`;
    p.appendChild(w);
  }
  const info=el('p','lede');
  info.style.marginTop='18px';
  const sc=scoped();
  info.textContent=`${sc.length} items in scope · ${sc.filter(i=>HAS_KANJI(i)).length} contain kanji · ${D.kanji.length} kanji total.`;
  p.appendChild(info);
  const r=el('div','row'); r.style.marginTop='10px';
  const ex=el('button','btn','Export progress');
  ex.onclick=()=>{
    const a=document.createElement('a');
    a.href='data:application/json,'+encodeURIComponent(JSON.stringify(S));
    a.download='n4-progress.json'; a.click();
  };
  const im=el('button','btn','Import progress');
  im.onclick=()=>{
    const f=document.createElement('input'); f.type='file'; f.accept='.json';
    f.onchange=()=>{const rd=new FileReader();
      rd.onload=()=>{try{const j=JSON.parse(rd.result);if(j.p){S=j;save();showCfg();head();}}catch(e){alert('That file could not be read.');}};
      rd.readAsText(f.files[0]);};
    f.click();
  };
  const rs=el('button','btn warn','Reset all progress');
  rs.onclick=()=>{if(confirm('Delete all progress? This cannot be undone.')){S={p:{},cfg:S.cfg,log:{}};save();showCfg();head();}};
  r.appendChild(ex);r.appendChild(im);r.appendChild(rs);p.appendChild(r);
  s.appendChild(p);
}

/* ================= triage: the 12-day plan ================= */
function showPlan(){
  const s=$('#stage'); s.innerHTML='';
  const dl=daysLeft();
  const p=el('div','panel');
  p.appendChild(el('h2',null,dl!==null?`${dl} days left`:'Study plan'));
  const all=ITEMS, n5=all.filter(i=>i.level==='N5'), n4=all.filter(i=>i.level==='N4');
  const done=id=>S.p[id]&&S.p[id].lv>=masterLv();
  const seen=id=>!!S.p[id];
  const stat=arr=>({n:arr.length,seen:arr.filter(i=>seen(i.id)).length,done:arr.filter(i=>done(i.id)).length});
  const a=stat(n5),b=stat(n4);
  p.appendChild(el('p','lede',
    'With this little time you cannot master everything, so do not try. One broad pass beats deep work on a fraction of the list — multiple choice rewards recognition, and recognition is cheap. Order below is by payoff.'));
  const k=el('div','kpis');
  [['',a.seen+'/'+a.n,'N5 items started'],['',b.seen+'/'+b.n,'N4 items started'],
   ['',a.done+b.done,'at review level 4+'],['due',all.filter(i=>isDue(i.id)).length,'due right now']]
   .forEach(([c,v,l])=>{const d=el('div','kpi'+(c?' '+c:''));d.appendChild(el('b',null,String(v)));d.appendChild(el('span',null,l));k.appendChild(d);});
  p.appendChild(k);

  /* today's new-item target */
  const unseen=ITEMS.filter(i=>!S.p[i.id]).length;
  const sweepDays=dl===null?null:Math.max(0,dl-7);
  const target=sweepDays?Math.ceil(unseen/sweepDays):0;
  const todayKey=new Date().toISOString().slice(0,10);
  const gotToday=(S.newlog||{})[todayKey]||0;
  const tbox=el('div');
  tbox.style.cssText='background:var(--ink-2);border:1px solid var(--ink-3);border-left:3px solid var(--brass);border-radius:3px;padding:16px 18px;margin-bottom:24px';
  if(target>0){
    const h=el('div',null,`Today: meet ${target} new items`);
    h.style.cssText='font-weight:600;margin-bottom:4px';
    tbox.appendChild(h);
    const sub=el('div',null,`${gotToday} done · ${Math.max(0,target-gotToday)} to go · ${unseen} never seen yet, ${sweepDays} day${sweepDays===1?'':'s'} of first-pass left`);
    sub.style.cssText='color:var(--mute);font-size:13px;margin-bottom:10px';
    tbox.appendChild(sub);
    const tr=el('div','track');
    tr.style.cssText='height:10px;background:var(--ink);border-radius:2px;overflow:hidden';
    const f=el('i'); f.style.cssText=`display:block;height:100%;width:${Math.min(100,gotToday/target*100)}%;background:var(--brass)`;
    tr.appendChild(f); tbox.appendChild(tr);
    if(gotToday>=target){
      const ok=el('div',null,'Target met. Anything more today is a bonus — go clear the due queue instead.');
      ok.style.cssText='color:var(--moss);font-size:13px;margin-top:9px';
      tbox.appendChild(ok);
    }
  } else {
    const h=el('div',null,'No new items today');
    h.style.cssText='font-weight:600;margin-bottom:4px';
    tbox.appendChild(h);
    const sub=el('div',null,dl===null?'Set an exam date in Settings to get a daily target.'
      :'You are past the first-pass phase. Clear the due queue, work the weak list, and sit mock papers.');
    sub.style.cssText='color:var(--mute);font-size:13px';
    tbox.appendChild(sub);
  }
  p.appendChild(tbox);

  const steps=[
    ['Clear the due queue first','Always. Due items are the ones about to slip out of memory — they are worth more than anything new.','Smart drill'],
    ['Finish N5 before touching N4','N4 papers test N5 material too, and N5 kanji are components of N4 ones. Set scope to N5 only until you have seen all of it once.','Settings'],
    ['One pass over N4, recognition only','Multiple choice, no typing. Speed over depth. You want every item to have been seen at least twice.','Sprint'],
    ['Hammer the weak list daily','Anything missed four times will not fix itself. Write those by hand — ten minutes with a pen beats an hour of tapping.','Weak items'],
    ['Mock section every second day','Not to study, to measure. The per-section breakdown tells you where the marks are actually going.','Mock section']
  ];
  steps.forEach(([t,why,go2],i)=>{
    const box=el('div');
    box.style.cssText='border-top:1px solid var(--ink-3);padding:14px 0;display:flex;gap:16px;align-items:flex-start';
    const num=el('div',null,String(i+1));
    num.style.cssText='font-family:var(--jp-serif);font-size:26px;color:var(--brass);flex:0 0 28px;line-height:1.1';
    box.appendChild(num);
    const inner=el('div'); inner.style.flex='1';
    const h=el('div',null,t); h.style.cssText='font-weight:600;margin-bottom:3px';
    inner.appendChild(h);
    const wy=el('div',null,why); wy.style.cssText='color:var(--mute);font-size:13.5px;max-width:64ch';
    inner.appendChild(wy);
    box.appendChild(inner);
    const b=el('button','btn',go2);
    b.style.flex='0 0 auto';
    b.onclick=()=>{const m={'Smart drill':'drill','Settings':'cfg','Sprint':'sprint','Weak items':'leech','Mock section':'exam'};go(m[go2]);};
    box.appendChild(b);
    p.appendChild(box);
  });

  if(dl!==null&&dl>0){
    const need=Math.ceil(all.length/dl);
    const t=el('p','lede');
    t.style.marginTop='20px';
    t.textContent=`To see all ${all.length} items once in ${dl} days you need about ${need} new items a day — roughly ${Math.round(need*6/60)} minutes of new material, plus reviews on top. Reviews grow fast, so front-load: do more in the first four days than the last four.`;
    p.appendChild(t);
  }
  s.appendChild(p);
}

/* ================= boot ================= */
buildNav(); go('plan');

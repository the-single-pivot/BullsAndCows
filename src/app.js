/**
 * The game: state above, view below, wired to the markup in index.html.
 * The rules live in engine.js and the session record in session.js, and
 * nothing in this file recomputes either of them.
 */
import {
  LEN, LIMIT, PAR, DIGITS, UNIVERSE,
  score, narrow, randomCode, num, tally,
} from './engine.js';
import { games, record, stats } from './session.js';

/* ═══════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════ */

let S;

function newGame() {
  S = {
    code: randomCode(),
    guesses: [],   // { digits, bulls, cows, remaining }
    input: [],
    solved: false,
    lost: false,
    started: 0,   // set by the first digit entered, so reading the rules is free
    ended: 0,
    msg: '',
    tone: '',
    confirming: false,
  };
}

/** Decided, one way or the other: four bulls, or the tenth guess spent. */
const over = () => S.solved || S.lost;

/** Milliseconds on the current code: live while playing, frozen once decided. */
function elapsed() {
  if (!S.started) return 0;
  return (S.ended || Date.now()) - S.started;
}

function clockText(ms) {
  const t = Math.floor(ms / 1000);
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

/** The same duration for a screen reader, which reads "2:41" as a ratio. */
function timeWords(ms) {
  const t = Math.floor(ms / 1000), m = Math.floor(t / 60), sec = t % 60;
  const parts = [];
  if (m) parts.push(m + (m === 1 ? ' minute' : ' minutes'));
  if (sec || !m) parts.push(sec + (sec === 1 ? ' second' : ' seconds'));
  return parts.join(' ');
}

function parLine(n) {
  const d = n - PAR;
  if (d === 0) return 'on par';
  return Math.abs(d) + (d < 0 ? ' under par' : ' over par');
}
function enterDigit(d) {
  if (over()) return;
  if (S.input.length >= LEN) {
    say('All four slots are full.', 'error');
    return;
  }
  if (S.input.indexOf(d) !== -1) {
    say(d + ' is already in this guess.', 'error');
    shake();
    return;
  }
  if (!S.started) S.started = Date.now();
  S.input.push(d);
  S.msg = '';
  render();
}

function deleteDigit() {
  if (over() || !S.input.length) return;
  S.input.pop();
  S.msg = '';
  render();
}

function clearInput() {
  if (over() || !S.input.length) return;
  S.input = [];
  S.msg = '';
  render();
}

function submitGuess() {
  if (over()) return;
  if (S.input.length !== LEN) {
    say('Enter all four digits first.', 'error');
    shake();
    return;
  }
  const digits = S.input.slice();
  const { bulls, cows } = score(digits, S.code);
  const entry = { digits, bulls, cows, remaining: 0 };
  S.guesses.push(entry);
  entry.remaining = narrow(S.guesses).length;

  S.input = [];
  S.msg = '';
  S.tone = '';
  if (bulls === LEN) S.solved = true;
  else if (S.guesses.length === LIMIT) S.lost = true;
  if (over()) {
    S.ended = Date.now();
    record({ solved: S.solved, guesses: S.guesses.length, ms: elapsed() });
  }

  render();
  // The newest guess lands at the foot of the feed, so follow it down if
  // the player had scrolled up through the older ones.
  els.feed.scrollTop = els.feed.scrollHeight;
  announce(entry);
}

/* ═══════════════════════════════════════════════════════════════
   VIEW
   ═══════════════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);
const els = {
  top: document.querySelector('.top'), topActs: $('top-acts'), feed: $('feed'), history: $('history'), primer: $('primer'),
  attempt: $('attempt'), clock: $('clock'), clear: $('btn-clear'), slots: $('slots'), msg: $('msg'),
  play: $('play'), pad: $('pad'), del: $('btn-del'), submit: $('btn-submit'),
  won: $('won'), scrim: $('scrim'), live: $('live'),
  run: $('scrim-run'), runLead: $('run-lead'), runStats: $('run-stats'),
  runHead: $('run-head'), runGames: $('run-games'),
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function say(text, tone) {
  S.msg = text;
  S.tone = tone || '';
  els.msg.textContent = text;
  els.msg.dataset.tone = S.tone;
}

function shake() {
  els.slots.dataset.shake = '1';
  setTimeout(() => delete els.slots.dataset.shake, 320);
}

function pip(kind) {
  const p = el('span', 'pip');
  p.dataset.m = kind;
  p.setAttribute('aria-hidden', 'true');
  return p;
}

function renderTop() {
  els.topActs.replaceChildren();
  els.top.toggleAttribute('data-confirming', S.confirming);
  if (S.confirming) {
    const box = el('div', 'confirm');
    box.append(el('b', null, 'Discard this game?'));
    box.append(el('span', 'spacer'));
    const yes = el('button', null, 'Discard');
    yes.type = 'button';
    yes.dataset.yes = '1';
    const no = el('button', null, 'Cancel');
    no.type = 'button';
    yes.addEventListener('click', () => { newGame(); render(); });
    no.addEventListener('click', () => { S.confirming = false; renderTop(); });
    box.append(yes, no);
    els.topActs.append(box);
    yes.focus();
    return;
  }
  const help = el('button', 'linkish', 'How to play');
  help.type = 'button';
  help.addEventListener('click', openPanel);
  const fresh = el('button', 'linkish', 'New game');
  fresh.type = 'button';
  fresh.addEventListener('click', () => {
    // Only worth a confirmation when there is progress to lose.
    if (!over() && S.guesses.length) { S.confirming = true; renderTop(); return; }
    newGame();
    render();
  });
  els.topActs.append(help, fresh);
}

/**
 * Rows already on screen are left alone. Rebuilding the list on every
 * render restarted each row's entry animation, so the guesses you had
 * already made flickered every time you pressed a digit.
 */
let rowsShown = 0;

function renderFeed() {
  // The primer teaches the rules in the space the guesses will fill.
  els.primer.hidden = S.guesses.length > 0;

  if (S.guesses.length < rowsShown) {     // a new game: start the list over
    els.history.replaceChildren();
    rowsShown = 0;
  }
  // Oldest first, so the guesses read down the screen in the order they
  // were made and the one you just played is the last line.
  for (; rowsShown < S.guesses.length; rowsShown++) {
    els.history.append(guessRow(rowsShown));
  }
}

/** One scored guess. Built once, then never touched again. */
function guessRow(i) {
    const g = S.guesses[i];
    const row = el('li', 'guess');
    if (g.bulls === LEN) row.dataset.win = '1';

    row.append(el('span', 'g-no', String(i + 1)));

    const digits = el('span', 'g-digits');
    for (const d of g.digits) digits.append(el('span', null, String(d)));
    row.append(digits);

    const pips = el('span', 'g-pips');
    for (let b = 0; b < g.bulls; b++) pips.append(pip('bull'));
    for (let c = 0; c < g.cows; c++) pips.append(pip('cow'));
    for (let m = 0; m < LEN - g.bulls - g.cows; m++) pips.append(pip('miss'));
    row.append(pips);

    row.append(el('span', 'g-text', tally(g.bulls, g.cows)));
    row.setAttribute('aria-label',
      'Guess ' + (i + 1) + ': ' + g.digits.join(' ') + '. ' + tally(g.bulls, g.cows) + '.');
    return row;
}

function renderBoard() {
  const left = LIMIT - S.guesses.length;
  els.attempt.textContent = over()
    ? 'The code'
    : 'Guess ' + (S.guesses.length + 1) + ' of ' + LIMIT;
  // the last two guesses, and the code the player never found
  els.attempt.toggleAttribute('data-alert', S.lost || (!over() && left <= 2));
  els.clear.hidden = over() || !S.input.length;

  // Once the game is decided the slots hold the code: the winning guess
  // when it was found, and the answer the player never reached when it wasn't.
  const shown = over() ? S.code : S.input;
  if (els.slots.children.length !== LEN) {
    for (let i = 0; i < LEN; i++) els.slots.append(el('div', 'slot'));
  }
  // Updated in place: a fresh element would replay the fill animation and
  // restart the caret blink on every keystroke.
  for (let i = 0; i < LEN; i++) {
    const s = els.slots.children[i];
    const d = shown[i];
    s.textContent = d != null ? String(d) : '';
    s.toggleAttribute('data-filled', d != null);
    s.toggleAttribute('data-lost', !!S.lost);
    if (d == null && i === S.input.length && !over()) s.dataset.state = 'active';
    else s.removeAttribute('data-state');
    s.setAttribute('aria-label', 'Slot ' + (i + 1) + ': ' + (d != null ? d : 'empty'));
  }

  els.msg.textContent = S.msg;
  els.msg.dataset.tone = S.tone;

  els.play.hidden = over();
  if (els.pad.children.length !== DIGITS.length) {
    for (const d of DIGITS) {
      const k = el('button', 'key', String(d));
      k.type = 'button';
      k.dataset.k = String(d);
      els.pad.append(k);
    }
  }
  // only the disabled state changes, and the key you are pressing has to
  // survive the press: a replaced button drops its own active state
  for (const k of els.pad.children) {
    const d = Number(k.dataset.k);
    const used = S.input.indexOf(d) !== -1;
    k.disabled = used || S.input.length === LEN;
    if (used) k.setAttribute('aria-label', d + ', already in this guess');
    else k.removeAttribute('aria-label');
  }
  els.del.disabled = !S.input.length;
  els.submit.disabled = S.input.length !== LEN;
}

/**
 * The clock is the only thing on screen that moves by itself. It is polled
 * faster than it changes, and only writes when the second actually turns.
 */
let shownClock = '';
function tick() {
  const t = clockText(elapsed());
  if (t !== shownClock) {
    shownClock = t;
    els.clock.textContent = t;
    if (!els.run.hidden) renderRun();
  }
  els.clock.toggleAttribute('data-running', !!S.started && !S.ended);
}

/** Rebuilt only when the result itself changes, so the rise animation
 *  plays once and the share button keeps its "Copied" label. */
let endShown = '';

function renderEnd() {
  const state = over() ? (S.solved ? 'won' : 'lost') + S.guesses.length + '@' + S.ended : '';
  if (state === endShown) return;
  endShown = state;
  els.won.replaceChildren();
  if (!over()) return;
  const box = el('div', 'won');
  const n = S.guesses.length;
  box.append(el('h2', 'won-head', S.solved
    ? 'Solved in ' + n + (n === 1 ? ' guess' : ' guesses')
    : 'Out of guesses'));
  box.append(el('p', 'won-meta', S.solved
    ? clockText(elapsed()) + ' \u00b7 ' + parLine(n)
    : clockText(elapsed()) + ' \u00b7 par is ' + PAR));
  box.append(el('p', 'won-sub', 'Possible codes left after each guess'));
  box.append(el('p', 'won-trail', trailText()));
  box.append(el('p', 'won-run', runLine()));

  const acts = el('div', 'won-acts');
  const share = el('button', 'btn btn-share', 'Copy result');
  share.type = 'button';
  share.addEventListener('click', () => {
    copyText(shareText()).then(done => {
      share.textContent = done ? 'Copied' : 'Copy blocked';
      setTimeout(() => { share.textContent = 'Copy result'; }, 1600);
    });
  });
  const again = el('button', 'btn btn-primary', 'New game');
  again.type = 'button';
  again.addEventListener('click', () => { newGame(); render(); });
  acts.append(share, again);
  box.append(acts);
  els.won.append(box);
}

/** One line of standing, so a game reads against the ones before it. */
function runLine() {
  const r = stats();
  if (r.games <= 1) return 'First code of the session';
  const parts = [r.games + ' codes \u00b7 ' + r.solved + ' cracked'];
  if (r.streak > 1) parts.push(r.streak + ' in a row');
  if (r.best) parts.push('best ' + r.best.guesses + ' in ' + clockText(r.best.ms));
  return parts.join(' \u00b7 ');
}

/**
 * A result worth sending to someone, with the code left out: bulls, cows
 * and misses in the order they came.
 */
function shareText() {
  const head = 'Bulls & Cows \u2014 '
    + (S.solved ? 'cracked in ' + S.guesses.length : 'lost it')
    + ' \u00b7 ' + clockText(elapsed());
  const lines = S.guesses.map(g => '\u25cf'.repeat(g.bulls)
    + '\u25cb'.repeat(g.cows) + '\u00b7'.repeat(LEN - g.bulls - g.cows));
  return head + '\n' + lines.join('\n');
}

/** Clipboard first, then the old selection trick for the browsers that refuse. */
function copyText(text) {
  const legacy = () => {
    try {
      const t = document.createElement('textarea');
      t.value = text;
      t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;top:-200px;opacity:0';
      document.body.append(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch (e) { return false; }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, legacy);
    }
  } catch (e) { /* fall through to the old way */ }
  return Promise.resolve(legacy());
}

/* ── The run panel ─────────────────────────────────────────────── */

function renderRun() {
  const r = stats();
  els.runLead.textContent = over() || !S.started
    ? (r.games ? '' : 'No code finished yet. The clock starts on your first digit.')
    : 'On the board now: guess ' + (S.guesses.length + 1) + ' of ' + LIMIT
      + ', ' + clockText(elapsed()) + ' in.';
  els.runLead.hidden = !els.runLead.textContent;

  els.runStats.replaceChildren();
  const cells = [
    ['Codes played', String(r.games)],
    ['Cracked', r.games ? r.solved + ' of ' + r.games : '\u2014'],
    ['On a streak', r.streak ? String(r.streak) : '\u2014'],
    ['Fewest guesses', r.best ? String(r.best.guesses) : '\u2014'],
    ['Quickest', r.fastest ? clockText(r.fastest.ms) : '\u2014'],
    ['Average', r.avg ? clockText(r.avg) : '\u2014'],
  ];
  for (const [k, v] of cells) {
    const box = el('div');
    box.append(el('div', 'stat-k', k), el('div', 'stat-v', v));
    els.runStats.append(box);
  }

  els.runHead.hidden = !r.games && !S.started;
  els.runGames.replaceChildren();
  if (!over() && S.started) {
    const li = el('li');
    li.append(el('span', 'gi', String(games.length + 1)),
              el('span', 'gr gnow', 'Playing \u00b7 guess ' + (S.guesses.length + 1) + ' of ' + LIMIT),
              el('span', 'gt', clockText(elapsed())));
    els.runGames.append(li);
  }
  // newest first, the way the guesses read
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i];
    const li = el('li');
    if (!g.solved) li.dataset.lost = '1';
    li.append(el('span', 'gi', String(i + 1)),
              el('span', 'gr', g.solved
                ? 'Cracked in ' + g.guesses + (g.guesses === 1 ? ' guess' : ' guesses')
                : 'Out of guesses'),
              el('span', 'gt', clockText(g.ms)));
    els.runGames.append(li);
  }
}

function trailText() {
  let seq = [UNIVERSE.length, ...S.guesses.map(g => g.remaining)];
  // Once one code is left there is nothing further to narrow, so a run
  // of trailing 1s says nothing. Stop at the first.
  const settled = seq.indexOf(1);
  if (settled !== -1) seq = seq.slice(0, settled + 1);
  const tail = seq.slice(-7);
  return (tail.length < seq.length ? '… ' : '') + tail.map(num).join(' → ');
}

function render() {
  renderTop();
  renderFeed();
  renderBoard();
  renderEnd();
  tick();
  if (!els.run.hidden) renderRun();
}

function announce(entry) {
  const head = 'Guess ' + S.guesses.length + ' of ' + LIMIT + ', '
    + entry.digits.join(' ') + '. ' + tally(entry.bulls, entry.cows) + '.';
  if (S.solved) {
    els.live.textContent = 'Four bulls. Solved in ' + S.guesses.length
      + (S.guesses.length === 1 ? ' guess' : ' guesses') + ', '
      + timeWords(elapsed()) + '.';
  } else if (S.lost) {
    els.live.textContent = head + ' Out of guesses after ' + timeWords(elapsed())
      + '. The code was ' + S.code.join(' ') + '.';
  } else {
    els.live.textContent = head;
  }
}

/* ═══════════════════════════════════════════════════════════════
   INPUT
   ═══════════════════════════════════════════════════════════════ */

els.pad.addEventListener('click', e => {
  const k = e.target.closest('.key');
  if (k) enterDigit(Number(k.dataset.k));
});
els.del.addEventListener('click', deleteDigit);
els.clear.addEventListener('click', clearInput);
els.submit.addEventListener('click', submitGuess);

/* Focusing the close button would scroll a long panel past its own
   heading, so the scroll position is set first and the focus takes none. */
function openPanel() {
  els.scrim.hidden = false;
  els.scrim.querySelector('.panel').scrollTop = 0;
  $('btn-close').focus({ preventScroll: true });
}
function closePanel() { els.scrim.hidden = true; }

function openRun() {
  renderRun();
  els.run.hidden = false;
  els.run.querySelector('.panel').scrollTop = 0;
  $('btn-run-close').focus({ preventScroll: true });
}
function closeRun() { els.run.hidden = true; }

$('btn-close').addEventListener('click', closePanel);
els.scrim.addEventListener('click', e => { if (e.target === els.scrim) closePanel(); });
els.clock.addEventListener('click', openRun);
$('btn-run-close').addEventListener('click', closeRun);
els.run.addEventListener('click', e => { if (e.target === els.run) closeRun(); });

document.addEventListener('keydown', e => {
  if (!els.scrim.hidden || !els.run.hidden) {
    if (e.key === 'Escape') { closePanel(); closeRun(); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key >= '0' && e.key <= '9') { enterDigit(Number(e.key)); e.preventDefault(); }
  else if (e.key === 'Backspace') { deleteDigit(); e.preventDefault(); }
  else if (e.key === 'Enter') { submitGuess(); e.preventDefault(); }
  else if (e.key === 'Escape') { clearInput(); }
});

newGame();
render();
// The clock is the only thing that moves without the player, so it runs
// on its own interval rather than dragging a full render behind it.
setInterval(tick, 250);

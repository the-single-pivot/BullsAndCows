/**
 * The rules of Bulls and Cows, and the single source of truth for every
 * number the interface shows. Pure: no DOM, no storage, no randomness
 * beyond randomCode. Everything here is covered by test/engine.test.js.
 */

export const LEN = 4;
export const LIMIT = 10;          // guesses allowed before the code is given away
export const PAR = 6;             // what a good run looks like, measured against play
export const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Every legal code: four distinct digits, leading zero allowed → 5,040. */
export const UNIVERSE = (() => {
  const out = [];
  for (const a of DIGITS)
    for (const b of DIGITS) { if (b === a) continue;
      for (const c of DIGITS) { if (c === a || c === b) continue;
        for (const d of DIGITS) { if (d === a || d === b || d === c) continue;
          out.push([a, b, c, d]);
        } } }
  return out;
})();

/** bulls = right digit in the right place · cows = right digit elsewhere. */
export function score(guess, code) {
  let bulls = 0, cows = 0;
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === code[i]) bulls++;
    else if (code.indexOf(guess[i]) !== -1) cows++;
  }
  return { bulls, cows };
}

export function agrees(candidate, entry) {
  const s = score(entry.digits, candidate);
  return s.bulls === entry.bulls && s.cows === entry.cows;
}

/** Codes still consistent with every clue given so far. */
export function narrow(entries) {
  let pool = UNIVERSE;
  for (const e of entries) pool = pool.filter(c => agrees(c, e));
  return pool;
}

export function randomCode() {
  return UNIVERSE[Math.floor(Math.random() * UNIVERSE.length)];
}

export const num = n => n.toLocaleString('en-US');

/** "2 bulls · 1 cow", and "no bulls or cows" when a guess reveals nothing. */
export function tally(bulls, cows) {
  const parts = [];
  if (bulls) parts.push(bulls + (bulls === 1 ? ' bull' : ' bulls'));
  if (cows) parts.push(cows + (cows === 1 ? ' cow' : ' cows'));
  return parts.length ? parts.join(' · ') : 'no bulls or cows';
}


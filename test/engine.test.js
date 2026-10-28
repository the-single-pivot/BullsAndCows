import test from 'node:test';
import assert from 'node:assert/strict';
import { LEN, LIMIT, PAR, UNIVERSE, score, narrow, randomCode, tally } from '../src/engine.js';

test('the universe is every four-digit code with no repeated digit', () => {
  assert.equal(UNIVERSE.length, 10 * 9 * 8 * 7);          // 5,040
  for (const code of UNIVERSE) {
    assert.equal(code.length, LEN);
    assert.equal(new Set(code).size, LEN);
  }
  // a leading zero is a legal code, which is easy to filter out by accident
  assert.ok(UNIVERSE.some(c => c[0] === 0));
  assert.equal(new Set(UNIVERSE.map(c => c.join(''))).size, UNIVERSE.length);
});

test('scoring matches the worked example in the rules', () => {
  // 3 7 1 4 against the code 3 4 1 9: the 3 and 1 are placed, the 4 is
  // elsewhere in the code, the 7 is not in it at all
  assert.deepEqual(score([3, 7, 1, 4], [3, 4, 1, 9]), { bulls: 2, cows: 1 });
});

test('scoring the extremes', () => {
  assert.deepEqual(score([1, 2, 3, 4], [1, 2, 3, 4]), { bulls: 4, cows: 0 });
  assert.deepEqual(score([4, 3, 2, 1], [1, 2, 3, 4]), { bulls: 0, cows: 4 });
  assert.deepEqual(score([5, 6, 7, 8], [1, 2, 3, 4]), { bulls: 0, cows: 0 });
  // three bulls and one cow is impossible with distinct digits: the fourth
  // digit has nowhere else to be
  assert.deepEqual(score([1, 2, 3, 5], [1, 2, 3, 4]), { bulls: 3, cows: 0 });
});

test('bulls and cows never exceed the code length, over the whole universe', () => {
  const code = [0, 4, 7, 9];
  for (const guess of UNIVERSE) {
    const { bulls, cows } = score(guess, code);
    assert.ok(bulls + cows <= LEN);
    assert.notEqual(bulls + '' + cows, '31');   // the impossible pair
  }
});

test('scoring is symmetric between guess and code', () => {
  for (let i = 0; i < 200; i++) {
    const a = randomCode(), b = randomCode();
    assert.deepEqual(score(a, b), score(b, a));
  }
});

test('narrowing keeps exactly the codes that agree with every clue', () => {
  assert.equal(narrow([]).length, UNIVERSE.length);

  // the documented case: one bull and no cows from 0123 leaves 480 codes,
  // and no single digit can be ruled out, since each of 0,1,2,3 is still
  // alive in a quarter of them
  const pool = narrow([{ digits: [0, 1, 2, 3], bulls: 1, cows: 0 }]);
  assert.equal(pool.length, 480);
  for (const d of [0, 1, 2, 3]) {
    assert.equal(pool.filter(c => c.indexOf(d) !== -1).length, 120);
  }
});

test('narrowing never drops the real code', () => {
  for (let run = 0; run < 25; run++) {
    const code = randomCode();
    const entries = [];
    for (let i = 0; i < 5; i++) {
      const guess = randomCode();
      const { bulls, cows } = score(guess, code);
      entries.push({ digits: guess, bulls, cows });
      const pool = narrow(entries);
      assert.ok(pool.some(c => c.join('') === code.join('')),
        `lost ${code.join('')} after ${entries.length} guesses`);
    }
  }
});

test('the game is winnable inside the guess limit by plain deduction', () => {
  // play greedily: always guess a code that is still possible. If this ever
  // needs more than LIMIT guesses, the limit is unfair.
  let worst = 0;
  for (let run = 0; run < 40; run++) {
    const code = randomCode();
    const entries = [];
    let pool = UNIVERSE;
    let n = 0;
    while (n < LIMIT) {
      const guess = pool[Math.floor(Math.random() * pool.length)];
      n++;
      const { bulls, cows } = score(guess, code);
      if (bulls === LEN) break;
      entries.push({ digits: guess, bulls, cows });
      pool = narrow(entries);
      assert.ok(pool.length > 0, 'deduction dead-ended');
    }
    assert.ok(n < LIMIT, `took ${n} guesses for ${code.join('')}`);
    worst = Math.max(worst, n);
  }
  assert.ok(worst <= PAR + 3, `worst run was ${worst} guesses`);
});

test('a guess is reported in words', () => {
  assert.equal(tally(2, 1), '2 bulls · 1 cow');
  assert.equal(tally(1, 0), '1 bull');
  assert.equal(tally(0, 2), '2 cows');
  assert.equal(tally(0, 0), 'no bulls or cows');
});

test('randomCode is always a legal code', () => {
  const legal = new Set(UNIVERSE.map(c => c.join('')));
  for (let i = 0; i < 500; i++) assert.ok(legal.has(randomCode().join('')));
});

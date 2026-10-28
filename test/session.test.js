import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * session.js reads storage once, when it loads, so each case gets a fresh
 * copy of the module: a query string defeats Node's module cache.
 */
let nth = 0;
async function load(store) {
  globalThis.sessionStorage = store;
  return import(`../src/session.js?case=${nth++}`);
}

/** A sessionStorage good enough for the module, holding one string. */
function fakeStore(initial) {
  let value = initial;
  return {
    getItem: () => (value === undefined ? null : value),
    setItem: (k, v) => { value = v; },
    read: () => value,
  };
}

const won = (guesses, ms) => ({ solved: true, guesses, ms });

test('an empty store means an empty session', async () => {
  const s = await load(fakeStore());
  assert.deepEqual(s.games, []);
  assert.deepEqual(s.stats(), {
    games: 0, solved: 0, streak: 0, best: null, fastest: null, avg: 0,
  });
});

test('a finished game is kept and written back', async () => {
  const store = fakeStore();
  const s = await load(store);
  s.record(won(4, 61000));
  assert.equal(s.games.length, 1);
  assert.deepEqual(JSON.parse(store.read()), [{ solved: true, guesses: 4, ms: 61000 }]);
});

test('a stored session is read back', async () => {
  const s = await load(fakeStore(JSON.stringify([won(3, 1000), won(7, 2000)])));
  assert.equal(s.games.length, 2);
  assert.equal(s.stats().solved, 2);
});

test('junk in storage starts a clean session instead of breaking', async () => {
  for (const junk of ['not json at all', '{"games":3}', '"a string"', 'null', '7']) {
    const s = await load(fakeStore(junk));
    assert.deepEqual(s.games, [], `on ${junk}`);
  }
});

test('rows that cannot have come from this game are dropped', async () => {
  const bad = [
    null,
    { solved: 'yes', guesses: 4, ms: 10 },      // not a boolean
    { solved: true, guesses: 0, ms: 10 },       // nobody wins in zero guesses
    { solved: true, guesses: 11, ms: 10 },      // past the limit
    { solved: true, guesses: 4, ms: -1 },       // time ran backwards
    { solved: true, guesses: 4 },               // no time at all
  ];
  const s = await load(fakeStore(JSON.stringify([...bad, won(5, 30000)])));
  assert.deepEqual(s.games, [{ solved: true, guesses: 5, ms: 30000 }]);
});

test('a browser that refuses storage still plays', async () => {
  const refuses = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  const s = await load(refuses);
  assert.deepEqual(s.games, []);
  s.record(won(6, 1000));                       // must not throw
  assert.equal(s.stats().games, 1);
});

test('the session panel numbers', async () => {
  const s = await load(fakeStore());
  s.record(won(8, 200000));                     // slowest, most guesses
  s.record({ solved: false, guesses: 10, ms: 400000 });
  s.record(won(4, 90000));                      // fewest guesses
  s.record(won(5, 60000));                      // quickest

  const r = s.stats();
  assert.equal(r.games, 4);
  assert.equal(r.solved, 3);
  assert.equal(r.streak, 2);                    // the loss broke the earlier one
  assert.equal(r.best.guesses, 4);
  assert.equal(r.fastest.ms, 60000);
  assert.equal(r.avg, (200000 + 90000 + 60000) / 3);   // losses are not averaged in
});

test('a tie on guesses is broken by the clock', async () => {
  const s = await load(fakeStore());
  s.record(won(5, 90000));
  s.record(won(5, 50000));
  assert.equal(s.stats().best.ms, 50000);
});

test('the streak counts back from the newest game only', async () => {
  const s = await load(fakeStore());
  s.record(won(4, 1000));
  s.record(won(4, 1000));
  s.record({ solved: false, guesses: 10, ms: 1000 });
  assert.equal(s.stats().streak, 0);
});

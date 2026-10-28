import { LIMIT } from './engine.js';

/**
 * The record of this session. sessionStorage holds it for as long as the tab
 * is open, which is what a session means here: a refresh keeps it, closing
 * the tab clears it. Storage can be absent or throw, and another tab can
 * have written anything at all, so it is read defensively and nothing on
 * screen depends on it being there.
 */
const KEY = 'bc.run';

/** Finished games, oldest first: { solved, guesses, ms }. */
export const games = (() => {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter(g => g
      && typeof g.solved === 'boolean'
      && typeof g.guesses === 'number' && g.guesses >= 1 && g.guesses <= LIMIT
      && typeof g.ms === 'number' && g.ms >= 0) : [];
  } catch (e) { return []; }
})();

/** Add a finished game and persist, if the browser will have it. */
export function record(game) {
  games.push(game);
  try { sessionStorage.setItem(KEY, JSON.stringify(games)); } catch (e) { /* no store, no loss */ }
}

/** Everything the session panel reports, read off the finished games. */
export function stats() {
  const solved = games.filter(g => g.solved);
  let streak = 0;
  for (let i = games.length - 1; i >= 0 && games[i].solved; i--) streak++;
  const pick = (list, better) => list.length ? list.reduce((a, b) => better(b, a) ? b : a) : null;
  return {
    games: games.length,
    solved: solved.length,
    streak: streak,
    best: pick(solved, (b, a) => b.guesses < a.guesses || (b.guesses === a.guesses && b.ms < a.ms)),
    fastest: pick(solved, (b, a) => b.ms < a.ms),
    avg: solved.length ? solved.reduce((t, g) => t + g.ms, 0) / solved.length : 0,
  };
}

// src/gameHub.js
// Petit registre en mémoire pour retrouver/stopper une partie depuis /stop.
const games = new Map(); // gameId -> { type, channelId, messageId, players, stop }

export function registerGame({ id, type, channelId, messageId, players, stop }) {
  games.set(id, { type, channelId, messageId, players, stop });
}

export function unregisterGame(id) {
  games.delete(id);
}

export function findGameForUserInChannel(userId, channelId) {
  for (const [id, g] of games) {
    if (g.channelId === channelId && g.players.includes(userId)) {
      return { id, ...g };
    }
  }
  return null;
}

export function getGame(id) {
  const g = games.get(id);
  return g ? { id, ...g } : null;
}

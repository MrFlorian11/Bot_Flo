// src/commands/morpion.js
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { registerGame, unregisterGame } from '../gameHub.js';

const games = new Map(); // gameId -> state
const PREFIX = 'ttt';
const EMO = { E: '⬜', X: '❌', O: '⭕' };
const TURN_MS = Number(process.env.TURN_TIMEOUT_MS || 120000); // 2 min

// utils
const fmt = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
};

function newGame(p1, p2, client) {
  const gameId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const board = Array.from({ length: 3 }, () => Array(3).fill('E'));
  const state = {
    id: gameId,
    client,
    players: [p1.id, p2.id], // [X, O]
    names: [p1.username, p2.username],
    turn: 0, // 0 -> X, 1 -> O
    board,
    winner: null, // 'X' | 'O' | 'D' | 'F' (forfait) | 'S' (stoppée)
    moves: 0,
    messageId: null,
    channelId: null,
    timer: null,
    ticker: null,       // interval pour le compte à rebours
    deadline: 0,        // timestamp (ms) de fin de tour
    warned15: false,    // ping déjà envoyé à T-15s ?
    createdAt: Date.now(),
  };
  games.set(gameId, state);
  return state;
}

function winLines(b) {
  const lines = [];
  for (let i = 0; i < 3; i++) lines.push([[i,0],[i,1],[i,2]]);
  for (let j = 0; j < 3; j++) lines.push([[0,j],[1,j],[2,j]]);
  lines.push([[0,0],[1,1],[2,2]], [[0,2],[1,1],[2,0]]);
  return lines;
}
function checkWinner(board) {
  for (const line of winLines(board)) {
    const vals = line.map(([r,c]) => board[r][c]);
    if (vals[0] !== 'E' && vals.every(v => v === vals[0])) return vals[0]; // 'X' ou 'O'
  }
  return null;
}
function boardToText(board) {
  return board.map(row => row.map(cell => EMO[cell]).join('')).join('\n');
}
function makeComponents(game) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const empty = game.board[r][c] === 'E' && !game.winner;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}:${game.id}:${r}:${c}`)
          .setLabel(' ')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(EMO[game.board[r][c]])
          .setDisabled(!empty)
      );
    }
    rows.push(row);
  }
  return rows;
}

async function editBoardMessage(game, embed, components) {
  const channel = await game.client.channels.fetch(game.channelId);
  const msg = await channel.messages.fetch(game.messageId);
  await msg.edit({ embeds: [embed], components });
}

function buildEmbed(game, title = '🎮 Morpion') {
  const now = Date.now();
  const remaining = game.winner ? 0 : Math.max(0, game.deadline - now);
  let desc = boardToText(game.board);

  if (game.winner === 'X' || game.winner === 'O') {
    const winnerName = game.winner === 'X' ? game.names[0] : game.names[1];
    title += ' — ✅ Victoire';
    desc += `\n\n🏆 **${winnerName}** a gagné !`;
  } else if (game.winner === 'D') {
    title += ' — 🤝 Égalité';
    desc += `\n\nAucun gagnant cette fois.`;
  } else if (game.winner === 'F') {
    title += ' — ⏱️ Temps écoulé';
    const loserIdx = game.turn; // joueur qui a dépassé (le tour n'a pas été avancé)
    const winnerIdx = 1 - loserIdx;
    desc += `\n\n⏰ **${game.names[loserIdx]}** a dépassé le temps.\n🏆 **${game.names[winnerIdx]}** gagne par forfait.`;
  } else if (game.winner === 'S') {
    title += ' — 🛑 Partie arrêtée';
  } else {
    desc += `\n\nTour de **${game.names[game.turn]}** (${game.turn === 0 ? EMO.X : EMO.O})`;
    desc += `\n⏱️ Temps restant : **${fmt(remaining)}**`;
  }

  return new EmbedBuilder().setTitle(title).setDescription(desc).setTimestamp();
}

function clearTimers(game) {
  clearTimeout(game.timer);
  clearInterval(game.ticker);
  game.timer = null;
  game.ticker = null;
}

async function refreshCountdown(game) {
  // met à jour uniquement l'embed (garde les mêmes composants)
  const embed = buildEmbed(game);
  const components = makeComponents(game);
  try {
    await editBoardMessage(game, embed, components);
  } catch {/* ignore */}
}

async function armTurnTimer(game) {
  clearTimers(game);
  game.warned15 = false;
  game.deadline = Date.now() + TURN_MS;

  // ticker d'affichage (toutes les 5s)
  game.ticker = setInterval(async () => {
    if (game.winner) return clearTimers(game);
    const remaining = game.deadline - Date.now();

    // ping à T-15s
    if (!game.warned15 && remaining <= 15000 && remaining > 0) {
      game.warned15 = true;
      const channel = await game.client.channels.fetch(game.channelId);
      const userId = game.players[game.turn];
      channel.send({ content: `⏳ <@${userId}> plus que **${fmt(remaining)}** pour jouer !` }).catch(() => {});
    }

    // rafraîchir l'affichage de temps
    await refreshCountdown(game);
    if (remaining <= 0) clearInterval(game.ticker);
  }, 5000);

  // timer d'expiration (forfait)
  game.timer = setTimeout(async () => {
    try {
      if (game.winner) return;
      game.winner = 'F';
      const embed = buildEmbed(game);
      const components = makeComponents(game);
      components.forEach(r => r.components.forEach(b => b.setDisabled(true)));
      await editBoardMessage(game, embed, components);
    } finally {
      unregisterGame(game.id);
      games.delete(game.id);
      clearTimers(game);
    }
  }, TURN_MS);
}

export default {
  customIdPrefix: PREFIX,
  data: new SlashCommandBuilder()
    .setName('morpion')
    .setDescription('Joue au morpion (Tic-Tac-Toe) contre un adversaire.')
    .addUserOption(o =>
      o.setName('adversaire')
        .setDescription("La personne à défier")
        .setRequired(true)
    )
    .setDMPermission(false),
  async execute(interaction) {
    const p1 = interaction.user;
    const p2 = interaction.options.getUser('adversaire', true);
    if (p2.bot) return interaction.reply({ content: "❌ Tu ne peux pas défier un bot.", ephemeral: true });
    if (p1.id === p2.id) return interaction.reply({ content: "❌ Tu ne peux pas te défier toi-même.", ephemeral: true });

    const game = newGame(p1, p2, interaction.client);
    const embed = buildEmbed(game);
    const msg = await interaction.reply({ embeds: [embed], components: makeComponents(game), fetchReply: true });
    game.channelId = msg.channelId;
    game.messageId = msg.id;

    // enregistrement pour /stop
    registerGame({
      id: game.id,
      type: 'morpion',
      channelId: game.channelId,
      messageId: game.messageId,
      players: game.players,
      stop: async (_ctx, meta = {}) => {
        if (game.winner) return;
        game.winner = 'S';
        const stopped = buildEmbed(game);
        const components = makeComponents(game);
        components.forEach(r => r.components.forEach(b => b.setDisabled(true)));
        await editBoardMessage(game, stopped, components);
        unregisterGame(game.id);
        games.delete(game.id);
        clearTimers(game);
      },
    });

    await armTurnTimer(game);
  },

  async handleButton(interaction, parts) {
    const [gameId, rStr, cStr] = parts;
    const game = games.get(gameId);
    if (!game) return interaction.reply({ content: '⚠️ Partie introuvable ou expirée.', ephemeral: true });

    const playerId = interaction.user.id;
    if (!game.players.includes(playerId)) {
      return interaction.reply({ content: "❌ Tu ne participes pas à cette partie.", ephemeral: true });
    }
    if (game.winner) {
      return interaction.reply({ content: "ℹ️ La partie est déjà terminée.", ephemeral: true });
    }
    const currentPlayerId = game.players[game.turn];
    if (playerId !== currentPlayerId) {
      return interaction.reply({ content: "⏳ Ce n'est pas ton tour.", ephemeral: true });
    }

    const r = Number(rStr), c = Number(cStr);
    if (game.board[r][c] !== 'E') {
      return interaction.reply({ content: "❌ Case déjà jouée.", ephemeral: true });
    }

    // jouer
    const mark = game.turn === 0 ? 'X' : 'O';
    game.board[r][c] = mark;
    game.moves++;

    const w = checkWinner(game.board);
    if (w) {
      game.winner = w;
    } else if (game.moves >= 9) {
      game.winner = 'D';
    } else {
      game.turn = 1 - game.turn;
    }

    const embed = buildEmbed(game);
    const components = makeComponents(game);

    if (game.winner) {
      components.forEach(rw => rw.components.forEach(b => b.setDisabled(true)));
      unregisterGame(game.id);
      games.delete(game.id);
      clearTimers(game);
    } else {
      await armTurnTimer(game); // relance timer + ticker pour le nouveau joueur
    }

    try {
      await interaction.update({ embeds: [embed], components });
    } catch {
      await interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
  },
};

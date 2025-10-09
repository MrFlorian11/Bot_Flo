// src/commands/puissance4.js
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { registerGame, unregisterGame } from '../gameHub.js';

const games = new Map();
const PREFIX = 'c4';
const ROWS = 6, COLS = 7;
const EMPT = '⚪', P1 = '🔴', P2 = '🟡';
const TURN_MS = Number(process.env.TURN_TIMEOUT_MS || 120000);

// utils
const fmt = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
};

function newBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(0)); }

function newGame(p1, p2, client) {
  const gameId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const state = {
    id: gameId,
    client,
    players: [p1.id, p2.id], // 1 = p1 (rouge), 2 = p2 (jaune)
    names: [p1.username, p2.username],
    turn: 1, // 1 ou 2
    board: newBoard(),
    winner: 0, // 0 en cours, 1/2 gagnant, 3 égalité, 4 stoppée, 5 forfait
    moves: 0,
    messageId: null,
    channelId: null,
    timer: null,
    ticker: null,     // interval pour le compte à rebours
    deadline: 0,      // timestamp ms
    warned15: false,
    createdAt: Date.now(),
  };
  games.set(gameId, state);
  return state;
}

function dropPiece(board, col, player) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) { board[r][col] = player; return r; }
  }
  return -1;
}
const inside = (r,c) => r>=0 && r<ROWS && c>=0 && c<COLS;

function checkWin(board, r, c) {
  const player = board[r][c];
  if (!player) return false;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr,dc] of dirs) {
    let count = 1;
    for (const sign of [-1,1]) {
      let nr=r+dr*sign, nc=c+dc*sign;
      while (inside(nr,nc) && board[nr][nc]===player) { count++; nr+=dr*sign; nc+=dc*sign; }
    }
    if (count>=4) return true;
  }
  return false;
}
const fullBoard = board => board[0].every(v => v!==0);
const boardToText = board => board.map(row => row.map(v => v===0?EMPT:(v===1?P1:P2)).join('')).join('\n');

function makeControls(game) {
  // 7 boutons répartis sur 2 lignes max 5 par ligne
  const buttons = [];
  for (let c = 0; c < COLS; c++) {
    const colFull = game.board[0][c] !== 0 || game.winner !== 0;
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:${game.id}:${c}`)
        .setLabel(String(c + 1))
        .setStyle(ButtonStyle.Primary)
        .setDisabled(colFull)
    );
  }
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
  }
  return rows;
}

async function editBoardMessage(game, embed, components) {
  const channel = await game.client.channels.fetch(game.channelId);
  const msg = await channel.messages.fetch(game.messageId);
  await msg.edit({ embeds: [embed], components });
}

function buildEmbed(game, title = '🟨 Puissance 4') {
  const now = Date.now();
  const remaining = game.winner ? 0 : Math.max(0, game.deadline - now);
  let desc = boardToText(game.board);

  if (game.winner === 1 || game.winner === 2) {
    title += ' — ✅ Victoire';
    desc += `\n\n🏆 **${game.names[game.winner - 1]}** a gagné !`;
  } else if (game.winner === 3) {
    title += ' — 🤝 Égalité';
    desc += `\n\nAucun gagnant cette fois.`;
  } else if (game.winner === 4) {
    title += ' — 🛑 Partie arrêtée';
  } else if (game.winner === 5) {
    title += ' — ⏱️ Temps écoulé';
    const loser = game.turn; // celui dont c'était le tour
    const winner = loser === 1 ? 2 : 1;
    desc += `\n\n⏰ **${game.names[loser - 1]}** a dépassé le temps.\n🏆 **${game.names[winner - 1]}** gagne par forfait.`;
  } else {
    desc += `\n\nTour de **${game.names[game.turn - 1]}** (${game.turn === 1 ? P1 : P2})`;
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
  const embed = buildEmbed(game);
  const components = makeControls(game);
  try {
    await editBoardMessage(game, embed, components);
  } catch {/* ignore */}
}

async function armTurnTimer(game) {
  clearTimers(game);
  game.warned15 = false;
  game.deadline = Date.now() + TURN_MS;

  // ticker d'affichage
  game.ticker = setInterval(async () => {
    if (game.winner !== 0) return clearTimers(game);
    const remaining = game.deadline - Date.now();

    // ping T–15s
    if (!game.warned15 && remaining <= 15000 && remaining > 0) {
      game.warned15 = true;
      const channel = await game.client.channels.fetch(game.channelId);
      const userId = game.players[game.turn - 1];
      channel.send({ content: `⏳ <@${userId}> plus que **${fmt(remaining)}** pour jouer !` }).catch(() => {});
    }

    await refreshCountdown(game);
    if (remaining <= 0) clearInterval(game.ticker);
  }, 5000);

  // timer d'expiration (forfait)
  game.timer = setTimeout(async () => {
    try {
      if (game.winner !== 0) return;
      game.winner = 5; // forfait
      const embed = buildEmbed(game);
      const components = makeControls(game);
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
    .setName('puissance4')
    .setDescription('Joue à Puissance 4 (Connect Four) contre un adversaire.')
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
    const msg = await interaction.reply({ embeds: [embed], components: makeControls(game), fetchReply: true });
    game.channelId = msg.channelId;
    game.messageId = msg.id;

    // enregistrement pour /stop
    registerGame({
      id: game.id,
      type: 'puissance4',
      channelId: game.channelId,
      messageId: game.messageId,
      players: game.players,
      stop: async (_ctx, meta = {}) => {
        if (game.winner !== 0) return;
        game.winner = 4; // stoppée
        const stopped = buildEmbed(game);
        const components = makeControls(game);
        components.forEach(row => row.components.forEach(b => b.setDisabled(true)));
        await editBoardMessage(game, stopped, components);
        unregisterGame(game.id);
        games.delete(game.id);
        clearTimers(game);
      },
    });

    await armTurnTimer(game);
  },

  async handleButton(interaction, parts) {
    const [gameId, colStr] = parts;
    const game = games.get(gameId);
    if (!game) return interaction.reply({ content: '⚠️ Partie introuvable ou expirée.', ephemeral: true });

    const userId = interaction.user.id;
    if (!game.players.includes(userId)) {
      return interaction.reply({ content: "❌ Tu ne participes pas à cette partie.", ephemeral: true });
    }
    if (game.winner !== 0) {
      return interaction.reply({ content: "ℹ️ La partie est déjà terminée.", ephemeral: true });
    }
    const currentId = game.players[game.turn - 1];
    if (userId !== currentId) {
      return interaction.reply({ content: "⏳ Ce n'est pas ton tour.", ephemeral: true });
    }

    const col = Number(colStr);
    const row = dropPiece(game.board, col, game.turn);
    if (row === -1) {
      return interaction.reply({ content: "❌ Colonne pleine.", ephemeral: true });
    }
    game.moves++;

    if (checkWin(game.board, row, col)) {
      game.winner = game.turn;
    } else if (fullBoard(game.board)) {
      game.winner = 3;
    } else {
      game.turn = game.turn === 1 ? 2 : 1;
    }

    const embed = buildEmbed(game);
    const components = makeControls(game);

    if (game.winner !== 0) {
      components.forEach(r => r.components.forEach(b => b.setDisabled(true)));
      unregisterGame(game.id);
      games.delete(game.id);
      clearTimers(game);
    } else {
      await armTurnTimer(game); // relance pour le nouveau joueur
    }

    try {
      await interaction.update({ embeds: [embed], components });
    } catch {
      await interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
  },
};

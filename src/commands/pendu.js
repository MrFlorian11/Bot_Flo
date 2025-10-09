import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { registerGame, unregisterGame } from '../gameHub.js';

// --- État en mémoire
const games = new Map(); // gameId -> state
const PREFIX = 'pendu';
const MAX_ERRORS = 6;
const TURN_MS = Number(process.env.TURN_TIMEOUT_MS || 120000); // 2min

// Banque de mots (sans accents)
const WORDS = [
  'ordinateur','javascript','discord','fromage','banane','chocolat','voiture','montagne','ocean',
  'football','pyramide','licorne','astronaute','halloween','dragon','pirate','galaxie','soleil',
  'loutre','panda','biscotte','aventure','mystere','puzzle','grenouille','citrouille','mangue',
  'plage','vaisseau','robot'
];

// --- Utils
const abcA = 'ABCDEFGHIJKLM';
const abcB = 'NOPQRSTUVWXYZ';
const toClean = (s) => s.toLowerCase(); // banque déjà sans accents
const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const r = String(s % 60).padStart(2, '0');
  return `${m}:${r}`;
};
const maskWord = (w, guessed) =>
  w.split('').map(ch => (guessed.has(ch) ? ch : '﹏')).join(' '); // souligné fin

function randomWord() {
  const raw = WORDS[Math.floor(Math.random() * WORDS.length)];
  return toClean(raw);
}

// --- Création d'une partie
function newGame(starter, client) {
  const gameId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const word = randomWord();
  const state = {
    id: gameId,
    client,
    playerId: starter.id,
    playerName: starter.username,
    word,
    guessed: new Set(),      // lettres correctes (minuscule)
    wrong: new Set(),        // lettres fausses (minuscule)
    page: 0,                 // 0 = A-M ; 1 = N-Z
    messageId: null,
    channelId: null,
    winner: 0,               // 0 en cours ; 1 gagné ; 2 perdu ; 3 stoppé ; 4 forfait (timer)
    timer: null,
    ticker: null,
    deadline: 0,
    warned15: false,
    createdAt: Date.now(),
  };
  games.set(gameId, state);
  return state;
}

// --- UI
function letterButtonsForPage(game, page) {
  const letters = page === 0 ? abcA : abcB; // labels en A–Z
  const btns = [];
  for (const L of letters) {
    const l = L.toLowerCase();
    const used = game.guessed.has(l) || game.wrong.has(l) || game.winner !== 0;
    btns.push(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:${game.id}:pick:${L}`)
        .setLabel(L)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!!used)
    );
  }
  // 13 lettres -> 3 lignes: 5 / 5 / 3
  const rows = [];
  let i = 0;
  while (i < btns.length) {
    rows.push(new ActionRowBuilder().addComponents(...btns.slice(i, i + 5)));
    i += 5;
  }
  return rows;
}

function pageSwitcher(game) {
  const prev = new ButtonBuilder()
    .setCustomId(`${PREFIX}:${game.id}:page:0`)
    .setLabel('A–M')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(game.page === 0 || game.winner !== 0);
  const next = new ButtonBuilder()
    .setCustomId(`${PREFIX}:${game.id}:page:1`)
    .setLabel('N–Z')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(game.page === 1 || game.winner !== 0);
  return new ActionRowBuilder().addComponents(prev, next);
}

function makeComponents(game) {
  const rows = letterButtonsForPage(game, game.page);
  rows.push(pageSwitcher(game)); // 4e rangée
  return rows;
}

function hangmanStage(errors) {
  // 0..6 — simple indicateur
  const bars = '🟥'.repeat(errors) + '⬛'.repeat(MAX_ERRORS - errors);
  return `Erreurs: ${bars} (${errors}/${MAX_ERRORS})`;
}

function buildEmbed(game, title = '🪢 Pendu') {
  const now = Date.now();
  const remaining = game.winner ? 0 : Math.max(0, game.deadline - now);

  const wordMasked = maskWord(game.word, game.guessed);
  const wrongList = [...game.wrong].map(x => x.toUpperCase()).join(' ');
  const errors = game.wrong.size;

  let desc = `**Mot :** ${wordMasked}\n${hangmanStage(errors)}\n`;
  if (wrongList) desc += `\n**Lettres fausses :** ${wrongList}\n`;

  if (game.winner === 1) {
    title += ' — ✅ Gagné';
    desc += `\n🏆 Bravo **${game.playerName}** !`;
  } else if (game.winner === 2) {
    title += ' — ❌ Perdu';
    desc += `\nLe mot était **${game.word}**.`;
  } else if (game.winner === 3) {
    title += ' — 🛑 Partie arrêtée';
  } else if (game.winner === 4) {
    title += ' — ⏱️ Temps écoulé (forfait)';
    desc += `\nLe mot était **${game.word}**.`;
  } else {
    desc += `\n**Tour de :** <@${game.playerId}>\n⏱️ Temps restant : **${fmt(remaining)}**`;
  }

  return new EmbedBuilder().setTitle(title).setDescription(desc).setTimestamp();
}

async function editBoardMessage(game, embed, components) {
  const channel = await game.client.channels.fetch(game.channelId);
  const msg = await channel.messages.fetch(game.messageId);
  await msg.edit({ embeds: [embed], components });
}

function clearTimers(game) {
  clearTimeout(game.timer);
  clearInterval(game.ticker);
  game.timer = null;
  game.ticker = null;
}

async function refreshCountdown(game) {
  const embed = buildEmbed(game);
  const components = makeComponents(game);
  try { await editBoardMessage(game, embed, components); } catch {}
}

async function armTurnTimer(game) {
  clearTimers(game);
  game.warned15 = false;
  game.deadline = Date.now() + TURN_MS;

  // Ticker d'affichage
  game.ticker = setInterval(async () => {
    if (game.winner) return clearTimers(game);
    const remaining = game.deadline - Date.now();

    // Ping à T–15s
    if (!game.warned15 && remaining <= 15000 && remaining > 0) {
      game.warned15 = true;
      const channel = await game.client.channels.fetch(game.channelId);
      channel.send({ content: `⏳ <@${game.playerId}> plus que **${fmt(remaining)}** pour choisir une lettre !` }).catch(() => {});
    }

    await refreshCountdown(game);
    if (remaining <= 0) clearInterval(game.ticker);
  }, 5000);

  // Timer d'expiration ⇒ forfait
  game.timer = setTimeout(async () => {
    try {
      if (game.winner) return;
      game.winner = 4; // forfait
      const embed = buildEmbed(game);
      const cmp = makeComponents(game);
      cmp.forEach(r => r.components.forEach(b => b.setDisabled(true)));
      await editBoardMessage(game, embed, cmp);
    } finally {
      unregisterGame(game.id);
      games.delete(game.id);
      clearTimers(game);
    }
  }, TURN_MS);
}

// --- Commande + handlers
export default {
  customIdPrefix: PREFIX,
  data: new SlashCommandBuilder()
    .setName('pendu')
    .setDescription('Joue au pendu (6 erreurs max).')
    .setDMPermission(false),
  async execute(interaction) {
    const starter = interaction.user;
    const game = newGame(starter, interaction.client);

    const embed = buildEmbed(game);
    const msg = await interaction.reply({
      embeds: [embed],
      components: makeComponents(game),
      fetchReply: true,
    });

    game.channelId = msg.channelId;
    game.messageId = msg.id;

    // enregistrer pour /stop
    registerGame({
      id: game.id,
      type: 'pendu',
      channelId: game.channelId,
      messageId: game.messageId,
      players: [game.playerId],
      stop: async (_ctx, meta = {}) => {
        if (game.winner) return;
        game.winner = 3; // stoppé
        const stopped = buildEmbed(game);
        const cmp = makeComponents(game);
        cmp.forEach(r => r.components.forEach(b => b.setDisabled(true)));
        await editBoardMessage(game, stopped, cmp);
        unregisterGame(game.id);
        games.delete(game.id);
        clearTimers(game);
      },
    });

    await armTurnTimer(game);
  },

  async handleButton(interaction, parts) {
    const [gameId, kind, payload] = parts;
    const game = games.get(gameId);
    if (!game) return interaction.reply({ content: '⚠️ Partie introuvable ou expirée.', ephemeral: true });

    // Seul le créateur joue
    if (interaction.user.id !== game.playerId) {
      return interaction.reply({ content: "❌ Tu n'es pas le joueur de cette partie.", ephemeral: true });
    }
    if (game.winner) {
      return interaction.reply({ content: "ℹ️ La partie est déjà terminée.", ephemeral: true });
    }

    // Changement de page
    if (kind === 'page') {
      const newPage = Number(payload);
      if (newPage !== 0 && newPage !== 1) {
        return interaction.reply({ content: 'Page invalide.', ephemeral: true });
      }
      game.page = newPage;
      const embed = buildEmbed(game);
      const cmp = makeComponents(game);
      try {
        await interaction.update({ embeds: [embed], components: cmp });
      } catch {
        await interaction.reply({ embeds: [embed], components: cmp, ephemeral: true });
      }
      return;
    }

    // Sélection de lettre
    if (kind === 'pick') {
      const L = payload;
      const l = L.toLowerCase();

      if (game.guessed.has(l) || game.wrong.has(l)) {
        return interaction.reply({ content: 'Lettre déjà utilisée.', ephemeral: true });
      }

      if (game.word.includes(l)) {
        game.guessed.add(l);
      } else {
        game.wrong.add(l);
      }

      // Victoire ?
      const allLetters = new Set(game.word.split(''));
      const allFound = [...allLetters].every(ch => game.guessed.has(ch));
      if (allFound) {
        game.winner = 1;
      } else if (game.wrong.size >= MAX_ERRORS) {
        game.winner = 2;
      } else {
        // relance le chrono pour le prochain choix
        await armTurnTimer(game);
      }

      const embed = buildEmbed(game);
      const cmp = makeComponents(game);

      if (game.winner) {
        cmp.forEach(r => r.components.forEach(b => b.setDisabled(true)));
        unregisterGame(game.id);
        games.delete(game.id);
        clearTimers(game);
      }

      try {
        await interaction.update({ embeds: [embed], components: cmp });
      } catch {
        await interaction.reply({ embeds: [embed], components: cmp, ephemeral: true });
      }
      return;
    }

    return interaction.reply({ content: 'Interaction inconnue.', ephemeral: true });
  },
};

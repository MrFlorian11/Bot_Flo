// src/commands/pendu_defi_modal.js
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { registerGame, unregisterGame } from '../gameHub.js';

// état en mémoire
const games = new Map();      // gameId -> state
const sessions = new Map();   // tempId -> { channelId, setterId, setterName, guesserId, guesserName }

const PREFIX = 'pendumodalbtn';   // prefix pour boutons
const MPREFIX = 'pendumodal';     // prefix pour modal submit
const MAX_ERRORS = 6;
const TURN_MS = Number(process.env.TURN_TIMEOUT_MS || 120000);

// utils
const abcA = 'ABCDEFGHIJKLM';
const abcB = 'NOPQRSTUVWXYZ';
const deburr = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const onlyLetters = (s) => /^[a-z]+$/.test(s);
const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const r = String(s % 60).padStart(2, '0');
  return `${m}:${r}`;
};
const maskWord = (w, guessed) => w.split('').map(ch => (guessed.has(ch) ? ch : '﹏')).join(' ');

// création partie
function newGame(setter, guesser, word, client) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const st = {
    id,
    client,
    setterId: setter.id,
    setterName: setter.username,
    guesserId: guesser.id,
    guesserName: guesser.username,
    word,                 // minuscule sans accents
    guessed: new Set(),
    wrong: new Set(),
    page: 0,
    messageId: null,
    channelId: null,
    winner: 0,            // 0 en cours ; 1 gagné ; 2 perdu ; 3 stoppé ; 4 forfait
    timer: null,
    ticker: null,
    deadline: 0,
    warned15: false,
    createdAt: Date.now(),
  };
  games.set(id, st);
  return st;
}

// UI
function letterRows(game, page) {
  const letters = page === 0 ? abcA : abcB;
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
  const rows = [];
  for (let i = 0; i < btns.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...btns.slice(i, i + 5)));
  }
  return rows; // 13 lettres => 3 lignes
}
function switchRow(game) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:${game.id}:page:0`)
      .setLabel('A–M').setStyle(ButtonStyle.Primary)
      .setDisabled(game.page === 0 || game.winner !== 0),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:${game.id}:page:1`)
      .setLabel('N–Z').setStyle(ButtonStyle.Primary)
      .setDisabled(game.page === 1 || game.winner !== 0),
  );
}
function makeComponents(game) {
  const rows = letterRows(game, game.page);
  rows.push(switchRow(game));
  return rows;
}
function hangmanBar(n) {
  return `Erreurs: ${'🟥'.repeat(n)}${'⬛'.repeat(MAX_ERRORS - n)} (${n}/${MAX_ERRORS})`;
}
function buildEmbed(game, title = '🪢 Pendu — Défi (Modal)') {
  const now = Date.now();
  const remaining = game.winner ? 0 : Math.max(0, game.deadline - now);
  const masked = maskWord(game.word, game.guessed);
  const wrongList = [...game.wrong].map(x => x.toUpperCase()).join(' ');
  const errors = game.wrong.size;

  let desc = `**Mot :** ${masked}\n${hangmanBar(errors)}\n`;
  if (wrongList) desc += `\n**Lettres fausses :** ${wrongList}\n`;

  if (game.winner === 1) {
    title += ' — ✅ Gagné';
    desc += `\n🏆 **${game.guesserName}** a trouvé le mot !`;
  } else if (game.winner === 2) {
    title += ' — ❌ Perdu';
    desc += `\nLe mot était **${game.word}** (choisi par **${game.setterName}**).`;
  } else if (game.winner === 3) {
    title += ' — 🛑 Partie arrêtée';
  } else if (game.winner === 4) {
    title += ' — ⏱️ Temps écoulé (forfait)';
    desc += `\nLe mot était **${game.word}**.`;
  } else {
    desc += `\n**Devineur :** <@${game.guesserId}>  •  **Mot choisi par :** ${game.setterName}`;
    desc += `\n⏱️ Temps restant : **${fmt(remaining)}**`;
  }

  return new EmbedBuilder().setTitle(title).setDescription(desc).setTimestamp();
}
async function editBoard(game, embed, components) {
  const ch = await game.client.channels.fetch(game.channelId);
  const msg = await ch.messages.fetch(game.messageId);
  await msg.edit({ embeds: [embed], components });
}

// timers
function clearTimers(game) {
  clearTimeout(game.timer);
  clearInterval(game.ticker);
  game.timer = null;
  game.ticker = null;
}
async function refreshCountdown(game) {
  try { await editBoard(game, buildEmbed(game), makeComponents(game)); } catch {}
}
async function armTurnTimer(game) {
  clearTimers(game);
  game.warned15 = false;
  game.deadline = Date.now() + TURN_MS;

  game.ticker = setInterval(async () => {
    if (game.winner) return clearTimers(game);
    const remaining = game.deadline - Date.now();
    if (!game.warned15 && remaining <= 15000 && remaining > 0) {
      game.warned15 = true;
      const ch = await game.client.channels.fetch(game.channelId);
      ch.send({ content: `⏳ <@${game.guesserId}> plus que **${fmt(remaining)}** pour choisir une lettre !` }).catch(() => {});
    }
    await refreshCountdown(game);
    if (remaining <= 0) clearInterval(game.ticker);
  }, 5000);

  game.timer = setTimeout(async () => {
    try {
      if (game.winner) return;
      game.winner = 4;
      const cmp = makeComponents(game);
      cmp.forEach(r => r.components.forEach(b => b.setDisabled(true)));
      await editBoard(game, buildEmbed(game), cmp);
    } finally {
      unregisterGame(game.id);
      games.delete(game.id);
      clearTimers(game);
    }
  }, TURN_MS);
}

export default {
  customIdPrefix: PREFIX, // pour boutons
  modalPrefix: MPREFIX,   // pour submit modal
  data: new SlashCommandBuilder()
    .setName('pendu_defi_modal')
    .setDescription('Défie quelqu’un au pendu : le mot est saisi dans une pop-up.')
    .addUserOption(o =>
      o.setName('adversaire')
        .setDescription("La personne qui devra deviner")
        .setRequired(true)
    )
    .setDMPermission(false),

  // 1) Slash: ouvrir le modal
  async execute(interaction) {
    const setter = interaction.user;
    const guesser = interaction.options.getUser('adversaire', true);
    if (guesser.bot) return interaction.reply({ content: "❌ Tu ne peux pas défier un bot.", ephemeral: true });
    if (guesser.id === setter.id) return interaction.reply({ content: "❌ Tu ne peux pas te défier toi-même.", ephemeral: true });

    // session temporaire pour récupérer le contexte au submit
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    sessions.set(tempId, {
      channelId: interaction.channelId,
      setterId: setter.id,
      setterName: setter.username,
      guesserId: guesser.id,
      guesserName: guesser.username,
    });
    // auto-clean au bout de 5 minutes
    setTimeout(() => sessions.delete(tempId), 5 * 60 * 1000);

    const modal = new ModalBuilder()
      .setCustomId(`${MPREFIX}:${tempId}`)
      .setTitle('Pendu — Mot secret');

    const input = new TextInputBuilder()
      .setCustomId('word')
      .setLabel('Mot secret (lettres, 3–20, accents autorisés)')
      .setRequired(true)
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(20);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  },

  // 2) Submit du modal: créer la partie
  async handleModal(interaction, parts) {
    const [tempId] = parts;
    const sess = sessions.get(tempId);
    if (!sess) return interaction.reply({ content: "Session expirée. Relance la commande.", ephemeral: true });

    const raw = interaction.fields.getTextInputValue('word')?.trim() ?? '';
    const cleaned = deburr(raw).replace(/\s+/g, '');
    if (!onlyLetters(cleaned) || cleaned.length < 3 || cleaned.length > 20) {
      return interaction.reply({ content: "❌ Mot invalide. Utilise uniquement des lettres (sans accents une fois normalisé), 3–20 caractères.", ephemeral: true });
    }

    // construirent des users factices minimalistes (id/username) pour newGame
    const setter = { id: sess.setterId, username: sess.setterName };
    const guesser = { id: sess.guesserId, username: sess.guesserName };

    const game = newGame(setter, guesser, cleaned, interaction.client);

    // on répond dans le salon d'origine
    const embed = buildEmbed(game);
    const msg = await interaction.reply({
      content: `🔒 Un mot a été choisi par **${setter.username}**. **${guesser.username}** doit le deviner !`,
      embeds: [embed],
      components: makeComponents(game),
      allowedMentions: { users: [guesser.id] },
      ephemeral: false,
    });

    game.channelId = msg.channelId;
    game.messageId = msg.id;

    // enregistrement pour /stop
    registerGame({
      id: game.id,
      type: 'pendu_defi_modal',
      channelId: game.channelId,
      messageId: game.messageId,
      players: [game.guesserId, game.setterId],
      stop: async () => {
        if (game.winner) return;
        game.winner = 3; // stoppée
        const cmp = makeComponents(game);
        cmp.forEach(r => r.components.forEach(b => b.setDisabled(true)));
        await editBoard(game, buildEmbed(game), cmp);
        unregisterGame(game.id);
        games.delete(game.id);
        clearTimers(game);
      },
    });

    await armTurnTimer(game);
    sessions.delete(tempId);
  },

  // 3) Boutons (jeu)
  async handleButton(interaction, parts) {
    const [gameId, kind, payload] = parts;
    const game = games.get(gameId);
    if (!game) return interaction.reply({ content: '⚠️ Partie introuvable ou expirée.', ephemeral: true });

    // seul le devineur joue
    if (interaction.user.id !== game.guesserId) {
      return interaction.reply({ content: "❌ Seul l'adversaire défié peut jouer.", ephemeral: true });
    }
    if (game.winner) {
      return interaction.reply({ content: "ℹ️ La partie est déjà terminée.", ephemeral: true });
    }

    if (kind === 'page') {
      const p = Number(payload);
      if (p !== 0 && p !== 1) return interaction.reply({ content: 'Page invalide.', ephemeral: true });
      game.page = p;
      try {
        await interaction.update({ embeds: [buildEmbed(game)], components: makeComponents(game) });
      } catch {
        await interaction.reply({ embeds: [buildEmbed(game)], components: makeComponents(game), ephemeral: true });
      }
      return;
    }

    if (kind === 'pick') {
      const L = payload;
      const l = L.toLowerCase();
      if (game.guessed.has(l) || game.wrong.has(l)) {
        return interaction.reply({ content: 'Lettre déjà utilisée.', ephemeral: true });
      }

      if (game.word.includes(l)) game.guessed.add(l);
      else game.wrong.add(l);

      const allLetters = new Set(game.word.split(''));
      const win = [...allLetters].every(ch => game.guessed.has(ch));

      if (win) {
        game.winner = 1;
      } else if (game.wrong.size >= MAX_ERRORS) {
        game.winner = 2;
      } else {
        await armTurnTimer(game);
      }

      const cmp = makeComponents(game);
      if (game.winner) {
        cmp.forEach(r => r.components.forEach(b => b.setDisabled(true)));
        unregisterGame(game.id);
        games.delete(game.id);
        clearTimers(game);
      }

      try {
        await interaction.update({ embeds: [buildEmbed(game)], components: cmp });
      } catch {
        await interaction.reply({ embeds: [buildEmbed(game)], components: cmp, ephemeral: true });
      }
      return;
    }

    return interaction.reply({ content: 'Interaction inconnue.', ephemeral: true });
  },
};

// src/commands/evenement.js
import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} from 'discord.js';

const PREFIX = 'event';
const MPREFIX = 'eventmodal';

// Sessions: tempId -> { channelId, requesterId, eventKey?, draft? }
const sessions = new Map();

// --- Évènements ---
const EVENTS = {
  amongus:    { label: 'Among US',       emoji: '🧑‍🚀' },
  dnd:        { label: 'Dale & Dawnson', emoji: '🕵️' },
  microworks: { label: 'MicroWorks',     emoji: '🧪' },
  valorant:   { label: 'Valorant',       emoji: '🎯' },
};

// --- UI Builders ---
function makeSelectMenu(tempId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:${tempId}:choose`)
    .setPlaceholder('Choisis un évènement...')
    .addOptions(Object.entries(EVENTS).map(([key, ev]) => ({
      label: ev.label,
      value: key,
      emoji: ev.emoji,
    })));

  return [new ActionRowBuilder().addComponents(select)];
}

function buildModal(tempId, eventKey, draft = {}) {
  const meta = EVENTS[eventKey];
  const defTitle = draft.title ?? meta?.label ?? 'Évènement';
  const defDate  = draft.dateInput ?? ''; // ex: 31/10/2025
  const defHour  = draft.hourInput ?? ''; // ex: 21:00
  const defImg   = draft.imageUrl ?? '';

  const modal = new ModalBuilder()
    .setCustomId(`${MPREFIX}:${tempId}:${eventKey}`)
    .setTitle('Créer un évènement');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel("Titre de l'évènement")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setValue(defTitle);

  const dateInput = new TextInputBuilder()
    .setCustomId('date')
    .setLabel('Date (ex: 31/10/2025)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('JJ/MM/AAAA')
    .setValue(defDate);

  const hourInput = new TextInputBuilder()
    .setCustomId('hour')
    .setLabel('Heure (ex: 21:00)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('HH:mm')
    .setValue(defHour);

  const imgInput = new TextInputBuilder()
    .setCustomId('image')
    .setLabel('Image (URL, optionnel)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('https://exemple.com/image.png')
    .setValue(defImg);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(dateInput),
    new ActionRowBuilder().addComponents(hourInput),
    new ActionRowBuilder().addComponents(imgInput),
  );

  return modal;
}

function makePreviewButtons(tempId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}:${tempId}:publish:selected`).setLabel('📣 Publier dans le salon choisi').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${PREFIX}:${tempId}:publish:here`).setLabel('📝 Publier ici').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}:${tempId}:edit`).setLabel('✏️ Modifier').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${PREFIX}:${tempId}:cancel`).setLabel('🗑️ Annuler').setStyle(ButtonStyle.Danger),
    ),
  ];
}

// --- Parse date & heure séparées ---
function parseDateTime(dateStr, timeStr) {
  const [d, m, y] = dateStr.split(/[\/\-]/).map(x => parseInt(x));
  const [hh, mm] = timeStr.split(':').map(x => parseInt(x));
  if (!d || !m || !hh || isNaN(hh) || isNaN(mm)) return null;

  const year = y || new Date().getFullYear();
  const dt = new Date(year, m - 1, d, hh, mm);
  return isNaN(dt.getTime()) ? null : dt;
}

function isValidHttpUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function makeEventEmbed({ eventKey, title, dateTs, dateInput, hourInput, imageUrl, creator }) {
  const meta = EVENTS[eventKey] ?? { label: 'Évènement', emoji: '📅' };
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`${meta.emoji} ${title}`)
    .addFields(
      { name: '🗓️ Évènement', value: `**${meta.label}**`, inline: true },
      { name: '📅 Date & heure', value: dateTs ? `**<t:${dateTs}:F>**\n< t:${dateTs}:R >`.replace(' ', '') : `**${dateInput} ${hourInput}**`, inline: true },
    )
    .setFooter({ text: `Créé par ${creator.tag}` })
    .setTimestamp();

  if (imageUrl && isValidHttpUrl(imageUrl)) embed.setImage(imageUrl);
  return embed;
}

// ========== COMMANDE ==========
export default {
  customIdPrefix: PREFIX,
  modalPrefix: MPREFIX,

  data: new SlashCommandBuilder()
    .setName('evenement')
    .setDescription('Créer un évènement avec prévisualisation et publication.')
    .addChannelOption(o =>
      o.setName('salon')
        .setDescription('Salon où publier par défaut')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .setDMPermission(false),

  // Slash → menu déroulant
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon', true);
    const me = interaction.guild.members.me;
    const canSend = channel?.permissionsFor?.(me)?.has?.(['ViewChannel', 'SendMessages', 'EmbedLinks']);
    if (!canSend)
      return interaction.reply({ content: "❌ Je n'ai pas la permission d’envoyer un message dans ce salon.", ephemeral: true });

    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessions.set(tempId, { channelId: channel.id, requesterId: interaction.user.id, draft: null });
    setTimeout(() => sessions.delete(tempId), 10 * 60 * 1000);

    await interaction.reply({ content: 'Choisis un évènement :', components: makeSelectMenu(tempId), ephemeral: true });
  },

  // Sélection → ouvre modal
  async handleButton(interaction, parts) {
    const [tempId, kind, eventKey] = parts;
    const sess = sessions.get(tempId);
    if (!sess) return interaction.reply({ content: 'Session expirée. Relance `/evenement`.', ephemeral: true });
    if (interaction.user.id !== sess.requesterId)
      return interaction.reply({ content: "Seul l'auteur de la commande peut continuer.", ephemeral: true });

    // Publication
    if (kind === 'publish') {
      if (!sess.draft || !sess.eventKey)
        return interaction.reply({ content: 'Aucun brouillon à publier.', ephemeral: true });

      const embed = makeEventEmbed({ ...sess.draft, eventKey: sess.eventKey, creator: interaction.user });
      const where = eventKey;
      try {
        if (where === 'selected') {
          const ch = await interaction.client.channels.fetch(sess.channelId);
          await ch.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
          await interaction.reply({ content: '✅ Évènement publié dans le salon choisi.', ephemeral: true });
        } else if (where === 'here') {
          await interaction.channel.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
          await interaction.reply({ content: '✅ Évènement publié ici.', ephemeral: true });
        }
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "❌ Impossible de publier (permissions ?).", ephemeral: true });
      } finally {
        sessions.delete(tempId);
      }
      return;
    }

    if (kind === 'edit') {
      if (!sess.eventKey) return interaction.reply({ content: 'Aucun évènement sélectionné.', ephemeral: true });
      const modal = buildModal(tempId, sess.eventKey, sess.draft ?? {});
      return interaction.showModal(modal);
    }

    if (kind === 'cancel') {
      sessions.delete(tempId);
      return interaction.update({ content: '❌ Évènement annulé.', components: [], ephemeral: true }).catch(() => {});
    }
  },

  // Menu sélection → ouvrir modal
  async handleSelect(interaction, parts) {
    const [tempId, action] = parts;
    const sess = sessions.get(tempId);
    if (!sess) return interaction.reply({ content: 'Session expirée.', ephemeral: true });
    if (interaction.user.id !== sess.requesterId)
      return interaction.reply({ content: "Seul l'auteur de la commande peut continuer.", ephemeral: true });

    const selected = interaction.values?.[0];
    if (!selected || !EVENTS[selected])
      return interaction.reply({ content: 'Évènement invalide.', ephemeral: true });

    sess.eventKey = selected;
    const modal = buildModal(tempId, selected, sess.draft ?? {});
    await interaction.showModal(modal);
  },

  // Modal → preview
  async handleModal(interaction, parts) {
    const [tempId, eventKey] = parts;
    const sess = sessions.get(tempId);
    if (!sess || interaction.user.id !== sess.requesterId)
      return interaction.reply({ content: 'Session expirée.', ephemeral: true });

    const title = interaction.fields.getTextInputValue('title')?.trim();
    const dateInput = interaction.fields.getTextInputValue('date')?.trim();
    const hourInput = interaction.fields.getTextInputValue('hour')?.trim();
    const imageUrl = interaction.fields.getTextInputValue('image')?.trim();

    const dateObj = parseDateTime(dateInput, hourInput);
    if (!dateObj)
      return interaction.reply({
        content: "❌ Format de date/heure invalide. (Ex: `31/10/2025 21:00`)",
        ephemeral: true,
      });

    const unix = Math.floor(dateObj.getTime() / 1000);

    sess.draft = { title, dateInput, hourInput, dateTs: unix, imageUrl };

    const embed = makeEventEmbed({ eventKey, title, dateTs: unix, dateInput, hourInput, imageUrl, creator: interaction.user });
    await interaction.reply({ content: 'Aperçu :', embeds: [embed], components: makePreviewButtons(tempId), ephemeral: true });
  },
};

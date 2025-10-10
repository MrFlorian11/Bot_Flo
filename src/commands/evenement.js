// src/commands/evenement.js
import {
  SlashCommandBuilder,
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

// Sessions temporaires: tempId -> { channelId, requesterId, eventKey? }
const sessions = new Map();

// Mapping des évènements
const EVENTS = {
  amongus:   { label: 'Among US',       emoji: '🧑‍🚀' },
  dnd:       { label: 'Dale & Dawnson', emoji: '🕵️' },    // ajuste l’intitulé si besoin
  microworks:{ label: 'MicroWorks',     emoji: '🧪' },
  valorant:  { label: 'Valorant',       emoji: '🎯' },
};

function makePicker(tempId) {
  // 4 boutons (≤5 par ligne)
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:${tempId}:choose:amongus`)
        .setLabel(`${EVENTS.amongus.emoji} ${EVENTS.amongus.label}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:${tempId}:choose:dnd`)
        .setLabel(`${EVENTS.dnd.emoji} ${EVENTS.dnd.label}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:${tempId}:choose:microworks`)
        .setLabel(`${EVENTS.microworks.emoji} ${EVENTS.microworks.label}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:${tempId}:choose:valorant`)
        .setLabel(`${EVENTS.valorant.emoji} ${EVENTS.valorant.label}`)
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildModal(tempId, eventKey) {
  const defTitle = EVENTS[eventKey]?.label ?? 'Évènement';
  const modal = new ModalBuilder()
    .setCustomId(`${MPREFIX}:${tempId}:${eventKey}`)
    .setTitle('Créer un évènement');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel("Titre de l'évènement")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setValue(defTitle); // pré-rempli

  const timeInput = new TextInputBuilder()
    .setCustomId('time')
    .setLabel("Heure (ex: 21:00)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20)
    .setPlaceholder('21:00');

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(timeInput),
  );
  return modal;
}

function makeEventEmbed({ eventKey, title, time, creator }) {
  const meta = EVENTS[eventKey] ?? { label: 'Évènement', emoji: '📅' };
  const color = '#5865F2'; // violet Discord

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${meta.emoji} ${title}`)
    .addFields(
      { name: '🗓️ Évènement', value: `**${meta.label}**`, inline: true },
      { name: '⏰ Heure', value: `**${time}**`, inline: true },
    )
    .setFooter({ text: `Créé par ${creator.tag}` })
    .setTimestamp();

  return embed;
}

export default {
  customIdPrefix: PREFIX,
  modalPrefix: MPREFIX,

  data: new SlashCommandBuilder()
    .setName('evenement')
    .setDescription('Créer un évènement avec un embed prêt à poster.')
    .addChannelOption(o =>
      o.setName('salon')
        .setDescription('Salon où publier l’évènement')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .setDMPermission(false),

  // 1) Slash: afficher le “picker” (boutons) en éphémère
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon', true);
    // Vérif basique d’envoi
    const me = interaction.guild.members.me;
    const canSend = channel?.permissionsFor?.(me)?.has?.(['ViewChannel', 'SendMessages', 'EmbedLinks']);
    if (!canSend) {
      return interaction.reply({ content: "❌ Je n'ai pas la permission d’envoyer un message dans ce salon.", ephemeral: true });
    }

    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessions.set(tempId, {
      channelId: channel.id,
      requesterId: interaction.user.id,
    });
    // auto-clean
    setTimeout(() => sessions.delete(tempId), 10 * 60 * 1000);

    await interaction.reply({
      content: 'Sélectionne un évènement :',
      components: makePicker(tempId),
      ephemeral: true,
    });
  },

  // 2) Boutons: ouvrir le modal (titre + heure)
  async handleButton(interaction, parts) {
    const [tempId, kind, eventKey] = parts;
    const sess = sessions.get(tempId);
    if (!sess) {
      return interaction.reply({ content: 'Session expirée. Relance `/evenement`.', ephemeral: true });
    }
    if (kind !== 'choose' || !EVENTS[eventKey]) {
      return interaction.reply({ content: 'Sélection invalide.', ephemeral: true });
    }
    // Seul l’initiateur peut continuer
    if (interaction.user.id !== sess.requesterId) {
      return interaction.reply({ content: "Seul l'auteur de la commande peut choisir l’évènement.", ephemeral: true });
    }

    // on mémorise l'event choisi
    sess.eventKey = eventKey;

    // ouvrir le modal
    const modal = buildModal(tempId, eventKey);
    await interaction.showModal(modal);
  },

  // 3) Modal submit: créer & envoyer l’embed + @everyone
  async handleModal(interaction, parts) {
    const [tempId, eventKey] = parts;
    const sess = sessions.get(tempId);
    if (!sess || !EVENTS[eventKey]) {
      return interaction.reply({ content: 'Session expirée ou invalide.', ephemeral: true });
    }
    if (interaction.user.id !== sess.requesterId) {
      return interaction.reply({ content: "Seul l'auteur de la commande peut valider.", ephemeral: true });
    }

    const title = interaction.fields.getTextInputValue('title')?.trim() || EVENTS[eventKey].label;
    const time  = interaction.fields.getTextInputValue('time')?.trim() || 'À définir';

    // construire l’embed
    const embed = makeEventEmbed({
      eventKey,
      title,
      time,
      creator: interaction.user,
    });

    // envoyer dans le salon + mention everyone
    try {
      const ch = await interaction.client.channels.fetch(sess.channelId);
      await ch.send({
        content: '@everyone',
        embeds: [embed],
        allowedMentions: { parse: ['everyone'] },
      });
      await interaction.reply({ content: '✅ Évènement publié !', ephemeral: true });
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: "❌ Impossible d'envoyer l'évènement (permissions ?).", ephemeral: true });
    } finally {
      sessions.delete(tempId);
    }
  },
};

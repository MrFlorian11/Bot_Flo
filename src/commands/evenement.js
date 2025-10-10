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

const PREFIX = 'event';        // boutons
const MPREFIX = 'eventmodal';  // modals

// Sessions: tempId -> { channelId, requesterId, eventKey?, draft? }
const sessions = new Map();

// Catalogue
const EVENTS = {
  amongus:    { label: 'Among US',       emoji: '🧑‍🚀' },
  dnd:        { label: 'Dale & Dawnson', emoji: '🕵️' }, // ajuste le nom exact si besoin
  microworks: { label: 'MicroWorks',     emoji: '🧪' },
  valorant:   { label: 'Valorant',       emoji: '🎯' },
};

// ---- UI builders ----
function makePicker(tempId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}:${tempId}:choose:amongus`).setLabel(`${EVENTS.amongus.emoji} ${EVENTS.amongus.label}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PREFIX}:${tempId}:choose:dnd`).setLabel(`${EVENTS.dnd.emoji} ${EVENTS.dnd.label}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PREFIX}:${tempId}:choose:microworks`).setLabel(`${EVENTS.microworks.emoji} ${EVENTS.microworks.label}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PREFIX}:${tempId}:choose:valorant`).setLabel(`${EVENTS.valorant.emoji} ${EVENTS.valorant.label}`).setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildModal(tempId, eventKey, draft = {}) {
  const meta = EVENTS[eventKey];
  const defTitle = draft.title ?? meta?.label ?? 'Évènement';
  const defDate  = draft.dateInput ?? ''; // ex: 31/10/2025 21:00
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
    .setLabel("Date & heure (ex: 31/10/2025 21:00)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('JJ/MM[/AAAA] HH:mm ou AAAA-MM-JJ HH:mm')
    .setValue(defDate);

  const imgInput = new TextInputBuilder()
    .setCustomId('image')
    .setLabel("Image (URL, optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('https://exemple.com/image.png')
    .setValue(defImg);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(dateInput),
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

// ---- Date parsing ----
// Accepte : "DD/MM HH:mm" (année courante), "DD/MM/YYYY HH:mm", "YYYY-MM-DD HH:mm"
// Timezone: utilise le fuseau du serveur (ou définis TZ=Europe/Paris dans l’environnement)
function parseDateTime(input) {
  const s = input.trim();
  const now = new Date();

  // DD/MM HH:mm
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    let [_, d, mo, hh, mm] = m;
    const year = now.getFullYear();
    return new Date(year, parseInt(mo) - 1, parseInt(d), parseInt(hh), parseInt(mm));
  }

  // DD/MM/YYYY HH:mm
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    let [_, d, mo, y, hh, mm] = m;
    return new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(hh), parseInt(mm));
  }

  // YYYY-MM-DD HH:mm
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    let [_, y, mo, d, hh, mm] = m;
    return new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(hh), parseInt(mm));
  }

  return null;
}

function isValidHttpUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function makeEventEmbed({ eventKey, title, dateTs, dateInput, imageUrl, creator }) {
  const meta = EVENTS[eventKey] ?? { label: 'Évènement', emoji: '📅' };
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`${meta.emoji} ${title}`)
    .addFields(
      { name: '🗓️ Évènement', value: `**${meta.label}**`, inline: true },
      { name: '⏰ Quand', value: dateTs ? `**<t:${dateTs}:F>**\n< t:${dateTs}:R >`.replace(' ', '') : `**${dateInput}**`, inline: true },
    )
    .setFooter({ text: `Créé par ${creator.tag}` })
    .setTimestamp();

  if (imageUrl && isValidHttpUrl(imageUrl)) {
    embed.setImage(imageUrl);
  }
  return embed;
}

// ============== Commande ==============
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

  // 1) Slash → affiche les 4 boutons en éphémère
  async execute(interaction) {
    const channel = interaction.options.getChannel('salon', true);
    const me = interaction.guild.members.me;
    const canSend = channel?.permissionsFor?.(me)?.has?.(['ViewChannel', 'SendMessages', 'EmbedLinks']);
    if (!canSend) {
      return interaction.reply({ content: "❌ Je n'ai pas la permission d’envoyer un message dans ce salon.", ephemeral: true });
    }

    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessions.set(tempId, {
      channelId: channel.id,
      requesterId: interaction.user.id,
      draft: null,
    });
    setTimeout(() => sessions.delete(tempId), 10 * 60 * 1000);

    await interaction.reply({
      content: 'Choisis un évènement :',
      components: makePicker(tempId),
      ephemeral: true,
    });
  },

  // 2) Bouton évènement → ouvre modal
  async handleButton(interaction, parts) {
    const [tempId, kind, payload] = parts;
    const sess = sessions.get(tempId);
    if (!sess) return interaction.reply({ content: 'Session expirée. Relance `/evenement`.', ephemeral: true });
    if (interaction.user.id !== sess.requesterId) return interaction.reply({ content: "Seul l'auteur de la commande peut continuer.", ephemeral: true });

    // Choix évènement
    if (kind === 'choose') {
      const eventKey = payload;
      if (!EVENTS[eventKey]) return interaction.reply({ content: 'Sélection invalide.', ephemeral: true });
      sess.eventKey = eventKey;
      const modal = buildModal(tempId, eventKey, sess.draft ?? {});
      return interaction.showModal(modal);
    }

    // Publication depuis la preview
    if (kind === 'publish') {
      if (!sess.draft || !sess.eventKey) return interaction.reply({ content: 'Pas de brouillon à publier.', ephemeral: true });
      const where = payload; // 'selected' | 'here'
      const embed = makeEventEmbed({ ...sess.draft, eventKey: sess.eventKey, creator: interaction.user });

      try {
        if (where === 'selected') {
          const ch = await interaction.client.channels.fetch(sess.channelId);
          await ch.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
          await interaction.reply({ content: '✅ Évènement publié dans le salon choisi.', ephemeral: true });
        } else if (where === 'here') {
          // vérifier permissions ici
          const me = interaction.guild.members.me;
          const canSendHere = interaction.channel?.permissionsFor?.(me)?.has?.(['ViewChannel', 'SendMessages', 'EmbedLinks']);
          if (!canSendHere) {
            return interaction.reply({ content: "❌ Je ne peux pas publier ici (permissions manquantes).", ephemeral: true });
          }
          await interaction.channel.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
          await interaction.reply({ content: '✅ Évènement publié ici.', ephemeral: true });
        } else {
          return interaction.reply({ content: 'Action inconnue.', ephemeral: true });
        }
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: "❌ Impossible de publier (permissions ?).", ephemeral: true });
      } finally {
        sessions.delete(tempId);
      }
      return;
    }

    // Modifier (rouvrir le modal avec valeurs précédentes)
    if (kind === 'edit') {
      if (!sess.eventKey) return interaction.reply({ content: 'Aucun évènement sélectionné.', ephemeral: true });
      const modal = buildModal(tempId, sess.eventKey, sess.draft ?? {});
      return interaction.showModal(modal);
    }

    // Annuler
    if (kind === 'cancel') {
      sessions.delete(tempId);
      return interaction.update({ content: '❌ Évènement annulé.', components: [], ephemeral: true }).catch(() => {});
    }

    return interaction.reply({ content: 'Action inconnue.', ephemeral: true });
  },

  // 3) Modal submit → enregistrer brouillon et afficher la PREVIEW
  async handleModal(interaction, parts) {
    const [tempId, eventKey] = parts;
    const sess = sessions.get(tempId);
    if (!sess || interaction.user.id !== sess.requesterId) {
      return interaction.reply({ content: 'Session expirée ou invalide.', ephemeral: true });
    }
    if (!EVENTS[eventKey]) {
      return interaction.reply({ content: 'Évènement inconnu.', ephemeral: true });
    }

    // Récup champs
    const title = interaction.fields.getTextInputValue('title')?.trim() || EVENTS[eventKey].label;
    const dateInput = interaction.fields.getTextInputValue('date')?.trim() || '';
    const imageUrl = (interaction.fields.getTextInputValue('image')?.trim() || '');

    // Parse date
    const dateObj = parseDateTime(dateInput);
    if (!dateObj || isNaN(dateObj.getTime())) {
      // pas valide → message d’erreur + garder session
      return interaction.reply({
        content: "❌ Format de date invalide.\nFormats acceptés : `JJ/MM HH:mm`, `JJ/MM/AAAA HH:mm`, `AAAA-MM-JJ HH:mm`",
        ephemeral: true,
      });
    }
    const unix = Math.floor(dateObj.getTime() / 1000);

    // Enregistrer le brouillon
    sess.draft = { title, dateInput, dateTs: unix, imageUrl };

    // Construire preview
    const embed = makeEventEmbed({ eventKey, title, dateTs: unix, dateInput, imageUrl, creator: interaction.user });

    // Si on vient d’un modal, on ne peut pas *edit* immédiatement la réponse initiale → on reply éphémère
    await interaction.reply({
      content: 'Aperçu :',
      embeds: [embed],
      components: makePreviewButtons(tempId),
      ephemeral: true,
    });
  },
};

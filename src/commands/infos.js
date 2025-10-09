// src/commands/infos.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';

// ---- Utils ----
function formatStatus(presence) {
  if (!presence) return '❓ Inconnu';
  switch (presence.status) {
    case 'online':  return '🟢 En ligne';
    case 'idle':    return '🌙 Inactif';
    case 'dnd':     return '⛔ Ne pas déranger';
    case 'offline': return '⚫ Hors ligne';
    default:        return '❓ Inconnu';
  }
}

function formatRoles(member) {
  if (!member) return '—';
  const roles = member.roles.cache
    .filter(r => r.id !== member.guild.id)           // remove @everyone
    .sort((a, b) => b.position - a.position)
    .map(r => r.toString());

  if (roles.length === 0) return '—';

  const MAX_ROLES_SHOWN = 20;
  let shown = roles.slice(0, MAX_ROLES_SHOWN).join(', ');
  if (shown.length > 1024) shown = shown.slice(0, 1021) + '…';
  if (roles.length > MAX_ROLES_SHOWN) {
    shown += `\n_+ ${roles.length - MAX_ROLES_SHOWN} autre(s)…_`;
  }
  return shown;
}

export default {
  data: new SlashCommandBuilder()
    .setName('infos')
    .setDescription("Affiche des informations détaillées sur un utilisateur")
    .addUserOption(opt =>
      opt.setName('utilisateur')
        .setDescription("La personne dont tu veux les infos")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('section')
        .setDescription("Choisis la/les section(s) à afficher")
        .addChoices(
          { name: 'Profil', value: 'profil' },
          { name: 'Serveur', value: 'serveur' },
          { name: 'Statut', value: 'statut' },
          { name: 'Tout', value: 'tout' },
        )
    )
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur', true);
    const section = interaction.options.getString('section') ?? 'tout';

    // GuildMember pour rôles / statut
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    // Bannière
    const fullUser = await user.fetch().catch(() => user);
    const bannerUrl = typeof fullUser.bannerURL === 'function'
      ? fullUser.bannerURL({ size: 2048 })
      : null;

    // Couleur (rôle le plus élevé sinon bleu)
    const color = member?.displayHexColor && member.displayHexColor !== '#000000'
      ? member.displayHexColor
      : '#3498db';

    // Données serveur
    const highest = member?.roles?.highest ? member.roles.highest.toString() : '—';
    const joined = member?.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      : '—';
    const serverNick = member?.nickname ? `**${member.nickname}**` : '_Aucun_';
    const isOwner = interaction.guild.ownerId === user.id ? ' 👑 *(Propriétaire)*' : '';
    const boosting = member?.premiumSince
      ? `💎 Depuis <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`
      : '_Non_';
    const status = formatStatus(member?.presence);
    const rolesText = formatRoles(member);

    // ---------- Embeds ----------
    const eProfil = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL({ size: 128 }) })
      .setThumbnail(user.displayAvatarURL({ size: 1024 }))
      .addFields({
        name: "👤 Profil",
        value:
          `**Tag :** ${user.tag}\n` +
          `**ID :** \`${user.id}\`\n` +
          `**Création :** <t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
      })
      .setFooter({ text: `ID: ${user.id}` })
      .setTimestamp();
    if (bannerUrl) eProfil.setImage(bannerUrl);

    const eServeur = new EmbedBuilder()
      .setColor(color)
      .addFields({
        name: "🏠 Serveur",
        value:
          `**Surnom :** ${serverNick}\n` +
          `**Arrivée :** ${joined}\n` +
          `**Rôle le plus élevé :** ${highest}${isOwner}\n` +
          `**Boost :** ${boosting}`,
      });

    const eRoles = new EmbedBuilder()
      .setColor(color)
      .addFields({ name: "🎭 Rôles", value: rolesText });

    const eStatut = new EmbedBuilder()
      .setColor(color)
      .addFields({ name: "💡 Statut", value: status });

    // ---------- Sélection et réponse ----------
    let embeds = [];
    if (section === 'profil') {
      embeds = [eProfil];
    } else if (section === 'serveur') {
      embeds = [eServeur, eRoles];
    } else if (section === 'statut') {
      embeds = [eStatut];
    } else {
      embeds = [eProfil, eServeur, eRoles, eStatut];
    }

    await interaction.reply({
      embeds,
      allowedMentions: { parse: [] },
    });
  }
};

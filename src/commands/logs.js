// src/commands/logs.js
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { defaultConfig, getGuildConfig, setGuildConfig, updateGuildConfig } from '../logs/configStore.js';
import { sendLog } from '../logs/logger.js';

const CATS = [
  ['message_delete','Suppression de message'],
  ['message_edit','Édition de message'],
  ['message_bulk','Suppression massive'],
  ['member_join','Arrivées'],
  ['member_leave','Départs'],
  ['member_update','Membre mis à jour'],
  ['role_update','Rôles'],
  ['channel_update','Salons'],
  ['voice','Vocal'],
  ['bans','Bans/Unbans'],
  ['threads','Threads'],
  ['invites','Invitations'],
  ['reactions','Réactions'],
];

export default {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configurer le système de logs')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc.setName('setchannel')
        .setDescription('Définir le salon des logs')
        .addChannelOption(o =>
          o.setName('salon').setDescription('Salon texte/annonces').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc.setName('enable')
        .setDescription('Activer une catégorie de logs')
        .addStringOption(o =>
          o.setName('categorie').setDescription('Catégorie').setRequired(true)
            .addChoices(...CATS.map(([k, lab]) => ({ name: lab, value: k })))
        )
    )
    .addSubcommand(sc =>
      sc.setName('disable')
        .setDescription('Désactiver une catégorie de logs')
        .addStringOption(o =>
          o.setName('categorie').setDescription('Catégorie').setRequired(true)
            .addChoices(...CATS.map(([k, lab]) => ({ name: lab, value: k })))
        )
    )
    .addSubcommand(sc =>
      sc.setName('status')
        .setDescription('Voir la configuration actuelle')
    )
    .addSubcommand(sc =>
      sc.setName('test')
        .setDescription('Envoyer un message de test dans le salon de logs')
    )
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setchannel') {
      const ch = interaction.options.getChannel('salon', true);
      const cfg = updateGuildConfig(interaction.guildId, { channelId: ch.id });
      return interaction.reply({ content: `✅ Salon de logs défini sur ${ch}.`, ephemeral: true });
    }

    if (sub === 'enable' || sub === 'disable') {
      const cat = interaction.options.getString('categorie', true);
      const cfg = getGuildConfig(interaction.guildId) || defaultConfig();
      cfg.categories[cat] = (sub === 'enable');
      setGuildConfig(interaction.guildId, cfg);
      return interaction.reply({ content: `✅ Catégorie **${label(cat)}** ${sub === 'enable' ? 'activée' : 'désactivée'}.`, ephemeral: true });
    }

    if (sub === 'status') {
      const cfg = getGuildConfig(interaction.guildId) || defaultConfig();
      const lines = [
        `**Salon :** ${cfg.channelId ? `<#${cfg.channelId}>` : '_non défini_'}`,
        '',
        '**Catégories :**',
        ...CATS.map(([k, lab]) => `• ${lab} : ${cfg.categories[k] !== false ? '✅' : '❌'}`),
      ];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ Logs — Configuration').setDescription(lines.join('\n')).setTimestamp()] , ephemeral: true });
    }

    if (sub === 'test') {
      const cfg = getGuildConfig(interaction.guildId) || defaultConfig();
      if (!cfg.channelId) return interaction.reply({ content: '❌ Aucun salon configuré. Utilise `/logs setchannel`.', ephemeral: true });
      await sendLog(interaction.guild, new EmbedBuilder().setTitle('🧪 Test de logs').setDescription(`Test demandé par ${interaction.user}`), 'info');
      return interaction.reply({ content: '✅ Test envoyé.', ephemeral: true });
    }
  }
};

function label(key) {
  return CATS.find(([k]) => k === key)?.[1] ?? key;
}

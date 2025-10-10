// src/logs/logger.js
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, defaultConfig } from './configStore.js';

const COLORS = {
  info:      0x5865F2,
  success:   0x57F287,
  warn:      0xFEE75C,
  danger:    0xED4245,
  change:    0xFAA61A,
};

export function canLog(guildId, cat) {
  const cfg = getGuildConfig(guildId) || defaultConfig();
  return cfg.channelId && cfg.categories[cat] !== false;
}

export async function sendLog(guild, embed, cat='info') {
  const cfg = getGuildConfig(guild.id);
  if (!cfg?.channelId) return;
  const ch = guild.channels.cache.get(cfg.channelId) || await guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!ch) return;

  const me = guild.members.me;
  const ok = ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
  if (!ok) return;

  if (!(embed instanceof EmbedBuilder)) embed = new EmbedBuilder().setDescription(String(embed));
  if (!embed.data.color) embed.setColor(COLORS[cat] || COLORS.info);

  await ch.send({ embeds: [embed] }).catch(() => {});
}

export function baseEmbed(userOrMember, title) {
  const eb = new EmbedBuilder().setColor(COLORS.info).setTimestamp();
  if (title) eb.setTitle(title);
  if (userOrMember?.user) {
    eb.setAuthor({ name: `${userOrMember.user.tag}`, iconURL: userOrMember.user.displayAvatarURL?.({ size: 128 }) });
    eb.setFooter({ text: `ID: ${userOrMember.user.id}` });
  } else if (userOrMember) {
    eb.setAuthor({ name: `${userOrMember.tag}`, iconURL: userOrMember.displayAvatarURL?.({ size: 128 }) });
    eb.setFooter({ text: `ID: ${userOrMember.id}` });
  }
  return eb;
}

// src/logs/registerLogs.js
import {
  AuditLogEvent,
  ChannelType,
  Events,
  EmbedBuilder,
} from 'discord.js';
import { canLog, sendLog, baseEmbed } from './logger.js';

export function registerLogHandlers(client) {

  // ---- Messages ----
  client.on(Events.MessageDelete, async (msg) => {
    if (!msg.guild || !canLog(msg.guild.id, 'message_delete')) return;
    const eb = baseEmbed(msg.author, '🗑️ Message supprimé').setColor(0xED4245)
      .addFields(
        { name: 'Salon', value: msg.channel?.toString() ?? '—', inline: true },
        { name: 'Auteur', value: msg.author ? `${msg.author} (\`${msg.author.id}\`)` : '—', inline: true },
      );
    if (msg.content) {
      const content = msg.content.length > 1000 ? msg.content.slice(0, 1000) + '…' : msg.content;
      eb.addFields({ name: 'Contenu', value: content });
    } else {
      eb.addFields({ name: 'Contenu', value: '_Inconnu (non en cache ou Message Content intent désactivé)_' });
    }
    await sendLog(msg.guild, eb, 'danger');
  });

  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (!newMsg.guild || !canLog(newMsg.guild.id, 'message_edit')) return;
    if (oldMsg.content === newMsg.content) return;
    const eb = baseEmbed(newMsg.author, '✏️ Message édité').setColor(0xFAA61A)
      .addFields(
        { name: 'Salon', value: newMsg.channel?.toString() ?? '—', inline: true },
        { name: 'Auteur', value: newMsg.author ? `${newMsg.author} (\`${newMsg.author.id}\`)` : '—', inline: true },
      );
    if (oldMsg.content) eb.addFields({ name: 'Avant', value: clip(oldMsg.content) });
    if (newMsg.content) eb.addFields({ name: 'Après', value: clip(newMsg.content) });
    eb.addFields({ name: 'Lien', value: newMsg.url });
    await sendLog(newMsg.guild, eb, 'change');
  });

  client.on(Events.MessageBulkDelete, async (msgs) => {
    const guild = msgs.first()?.guild;
    if (!guild || !canLog(guild.id, 'message_bulk')) return;
    const channel = msgs.first()?.channel;
    const eb = new EmbedBuilder()
      .setTitle('🧹 Suppression massive de messages')
      .addFields(
        { name: 'Salon', value: channel?.toString() ?? '—', inline: true },
        { name: 'Nombre', value: String(msgs.size), inline: true },
      ).setTimestamp();
    await sendLog(guild, eb, 'danger');
  });

  // ---- Membres ----
  client.on(Events.GuildMemberAdd, async (m) => {
    if (!canLog(m.guild.id, 'member_join')) return;
    const eb = baseEmbed(m.user, '✅ Membre arrivé').setColor(0x57F287)
      .addFields(
        { name: 'Création du compte', value: `<t:${Math.floor(m.user.createdTimestamp/1000)}:R>` },
      );
    await sendLog(m.guild, eb, 'success');
  });

  client.on(Events.GuildMemberRemove, async (m) => {
    if (!canLog(m.guild.id, 'member_leave')) return;
    const eb = baseEmbed(m.user, '👋 Membre parti').setColor(0xED4245)
      .addFields({ name: 'A quitté', value: `<t:${Math.floor(Date.now()/1000)}:R>` });
    await sendLog(m.guild, eb, 'danger');
  });

  client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    if (!canLog(newM.guild.id, 'member_update')) return;

    const changes = [];
    if (oldM.nickname !== newM.nickname) {
      changes.push({ name: 'Surnom', value: `\`${oldM.nickname ?? '—'}\` → \`${newM.nickname ?? '—'}\`` });
    }
    // Rôles ajoutés/supprimés
    const oldRoles = new Set(oldM.roles.cache.keys());
    const newRoles = new Set(newM.roles.cache.keys());
    const added = [...newRoles].filter(id => !oldRoles.has(id));
    const removed = [...oldRoles].filter(id => !newRoles.has(id));
    if (added.length)  changes.push({ name: 'Rôles ajoutés', value: added.map(id => `<@&${id}>`).join(', ') });
    if (removed.length) changes.push({ name: 'Rôles retirés', value: removed.map(id => `<@&${id}>`).join(', ') });

    if (!changes.length) return;

    const eb = baseEmbed(newM, '🧩 Membre mis à jour').setColor(0xFAA61A);
    changes.forEach(c => eb.addFields(c));
    await sendLog(newM.guild, eb, 'change');
  });

  // ---- Rôles ----
  client.on(Events.RoleCreate, async (role) => {
    if (!canLog(role.guild.id, 'role_update')) return;
    const eb = new EmbedBuilder().setTitle('➕ Rôle créé').addFields(
      { name: 'Rôle', value: `${role} (\`${role.id}\`)` },
    ).setTimestamp();
    await sendLog(role.guild, eb, 'success');
  });

  client.on(Events.RoleDelete, async (role) => {
    if (!canLog(role.guild.id, 'role_update')) return;
    const eb = new EmbedBuilder().setTitle('➖ Rôle supprimé').addFields(
      { name: 'Rôle', value: `\`${role.name}\` (\`${role.id}\`)` },
    ).setTimestamp();
    await sendLog(role.guild, eb, 'danger');
  });

  // ---- Salons ----
  client.on(Events.ChannelCreate, async (ch) => {
    if (!ch.guild || !canLog(ch.guild.id, 'channel_update')) return;
    const eb = new EmbedBuilder().setTitle('📁 Salon créé').addFields(
      { name: 'Salon', value: channelLabel(ch) },
    ).setTimestamp();
    await sendLog(ch.guild, eb, 'success');
  });

  client.on(Events.ChannelDelete, async (ch) => {
    if (!ch.guild || !canLog(ch.guild.id, 'channel_update')) return;
    const eb = new EmbedBuilder().setTitle('🗑️ Salon supprimé').addFields(
      { name: 'Salon', value: channelLabel(ch) },
    ).setTimestamp();
    await sendLog(ch.guild, eb, 'danger');
  });

  // ---- Voix ----
  client.on(Events.VoiceStateUpdate, async (oldS, newS) => {
    const guild = newS.guild;
    if (!canLog(guild.id, 'voice')) return;

    const user = await guild.members.fetch(newS.id).catch(() => null) || { user: newS.member?.user };
    let text = null;
    if (!oldS.channelId && newS.channelId) text = `🔊 **rejoint** ${channelMention(newS.channelId)}`;
    else if (oldS.channelId && !newS.channelId) text = `🔇 **quitte** ${channelMention(oldS.channelId)}`;
    else if (oldS.channelId && newS.channelId && oldS.channelId !== newS.channelId) text = `🔁 **passe** ${channelMention(oldS.channelId)} → ${channelMention(newS.channelId)}`;

    if (text) {
      const eb = baseEmbed(user.user, '🎙️ Activité vocale').setDescription(`${user} ${text}`);
      await sendLog(guild, eb, 'info');
    }
  });

  // ---- Bans ----
  client.on(Events.GuildBanAdd, async (ban) => {
    if (!canLog(ban.guild.id, 'bans')) return;
    const eb = baseEmbed(ban.user, '⛔ Ban').addFields(
      { name: 'Raison', value: ban.reason ?? '_Non fournie_' },
    ).setColor(0xED4245);
    await sendLog(ban.guild, eb, 'danger');
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    if (!canLog(ban.guild.id, 'bans')) return;
    const eb = baseEmbed(ban.user, '♻️ Unban').setColor(0x57F287);
    await sendLog(ban.guild, eb, 'success');
  });

  // ---- Threads ----
  client.on(Events.ThreadCreate, async (th) => {
    if (!th.guild || !canLog(th.guild.id, 'threads')) return;
    const eb = new EmbedBuilder().setTitle('🧵 Thread créé').addFields(
      { name: 'Thread', value: `${th} (\`${th.id}\`)` },
      { name: 'Dans', value: th.parent?.toString() ?? '—' },
    ).setTimestamp();
    await sendLog(th.guild, eb, 'success');
  });

  client.on(Events.ThreadDelete, async (th) => {
    if (!th.guild || !canLog(th.guild.id, 'threads')) return;
    const eb = new EmbedBuilder().setTitle('🧷 Thread supprimé').addFields(
      { name: 'Thread', value: `\`${th.name}\` (\`${th.id}\`)` },
    ).setTimestamp();
    await sendLog(th.guild, eb, 'danger');
  });

  // ---- Invites ----
  client.on(Events.InviteCreate, async (inv) => {
    if (!canLog(inv.guild.id, 'invites')) return;
    const eb = new EmbedBuilder().setTitle('🔗 Invitation créée').addFields(
      { name: 'Code', value: `\`${inv.code}\`` },
      { name: 'Salon', value: inv.channel?.toString() ?? '—', inline: true },
      { name: 'Expire', value: inv.maxAge ? `<t:${Math.floor((Date.now()+inv.maxAge*1000)/1000)}:R>` : '_Jamais_', inline: true },
    ).setTimestamp();
    await sendLog(inv.guild, eb, 'info');
  });

  client.on(Events.InviteDelete, async (inv) => {
    if (!canLog(inv.guild.id, 'invites')) return;
    const eb = new EmbedBuilder().setTitle('❌ Invitation supprimée').addFields(
      { name: 'Code', value: `\`${inv.code}\`` },
    ).setTimestamp();
    await sendLog(inv.guild, eb, 'warn');
  });
}

// helpers
function clip(s) { return s.length > 1024 ? s.slice(0, 1021) + '…' : s; }
function channelMention(id) { return `<#${id}>`; }
function channelLabel(ch) {
  const type =
    ch.type === ChannelType.GuildText ? 'Texte' :
    ch.type === ChannelType.GuildVoice ? 'Vocal' :
    ch.type === ChannelType.GuildAnnouncement ? 'Annonces' :
    ch.type === ChannelType.GuildCategory ? 'Catégorie' : String(ch.type);
  return `${ch?.toString?.() ?? `\`${ch?.name ?? '?'}\``} — *${type}* (\`${ch?.id}\`)`;
}

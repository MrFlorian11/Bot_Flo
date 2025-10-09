// src/commands/stop.js
import { SlashCommandBuilder } from 'discord.js';
import { findGameForUserInChannel } from '../gameHub.js';

export default {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Arrête la partie en cours dans ce salon (si tu y joues).')
    .setDMPermission(false),
  async execute(interaction) {
    const entry = findGameForUserInChannel(interaction.user.id, interaction.channelId);
    if (!entry) {
      return interaction.reply({ content: "Aucune partie en cours où tu joues dans ce salon.", ephemeral: true });
    }

    try {
      await entry.stop(interaction, { reason: 'stopped', by: interaction.user.id });
      return interaction.reply({ content: "🛑 Partie arrêtée.", ephemeral: true });
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: "Impossible d'arrêter la partie (voir logs).", ephemeral: true });
    }
  },
};

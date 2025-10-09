import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Pile ou Face.'),
  async execute(interaction) {
    const res = Math.random() < 0.5 ? 'Pile' : 'Face';
    await interaction.reply(`🪙 ${res} !`);
  },
};

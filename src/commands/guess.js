import { SlashCommandBuilder } from 'discord.js';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export default {
  data: new SlashCommandBuilder()
    .setName('guess')
    .setDescription('Devine le nombre (1-10).')
    .addIntegerOption(o =>
      o.setName('nombre').setDescription('Ton essai (1 à 10)').setRequired(true).setMinValue(1).setMaxValue(10)
    ),
  async execute(interaction) {
    const guess = interaction.options.getInteger('nombre', true);
    const target = rand(1, 10);
    if (guess === target) {
      await interaction.reply(`🎉 Bravo ! C'était bien **${target}**.`);
    } else {
      const hint = guess < target ? 'plus grand' : 'plus petit';
      await interaction.reply(`🙃 Raté ! C'était **${target}** (il fallait chercher **${hint}**).`);
    }
  },
};

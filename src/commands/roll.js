import { SlashCommandBuilder } from 'discord.js';

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export default {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Lancer de dés.')
    .addIntegerOption(o =>
      o.setName('faces').setDescription('Nombre de faces (ex: 6, 20...)').setMinValue(2).setMaxValue(1000)
    )
    .addIntegerOption(o =>
      o.setName('quantite').setDescription('Nombre de dés à lancer').setMinValue(1).setMaxValue(10)
    ),
  async execute(interaction) {
    const faces = interaction.options.getInteger('faces') ?? 6;
    const qty = interaction.options.getInteger('quantite') ?? 1;
    const rolls = Array.from({ length: qty }, () => rand(1, faces));
    const total = rolls.reduce((a, b) => a + b, 0);
    const detail = rolls.join(' + ');
    await interaction.reply(`🎲 d${faces} × ${qty} → **${total}** (${detail})`);
  },
};

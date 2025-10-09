import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Tire un gagnant entre toi et un adversaire.')
    .addUserOption(o =>
      o.setName('adversaire').setDescription('La personne à défier').setRequired(true)
    ),
  async execute(interaction) {
    const opponent = interaction.options.getUser('adversaire', true);
    const players = [interaction.user, opponent];
    const winner = players[Math.floor(Math.random() * players.length)];
    const loser = winner.id === interaction.user.id ? opponent : interaction.user;

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Duel')
      .setDescription(`**${interaction.user.username}** vs **${opponent.username}**\n\n🏆 **Vainqueur : ${winner.username}**\n😵 Perdant : ${loser.username}`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

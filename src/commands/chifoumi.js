import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const emoji = { pierre: '🪨', feuille: '📄', ciseaux: '✂️' };

function botPick() {
  const vals = ['pierre', 'feuille', 'ciseaux'];
  return vals[Math.floor(Math.random() * vals.length)];
}
function outcome(user, bot) {
  if (user === bot) return 'egalite';
  const win =
    (user === 'pierre' && bot === 'ciseaux') ||
    (user === 'feuille' && bot === 'pierre') ||
    (user === 'ciseaux' && bot === 'feuille');
  return win ? 'gagne' : 'perd';
}

export default {
  data: new SlashCommandBuilder()
    .setName('chifoumi')
    .setDescription('Joue à pierre-feuille-ciseaux contre le bot.')
    .addStringOption(opt =>
      opt.setName('choix')
        .setDescription('Ton choix')
        .setRequired(true)
        .addChoices(
          { name: '🪨 Pierre', value: 'pierre' },
          { name: '📄 Feuille', value: 'feuille' },
          { name: '✂️ Ciseaux', value: 'ciseaux' },
        )
    ),
  async execute(interaction) {
    const userChoice = interaction.options.getString('choix');
    const botChoice = botPick();
    const result = outcome(userChoice, botChoice);

    const titles = {
      egalite: '🤝 Égalité !',
      gagne: '🎉 Tu gagnes !',
      perd: '😵 Tu perds…',
    };

    const desc = `**Toi :** ${emoji[userChoice]} ${userChoice}\n**Bot :** ${emoji[botChoice]} ${botChoice}`;
    const embed = new EmbedBuilder()
      .setTitle(titles[result])
      .setDescription(desc)
      .setFooter({ text: 'Chifoumi' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

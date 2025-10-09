import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const TRIVIA = [
  { q: "Quel est le plus grand océan ?", answers: ["Pacifique", "Atlantique", "Indien", "Arctique"], correct: 0 },
  { q: "Combien font 9 × 7 ?", answers: ["54", "56", "63", "72"], correct: 2 },
  { q: "Qui a écrit *Le Petit Prince* ?", answers: ["Hugo", "Saint-Exupéry", "Camus", "Zola"], correct: 1 },
];

const PREFIX = 'trivia';

export default {
  customIdPrefix: PREFIX, // permet au routeur d’index.js d’appeler handleButton
  data: new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Question rapide de culture G.'),
  async execute(interaction) {
    const idx = Math.floor(Math.random() * TRIVIA.length);
    const q = TRIVIA[idx];

    const row = new ActionRowBuilder().addComponents(
      ...q.answers.map((label, i) =>
        new ButtonBuilder()
          .setCustomId(`${PREFIX}:${idx}:${i}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Primary)
      )
    );

    const embed = new EmbedBuilder()
      .setTitle('❓ Trivia')
      .setDescription(q.q)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [row] });
  },
  async handleButton(interaction, parts) {
    const [qIndexStr, pickStr] = parts;
    const qIndex = Number(qIndexStr);
    const pick = Number(pickStr);
    const q = TRIVIA[qIndex];
    if (!q || Number.isNaN(pick)) {
      return interaction.reply({ content: 'Interaction invalide.', ephemeral: true });
    }

    const good = pick === q.correct;

    const row = new ActionRowBuilder().addComponents(
      ...q.answers.map((label, i) =>
        new ButtonBuilder()
          .setCustomId(`${PREFIX}:${qIndex}:${i}`)
          .setLabel(label)
          .setStyle(i === q.correct ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true)
      )
    );

    const embed = new EmbedBuilder()
      .setTitle(good ? '✅ Bonne réponse !' : '❌ Mauvaise réponse')
      .setDescription(q.q)
      .setFooter({ text: good ? 'Bien joué !' : `Bonne réponse : ${q.answers[q.correct]}` })
      .setTimestamp();

    try {
      await interaction.update({ embeds: [embed], components: [row] });
    } catch {
      await interaction.reply({ embeds: [embed], components: [], ephemeral: true });
    }
  },
};

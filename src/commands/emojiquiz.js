import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const EMOJIQUIZ = [
  { clue: "🦁👑", answers: ["Le Roi Lion", "Madagascar", "Tarzan", "Shrek"], correct: 0 },
  { clue: "🧙‍♂️🪄🏰", answers: ["Harry Potter", "Le Hobbit", "Narnia", "Merlin"], correct: 0 },
  { clue: "🚢🧊❤️", answers: ["Titanic", "Poseidon", "Master and Commander", "Moby Dick"], correct: 0 },
];

const PREFIX = 'emojiquiz';

export default {
  customIdPrefix: PREFIX,
  data: new SlashCommandBuilder()
    .setName('emojiquiz')
    .setDescription('Devine à partir des emojis.'),
  async execute(interaction) {
    const idx = Math.floor(Math.random() * EMOJIQUIZ.length);
    const q = EMOJIQUIZ[idx];

    const row = new ActionRowBuilder().addComponents(
      ...q.answers.map((label, i) =>
        new ButtonBuilder()
          .setCustomId(`${PREFIX}:${idx}:${i}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Primary)
      )
    );

    const embed = new EmbedBuilder()
      .setTitle('🔎 Emoji Quiz')
      .setDescription(q.clue)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [row] });
  },
  async handleButton(interaction, parts) {
    const [qIndexStr, pickStr] = parts;
    const qIndex = Number(qIndexStr);
    const pick = Number(pickStr);
    const q = EMOJIQUIZ[qIndex];
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
      .setDescription(q.clue)
      .setFooter({ text: good ? 'Bien joué !' : `Bonne réponse : ${q.answers[q.correct]}` })
      .setTimestamp();

    try {
      await interaction.update({ embeds: [embed], components: [row] });
    } catch {
      await interaction.reply({ embeds: [embed], components: [], ephemeral: true });
    }
  },
};

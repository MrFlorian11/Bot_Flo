// src/index.js
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  REST,
  Routes,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsPath = path.join(__dirname, 'commands');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

client.commands = new Collection();
const buttonHandlers = new Map();
const modalHandlers  = new Map();
// 🆕 Select menus
const selectHandlers = new Map();

async function loadCommands() {
  client.commands.clear();
  buttonHandlers.clear();
  modalHandlers.clear();
  selectHandlers.clear(); // 🆕

  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const filePath = path.join(commandsPath, file);
    const mod = (await import(`file://${filePath}`)).default;

    if (!mod?.data || !mod?.execute) {
      console.warn(`⚠️  ${file} ignoré: export "data" ou "execute" manquant.`);
      continue;
    }
    client.commands.set(mod.data.name, mod);

    if (mod.customIdPrefix && typeof mod.handleButton === 'function') {
      buttonHandlers.set(mod.customIdPrefix, mod.handleButton);
    }
    if (mod.modalPrefix && typeof mod.handleModal === 'function') {
      modalHandlers.set(mod.modalPrefix, mod.handleModal);
    }
    // 🆕 Select menus
    if (mod.selectPrefix && typeof mod.handleSelect === 'function') {
      selectHandlers.set(mod.selectPrefix, mod.handleSelect);
    }
  }
}

async function deployGuildCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  const payload = [];
  for (const file of files) {
    const filePath = path.join(commandsPath, file);
    const mod = (await import(`file://${filePath}`)).default;
    if (mod?.data) payload.push(mod.data.toJSON());
  }
  console.log('🔃 Déploiement (guild)…');
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: payload },
  );
  console.log('✅ Commandes déployées (guild).');
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Connecté comme ${c.user.tag}`);
  await loadCommands();
  if (process.env.AUTO_DEPLOY !== 'false') {
    try { await deployGuildCommands(); } catch (e) { console.error('❌ Déploiement :', e); }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      const [prefix, ...parts] = interaction.customId.split(':');
      const handler = buttonHandlers.get(prefix);
      if (!handler) return interaction.reply({ content: 'Interaction inconnue.', ephemeral: true });
      return await handler(interaction, parts);
    }
    if (interaction.isModalSubmit()) {
      const [prefix, ...parts] = interaction.customId.split(':');
      const handler = modalHandlers.get(prefix);
      if (!handler) return interaction.reply({ content: 'Formulaire inconnu.', ephemeral: true });
      return await handler(interaction, parts);
    }
    // 🆕 Select menus
    if (interaction.isStringSelectMenu()) {
      const [prefix, ...parts] = interaction.customId.split(':');
      const handler = selectHandlers.get(prefix);
      if (!handler) return interaction.reply({ content: 'Sélection inconnue.', ephemeral: true });
      return await handler(interaction, parts);
    }
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      return await cmd.execute(interaction);
    }
  } catch (err) {
    console.error(err);
    const msg = '❌ Oups, une erreur est survenue.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

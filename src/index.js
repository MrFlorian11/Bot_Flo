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
import { registerLogHandlers } from './logs/registerLogs.js';

// ---------- RÉSOLUTIONS DE CHEMINS ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsPath = path.join(__dirname, 'commands');

// ---------- CLIENT DISCORD ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // 🔥 Nécessaire pour logs message_delete / edit
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ---------- COLLECTIONS ----------
client.commands = new Collection();
const buttonHandlers = new Map();
const modalHandlers  = new Map();
const selectHandlers = new Map();

// ---------- CHARGEMENT DES COMMANDES ----------
async function loadCommands() {
  client.commands.clear();
  buttonHandlers.clear();
  modalHandlers.clear();
  selectHandlers.clear();

  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const filePath = path.join(commandsPath, file);
    const mod = (await import(`file://${filePath}`)).default;

    if (!mod?.data || !mod?.execute) {
      console.warn(`⚠️  ${file} ignoré : export "data" ou "execute" manquant.`);
      continue;
    }

    client.commands.set(mod.data.name, mod);

    // 🔹 Boutons
    if (mod.customIdPrefix && typeof mod.handleButton === 'function')
      buttonHandlers.set(mod.customIdPrefix, mod.handleButton);

    // 🔹 Modals
    if (mod.modalPrefix && typeof mod.handleModal === 'function')
      modalHandlers.set(mod.modalPrefix, mod.handleModal);

    // 🔹 Menus déroulants (String Select)
    if (mod.customIdPrefix && typeof mod.handleSelect === 'function')
      selectHandlers.set(mod.customIdPrefix, mod.handleSelect);
  }

  console.log(`✅ ${client.commands.size} commandes chargées.`);
}

// ---------- DÉPLOIEMENT DES COMMANDES ----------
async function deployGuildCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  const payload = [];
  for (const file of files) {
    const filePath = path.join(commandsPath, file);
    const mod = (await import(`file://${filePath}`)).default;
    if (mod?.data) payload.push(mod.data.toJSON());
  }

  console.log('🔃 Déploiement des commandes (guild)…');
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: payload },
  );
  console.log('✅ Déploiement terminé.');
}

// ---------- ÉVÉNEMENTS ----------
client.once(Events.ClientReady, async (c) => {
  console.log(`🚀 Connecté en tant que ${c.user.tag}`);
  await loadCommands();

  // 🧠 Active les listeners de logs
  registerLogHandlers(client);
  console.log('🧩 Système de logs chargé.');

  // ⚙️ Déploiement auto (désactivable via .env)
  if (process.env.AUTO_DEPLOY !== 'false') {
    try {
      await deployGuildCommands();
    } catch (e) {
      console.error('❌ Erreur de déploiement :', e);
    }
  }
});

// ---------- GESTION DES INTERACTIONS ----------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // 🟢 Boutons
    if (interaction.isButton()) {
      const [prefix, ...parts] = interaction.customId.split(':');
      const handler = buttonHandlers.get(prefix);
      if (!handler) return;
      return await handler(interaction, parts);
    }

    // 🟢 Menus déroulants (select)
    if (interaction.isStringSelectMenu()) {
      const [prefix, ...parts] = interaction.customId.split(':');
      const handler = selectHandlers.get(prefix);
      if (!handler) return;
      return await handler(interaction, parts);
    }

    // 🟢 Modals
    if (interaction.isModalSubmit()) {
      const [prefix, ...parts] = interaction.customId.split(':');
      const handler = modalHandlers.get(prefix);
      if (!handler) return;
      return await handler(interaction, parts);
    }

    // 🟢 Slash Commands
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
    }
  } catch (err) {
    console.error(err);
    const msg = '❌ Une erreur est survenue.';
    if (interaction.deferred || interaction.replied)
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    else
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

// ---------- CONNEXION ----------
client.login(process.env.DISCORD_TOKEN);

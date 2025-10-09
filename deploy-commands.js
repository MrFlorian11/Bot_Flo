// deploy-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(commandsPath, file);
  const mod = (await import(`file://${filePath}`)).default;
  if (mod?.data) commands.push(mod.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

console.log('🔃 Déploiement des commandes (guilde)…');
await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands },
);
console.log('✅ Commandes déployées.');

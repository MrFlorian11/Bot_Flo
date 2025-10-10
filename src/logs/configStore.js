// src/logs/configStore.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const FILE = path.join(DATA_DIR, 'logconfig.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({}), 'utf8');
}

export function loadAll() {
  ensureFile();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
export function saveAll(all) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2), 'utf8');
}

export function getGuildConfig(guildId) {
  const all = loadAll();
  return all[guildId] || null;
}

export function setGuildConfig(guildId, cfg) {
  const all = loadAll();
  all[guildId] = cfg;
  saveAll(all);
}

export function updateGuildConfig(guildId, partial) {
  const current = getGuildConfig(guildId) || defaultConfig();
  const merged = { ...current, ...partial, categories: { ...current.categories, ...(partial.categories || {}) } };
  setGuildConfig(guildId, merged);
  return merged;
}

export function defaultConfig() {
  return {
    channelId: null,
    categories: {
      message_delete: true,
      message_edit:   true,
      message_bulk:   true,
      member_join:    true,
      member_leave:   true,
      member_update:  true, // nick/roles/timeouts
      role_update:    true,
      channel_update: true,
      voice:          true,
      bans:           true,
      threads:        true,
      invites:        true,
      reactions:      false, // off par défaut (bruyant)
    },
  };
}

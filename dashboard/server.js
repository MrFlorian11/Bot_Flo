// dashboard/server.js
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ========== Chemins & Configuration ==========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

dotenv.config({ path: path.join(ROOT, '.env') });

const required = ['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_REDIRECT'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Variables manquantes dans .env :', missing.join(', '));
  process.exit(1);
}
if (!process.env.DISCORD_BOT_TOKEN) {
  console.warn('⚠️  DISCORD_BOT_TOKEN manquant : la liste déroulante des salons ne pourra pas se charger.');
}

const DATA_DIR = path.join(ROOT, 'data');
const LOGCFG = path.join(DATA_DIR, 'logconfig.json');

// ========== Utils ==========
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOGCFG)) fs.writeFileSync(LOGCFG, JSON.stringify({}), 'utf8');
}
function readAll() { ensureData(); try { return JSON.parse(fs.readFileSync(LOGCFG, 'utf8')); } catch { return {}; } }
function writeAll(obj) { ensureData(); fs.writeFileSync(LOGCFG, JSON.stringify(obj, null, 2), 'utf8'); }
function defaultConfig() {
  return {
    channelId: null,
    categories: {
      message_delete: true, message_edit: true, message_bulk: true,
      member_join: true, member_leave: true, member_update: true,
      role_update: true, channel_update: true, voice: true,
      bans: true, threads: true, invites: true, reactions: false,
    },
  };
}

// ========== OAuth ==========
const scopes = ['identify', 'guilds'];
passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((o, d) => d(null, o));

passport.use(new DiscordStrategy({
  clientID: process.env.OAUTH_CLIENT_ID,
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  callbackURL: process.env.OAUTH_REDIRECT,
  scope: scopes,
}, (accessToken, _refresh, profile, done) => {
  return done(null, { ...profile, accessToken });
}));

// ========== App ==========
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change_me_secret',
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}
function userCanManageGuild(userGuilds, guildId) {
  const g = (userGuilds || []).find(g => g.id === guildId);
  if (!g) return false;
  const MANAGE_GUILD = BigInt(1 << 5);
  try { return (BigInt(g.permissions) & MANAGE_GUILD) === MANAGE_GUILD; }
  catch { return false; }
}

// ========== Routes pages ==========
app.get('/', (req, res) => res.render('index', { user: req.user, guilds: null }));

app.get('/login', passport.authenticate('discord', { scope: scopes }));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.get('/dashboard', requireAuth, (req, res) => {
  const guilds = (req.user?.guilds || [])
    .filter(g => userCanManageGuild(req.user.guilds, g.id))
    .map(g => ({ id: g.id, name: g.name, icon: g.icon }));
  res.render('index', { user: req.user, guilds });
});

app.get('/guild/:id', requireAuth, (req, res) => {
  const guildId = req.params.id;
  if (!userCanManageGuild(req.user.guilds, guildId)) return res.status(403).send('Accès refusé.');

  const all = readAll();
  const cfg = all[guildId] || defaultConfig();
  const cats = [
    ['message_delete','Suppression de message'],
    ['message_edit','Édition de message'],
    ['message_bulk','Suppression massive'],
    ['member_join','Arrivées'],
    ['member_leave','Départs'],
    ['member_update','Membre mis à jour'],
    ['role_update','Rôles'],
    ['channel_update','Salons'],
    ['voice','Vocal'],
    ['bans','Bans/Unbans'],
    ['threads','Threads'],
    ['invites','Invitations'],
    ['reactions','Réactions'],
  ];
  res.render('guild', { user: req.user, guildId, cfg, cats, saved: req.query.saved === '1' });
});

app.post('/guild/:id', requireAuth, (req, res) => {
  const guildId = req.params.id;
  if (!userCanManageGuild(req.user.guilds, guildId)) return res.status(403).send('Accès refusé.');

  const all = readAll();
  const oldCfg = all[guildId] || defaultConfig();

  const channelId = req.body.channelId?.trim() || null;
  const newCats = { ...oldCfg.categories };
  for (const key of Object.keys(newCats)) newCats[key] = req.body[`cat_${key}`] === 'on';

  all[guildId] = { channelId, categories: newCats };
  writeAll(all);

  res.redirect(`/guild/${guildId}?saved=1`);
});

// ========== API : liste des salons textuels ==========
app.get('/api/guild/:id/channels', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!userCanManageGuild(req.user.guilds, guildId))
    return res.status(403).json({ error: 'Accès refusé.' });

  if (!process.env.DISCORD_BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Bot token manquant.' });
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    });

    if (!response.ok) throw new Error('Erreur API Discord');

    const data = await response.json();
    const channels = data
      .filter(ch => ch.type === 0) // GUILD_TEXT
      .map(ch => ({ id: ch.id, name: ch.name }));

    res.json({ ok: true, channels });
  } catch (err) {
    console.error('Erreur récupération salons:', err);
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des salons.' });
  }
});

// Santé
app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.DASHBOARD_PORT || 3000);
app.listen(PORT, () => console.log(`🌐 Dashboard en ligne sur http://localhost:${PORT}`));

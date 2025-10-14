// dashboard/server.js
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ejsLayouts from 'express-ejs-layouts';

// ========== Chemins & Configuration ==========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// Charger le .env de la racine (E:\Bot_Flo\.env)
dotenv.config({ path: path.join(ROOT, '.env') });

// Vérifie les variables OAuth
const required = ['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_REDIRECT'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Variables manquantes dans .env :', missing.join(', '));
  console.error('Exemple attendu :');
  console.error('OAUTH_CLIENT_ID=...');
  console.error('OAUTH_CLIENT_SECRET=...');
  console.error('OAUTH_REDIRECT=http://localhost:3000/auth/callback');
  process.exit(1);
}

// Dossiers de données
const DATA_DIR = path.join(ROOT, 'data');
const LOGCFG = path.join(DATA_DIR, 'logconfig.json');

// ========== Fonctions utilitaires ==========
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOGCFG)) fs.writeFileSync(LOGCFG, JSON.stringify({}), 'utf8');
}
function readAll() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(LOGCFG, 'utf8')); }
  catch { return {}; }
}
function writeAll(obj) {
  ensureData();
  fs.writeFileSync(LOGCFG, JSON.stringify(obj, null, 2), 'utf8');
}
function defaultConfig() {
  return {
    channelId: null,
    categories: {
      message_delete: true,
      message_edit:   true,
      message_bulk:   true,
      member_join:    true,
      member_leave:   true,
      member_update:  true,
      role_update:    true,
      channel_update: true,
      voice:          true,
      bans:           true,
      threads:        true,
      invites:        true,
      reactions:      false,
    },
  };
}

// ========== Discord OAuth ==========
const scopes = ['identify', 'guilds'];

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: process.env.OAUTH_CLIENT_ID,
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  callbackURL: process.env.OAUTH_REDIRECT,
  scope: scopes,
}, (accessToken, refreshToken, profile, done) => {
  return done(null, { ...profile, accessToken });
}));

// ========== Application Express ==========
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layout'); // layout.ejs par défaut
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change_me_secret',
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

// Middleware de protection
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

function userCanManageGuild(userGuilds, guildId) {
  const g = (userGuilds || []).find(g => g.id === guildId);
  if (!g) return false;
  const MANAGE_GUILD = BigInt(1 << 5);
  try {
    const perms = BigInt(g.permissions);
    return (perms & MANAGE_GUILD) === MANAGE_GUILD;
  } catch { return false; }
}

// ========== Routes ==========
app.get('/', (req, res) => res.render('index', { user: req.user }));

app.get('/login', passport.authenticate('discord', { scope: scopes }));
app.get('/auth/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => res.redirect('/dashboard')
);

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  const guilds = (req.user?.guilds || [])
    .filter(g => userCanManageGuild(req.user.guilds, g.id))
    .map(g => ({ id: g.id, name: g.name, icon: g.icon }));

  res.render('index', { user: req.user, guilds });
});

app.get('/guild/:id', requireAuth, (req, res) => {
  const guildId = req.params.id;
  if (!userCanManageGuild(req.user.guilds, guildId))
    return res.status(403).send('Accès refusé.');

  const all = readAll();
  const cfg = all[guildId] || defaultConfig();

  res.render('guild', {
    user: req.user,
    guildId,
    cfg,
    cats: [
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
    ],
  });
});

app.post('/guild/:id', requireAuth, (req, res) => {
  const guildId = req.params.id;
  if (!userCanManageGuild(req.user.guilds, guildId))
    return res.status(403).send('Accès refusé.');

  const all = readAll();
  const oldCfg = all[guildId] || defaultConfig();

  const channelId = req.body.channelId?.trim() || null;
  const newCats = { ...oldCfg.categories };
  for (const key of Object.keys(newCats)) {
    newCats[key] = req.body[`cat_${key}`] === 'on';
  }

  all[guildId] = { channelId, categories: newCats };
  writeAll(all);

  res.redirect(`/guild/${guildId}?saved=1`);
});

// Route simple de santé
app.get('/health', (req, res) => res.json({ ok: true }));

// ========== Lancement ==========
const PORT = Number(process.env.DASHBOARD_PORT || 3000);
app.listen(PORT, () => {
  console.log(`🌐 Dashboard en ligne sur http://localhost:${PORT}`);
});

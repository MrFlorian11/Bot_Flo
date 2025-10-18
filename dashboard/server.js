// dashboard/server.js (ESM + Redis v4 + connect-redis v7)
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

import RedisStore from 'connect-redis';
import { createClient } from 'redis';

console.log('### DASHBOARD BUILD v2 (ESM + redis@4 + connect-redis@7) ###');

// ---------- chemins / .env ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.join(__dirname, '..');

dotenv.config({ path: path.join(ROOT, '.env'), override: true });

const app  = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// (optionnel si HTTPS derrière proxy)
// app.set('trust proxy', 1);

// ---------- Redis (PAS de createRequire, PAS d'ioredis) ----------
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
});
redisClient.on('error', (err) => console.error('[Redis] Error', err));
await redisClient.connect(); // top-level await OK en ESM (Node >=16.8)

// ---------- session avec connect-redis v7 ----------
app.use(session({
  store: new RedisStore({ client: redisClient, prefix: 'dash:' }),
  secret: process.env.SESSION_SECRET || 'change_me_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,       // passe à true en HTTPS derrière proxy
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

// ---------- Passport Discord OAuth ----------
passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((o, d) => d(null, o));
passport.use(new DiscordStrategy({
  clientID:     process.env.OAUTH_CLIENT_ID,
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  callbackURL:  process.env.OAUTH_REDIRECT,
  scope: ['identify', 'guilds'],
}, (accessToken, _refresh, profile, done) => done(null, profile)));

app.use(passport.initialize());
app.use(passport.session());

// ---------- vues / static ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
function requireAuth(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/login');
  next();
}
function userCanManageGuild(guilds, guildId) {
  return (guilds || []).some(g => g.id === guildId && (Number(g.permissions) & 0x20) === 0x20);
}

// ---------- routes ----------
app.get('/', (req, res) => req.isAuthenticated() ? res.redirect('/dashboard') : res.redirect('/login'));
app.get('/login', passport.authenticate('discord'));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.get('/dashboard', requireAuth, (req, res) => {
  // tu peux passer la liste des guilds ici si tu veux
  res.render('index', { user: req.user, guilds: (req.user?.guilds || []).filter(g => userCanManageGuild(req.user.guilds, g.id)) });
});

// API: salons textuels
app.get('/api/guild/:id/channels', requireAuth, async (req, res) => {
  const guildId = req.params.id;
  if (!userCanManageGuild(req.user.guilds, guildId))
    return res.status(403).json({ error: 'Accès refusé.' });

  try {
    const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!r.ok) throw new Error(`Discord API ${r.status}`);
    const data = await r.json();
    const channels = data.filter(ch => ch.type === 0).map(ch => ({ id: ch.id, name: ch.name }));
    res.json({ ok: true, channels });
  } catch (e) {
    console.error('Erreur récupération salons:', e);
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des salons.' });
  }
});

app.listen(PORT, () => console.log(`🌐 Dashboard en ligne sur http://localhost:${PORT}`));

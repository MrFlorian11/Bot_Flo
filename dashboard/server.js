// ==============================
// 🌐 DASHBOARD BOT_FLO
// ==============================

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
const require = createRequire(import.meta.url);

// ==============================
// 📦 CONFIG
// ==============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// Charge le .env à la racine
dotenv.config({ path: path.join(ROOT, '.env'), override: true });

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// ==============================
// 🧠 SESSION REDIS
// ==============================
// ----- Session + Redis (connect-redis v7 + redis v4) -----
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
});
redisClient.on('error', (err) => console.error('[Redis] Error', err));
await redisClient.connect(); // (ESM / Node 20+ : OK)

app.use(session({
  store: new RedisStore({
    client: redisClient,
    prefix: 'dash:',
  }),
  secret: process.env.SESSION_SECRET || 'change_me_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,          // mets true si tu es en HTTPS derrière un proxy
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 jours
  },
}));


// ==============================
// 🔑 AUTH DISCORD (PASSPORT)
// ==============================
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      callbackURL: process.env.OAUTH_REDIRECT,
      scope: ['identify', 'guilds'],
    },
    (accessToken, refreshToken, profile, done) => done(null, profile)
  )
);

app.use(passport.initialize());
app.use(passport.session());

// ==============================
// 🧩 MIDDLEWARES & VIEWS
// ==============================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// ==============================
// ⚙️ FONCTIONS UTILES
// ==============================
function requireAuth(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/login');
  next();
}

function userCanManageGuild(guilds, guildId) {
  return guilds.some(g => g.id === guildId && (g.permissions & 0x20) === 0x20);
}

// ==============================
// 🌍 ROUTES
// ==============================
app.get('/', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.redirect('/dashboard');
});

app.get('/login', passport.authenticate('discord'));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.render('index', { user: req.user });
});

// === Récupération des salons d’une guilde ===
app.get('/api/guild/:id/channels', requireAuth, async (req, res) => {
  const guildId = req.params.id;

  if (!userCanManageGuild(req.user.guilds, guildId))
    return res.status(403).json({ error: 'Accès refusé.' });

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN}` },
    });

    if (!response.ok) throw new Error('Erreur API Discord');

    const data = await response.json();
    const channels = data
      .filter(ch => ch.type === 0)
      .map(ch => ({ id: ch.id, name: ch.name }));

    res.json({ ok: true, channels });
  } catch (err) {
    console.error('Erreur récupération salons:', err);
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des salons.' });
  }
});

// ==============================
// 🚀 LANCEMENT DU SERVEUR
// ==============================
app.listen(PORT, () => {
  console.log(`🌐 Dashboard en ligne sur http://localhost:${PORT}`);
});

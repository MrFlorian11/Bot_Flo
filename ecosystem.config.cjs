// ecosystem.config.cjs
const path = require('path');
const dotenv = require('dotenv');

// Charge le .env à la racine du projet
dotenv.config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    {
      name: 'bot',
      cwd: './',                 // racine du repo
      script: 'src/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        DISCORD_TOKEN: process.env.DISCORD_TOKEN,
        CLIENT_ID: process.env.CLIENT_ID,
        GUILD_ID: process.env.GUILD_ID,
        EVENT_TZ: process.env.EVENT_TZ || 'Europe/Paris',
        AUTO_DEPLOY: process.env.AUTO_DEPLOY || 'true',
      },
      watch: false,
    },
    {
      name: 'dashboard',
      cwd: './dashboard',        // dossier dashboard
      script: 'server.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID,
        OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET,
        OAUTH_REDIRECT: process.env.OAUTH_REDIRECT || 'http://localhost:3000/auth/callback',
        SESSION_SECRET: process.env.SESSION_SECRET || 'change_me_secret',
        DASHBOARD_PORT: process.env.DASHBOARD_PORT || '3000',
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN,
      },
      watch: false,
    },
  ],
};

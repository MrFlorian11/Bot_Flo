module.exports = {
  apps: [
    {
      name: "bot",
      script: "src/index.js",
      cwd: "./",
      env: {
        NODE_ENV: "production",
        DISCORD_TOKEN: process.env.DISCORD_TOKEN,
        CLIENT_ID: process.env.CLIENT_ID,
        GUILD_ID: process.env.GUILD_ID,
        EVENT_TZ: "Europe/Paris",
        AUTO_DEPLOY: "true"
      }
    },
    {
      name: "dashboard",
      script: "server.js",
      cwd: "./dashboard",
      env: {
        NODE_ENV: "production",
        OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID,
        OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET,
        OAUTH_REDIRECT: process.env.OAUTH_REDIRECT,     // ex: http://localhost:3000/auth/callback
        SESSION_SECRET: process.env.SESSION_SECRET,
        DASHBOARD_PORT: "3000",
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN
      }
    }
  ]
};
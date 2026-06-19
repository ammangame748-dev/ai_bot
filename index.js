// ============================================================
//  🤖 Discord AI Bot + 🔥 Dashboard — All-in-One index.js
//  DeepSeek AI | Memory | Multi-Language | OAuth2 Dashboard
//  Optimized for Render.com Deployment
// ============================================================

const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActivityType } = require("discord.js");
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const OpenAI = require("openai");
const http = require("http");
const path = require("path");

// ─── CONFIG ──────────────────────────────────────────────────
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "YOUR_DISCORD_BOT_TOKEN",
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || "YOUR_DISCORD_CLIENT_ID",
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || "YOUR_DISCORD_CLIENT_SECRET",
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "sk-60a28d3519a5421a8862139f2772b1a7",
  DASHBOARD_PORT: process.env.PORT || 3000,
  DASHBOARD_URL: process.env.DASHBOARD_URL || "http://localhost:3000",
  SESSION_SECRET: process.env.SESSION_SECRET || "super-secret-dashboard-key-2025",
  MAX_MEMORY: 20,
};

// ─── DEEPSEEK CLIENT ─────────────────────────────────────────
const deepseek = new OpenAI({
  apiKey: CONFIG.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

// ─── DISCORD CLIENT ──────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─── IN-MEMORY STORAGE ───────────────────────────────────────
const userMemory = new Map();
const aiChannels = new Map();
const botStats = {
  messagesHandled: 0,
  startTime: Date.now(),
  errors: 0,
};

// ─── HELPER FUNCTIONS ────────────────────────────────────────
function getMemory(userId) {
  if (!userMemory.has(userId)) userMemory.set(userId, []);
  return userMemory.get(userId);
}

function addToMemory(userId, role, content) {
  const mem = getMemory(userId);
  mem.push({ role, content });
  if (mem.length > CONFIG.MAX_MEMORY * 2) mem.splice(0, 2);
}

function getUptime() {
  const ms = Date.now() - botStats.startTime;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

// ─── DISCORD EVENT HANDLERS ──────────────────────────────────
client.once("ready", () => {
  console.log(`\n✅ Bot is online: ${client.user.tag}`);
  console.log(`📊 Dashboard: ${CONFIG.DASHBOARD_URL}\n`);
  client.user.setActivity("🤖 AI Chat | /help", { type: ActivityType.Watching });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const guildId = message.guild?.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  const isAIChannel = !guildId || (aiChannels.has(guildId) && aiChannels.get(guildId).has(channelId));
  if (!isAIChannel) return;

  if (message.content.startsWith("!clear")) {
    userMemory.delete(userId);
    return message.reply("🧹 تم مسح ذاكرتي معك! نبدأ من جديد.");
  }

  const userText = message.content.trim();
  if (!userText) return;

  await message.channel.sendTyping();

  try {
    addToMemory(userId, "user", userText);
    const messages = [
      {
        role: "system",
        content: `أنت مساعد ذكاء اصطناعي ذكي وودود اسمك "NexusAI". 
قواعد مهمة:
1. تحدث دائماً بنفس لغة المستخدم تلقائياً
2. تذكر كل ما يخبرك به المستخدم في المحادثة
3. لا تذكر أنك DeepSeek، اسمك NexusAI`,
      },
      ...getMemory(userId),
    ];

    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages,
      max_tokens: 1000,
      temperature: 0.8,
    });

    const reply = response.choices[0].message.content;
    addToMemory(userId, "assistant", reply);
    botStats.messagesHandled++;

    if (reply.length > 1900) {
      const chunks = reply.match(/.{1,1900}/gs) || [];
      for (const chunk of chunks) await message.reply(chunk);
    } else {
      await message.reply(reply);
    }
  } catch (err) {
    botStats.errors++;
    console.error("AI Error:", err.message);
    await message.reply("⚠️ حدث خطأ مؤقت، حاول مرة ثانية!");
  }
});

// ════════════════════════════════════════════════════════════
//  🔥 EXPRESS DASHBOARD (Optimized for Render)
// ════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: CONFIG.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true, maxAge: 86400000 }, // secure: true for HTTPS
  })
);

// Render needs this if using secure cookies behind proxy
app.set('trust proxy', 1);

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/login");
}

// ─── Discord OAuth2 (Matching your Render settings) ───────────
app.get("/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: CONFIG.DISCORD_CLIENT_ID,
    redirect_uri: `${CONFIG.DASHBOARD_URL}/auth/discord/callback`,
    response_type: "code",
    scope: "identify guilds",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect("/login");

  try {
    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CONFIG.DISCORD_CLIENT_ID,
        client_secret: CONFIG.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${CONFIG.DASHBOARD_URL}/auth/discord/callback`,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token } = tokenRes.data;
    const [userRes, guildsRes] = await Promise.all([
      axios.get("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${access_token}` } }),
      axios.get("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${access_token}` } }),
    ]);

    const adminGuilds = guildsRes.data.filter((g) => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8));
    req.session.user = userRes.data;
    req.session.guilds = adminGuilds;
    res.redirect("/dashboard");
  } catch (err) {
    console.error("OAuth Error:", err.message);
    res.redirect("/login?error=auth_failed");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// ─── API ROUTES ──────────────────────────────────────────────
app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.session.user, guilds: req.session.guilds || [] }));
app.get("/api/stats", requireAuth, (req, res) => res.json({
  guilds: client.guilds.cache.size,
  users: client.users.cache.size,
  messagesHandled: botStats.messagesHandled,
  uptime: getUptime(),
  errors: botStats.errors,
  memoryUsers: userMemory.size,
  ping: client.ws.ping,
}));

app.get("/api/guild/:id/channels", requireAuth, async (req, res) => {
  const guild = client.guilds.cache.get(req.params.id);
  if (!guild) return res.json({ channels: [], error: "Bot not in this server" });
  const channels = guild.channels.cache.filter((c) => c.type === 0).map((c) => ({ id: c.id, name: c.name, category: c.parent?.name || "No Category" }));
  res.json({ channels });
});

app.post("/api/guild/:id/channel/toggle", requireAuth, async (req, res) => {
  const { channelId } = req.body;
  if (!aiChannels.has(req.params.id)) aiChannels.set(req.params.id, new Set());
  const set = aiChannels.get(req.params.id);
  const active = set.has(channelId) ? (set.delete(channelId), false) : (set.add(channelId), true);
  res.json({ active });
});

app.get("/api/guild/:id/active-channels", requireAuth, (req, res) => res.json({ activeChannels: [...(aiChannels.get(req.params.id) || [])] }));

// ─── HTML RENDERING ──────────────────────────────────────────
// (Same as before but keeping it clean)
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"><title>NexusAI — Login</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Orbitron:wght@700;900&display=swap');
  body { font-family: 'Cairo', sans-serif; background: #0a0a0f; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(124,58,237,0.3); border-radius: 24px; padding: 3rem; text-align: center; max-width: 400px; backdrop-filter: blur(20px); box-shadow: 0 0 60px rgba(124,58,237,0.2); }
  .logo { font-family: 'Orbitron', sans-serif; font-size: 2.5rem; font-weight: 900; background: linear-gradient(135deg, #7c3aed, #06b6d4, #f97316); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 2rem; }
  .login-btn { display: flex; align-items: center; justify-content: center; gap: 0.8rem; width: 100%; padding: 1rem; background: #5865f2; color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; text-decoration: none; transition: 0.3s; }
  .login-btn:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(88,101,242,0.4); }
</style>
</head>
<body>
<div class="card">
  <div class="logo">⚡ NexusAI</div>
  <a href="/login" class="login-btn">تسجيل الدخول بـ Discord</a>
</div>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"><title>NexusAI Dashboard 🔥</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Orbitron:wght@700;900&display=swap');
  :root { --primary: #7c3aed; --bg: #0a0a0f; --card: rgba(255,255,255,0.04); --border: rgba(124,58,237,0.3); }
  body { font-family: 'Cairo', sans-serif; background: var(--bg); color: #e2e8f0; margin: 0; }
  nav { height: 64px; background: rgba(10,10,15,0.8); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 2rem; }
  .layout { display: flex; min-height: calc(100vh - 64px); }
  aside { width: 250px; background: rgba(17,17,24,0.8); border-left: 1px solid var(--border); padding: 1rem; }
  main { flex: 1; padding: 2rem; }
  .guild-item { padding: 0.8rem; border-radius: 10px; cursor: pointer; margin-bottom: 0.5rem; transition: 0.2s; border: 1px solid transparent; }
  .guild-item:hover { background: rgba(124,58,237,0.1); }
  .guild-item.active { background: rgba(124,58,237,0.2); border-color: var(--primary); }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .stat-card { background: var(--card); border: 1px solid var(--border); padding: 1.5rem; border-radius: 16px; text-align: center; }
  .stat-value { font-family: 'Orbitron', sans-serif; font-size: 1.5rem; font-weight: 900; color: var(--primary); }
  .channel-item { display: flex; align-items: center; justify-content: space-between; padding: 1rem; background: rgba(255,255,255,0.02); border-radius: 12px; margin-bottom: 0.5rem; }
  .toggle { position: relative; width: 50px; height: 26px; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; inset: 0; background: #333; border-radius: 34px; transition: 0.4s; }
  .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background: white; border-radius: 50%; transition: 0.4s; }
  input:checked + .slider { background: var(--primary); }
  input:checked + .slider:before { transform: translateX(24px); }
</style>
</head>
<body>
<nav><div style="font-family:'Orbitron';font-weight:900;font-size:1.5rem">⚡ NexusAI</div><div id="userInfo"></div></nav>
<div class="layout">
  <aside id="guildList">جاري التحميل...</aside>
  <main id="mainContent"><h1>اختر سيرفر للبدء 🔥</h1></main>
</div>
<script>
async function loadData() {
  const res = await fetch('/api/me');
  const { user, guilds } = await res.json();
  document.getElementById('userInfo').textContent = user.username;
  document.getElementById('guildList').innerHTML = guilds.map(g => \`<div class="guild-item" onclick="selectGuild('\${g.id}', '\${g.name}')">\${g.name}</div>\`).join('');
}
async function selectGuild(id, name) {
  document.querySelectorAll('.guild-item').forEach(el => el.classList.remove('active'));
  event.currentTarget.classList.add('active');
  const statsRes = await fetch('/api/stats');
  const stats = await statsRes.json();
  const chRes = await fetch(\`/api/guild/\${id}/channels\`);
  const { channels } = await chRes.json();
  const acRes = await fetch(\`/api/guild/\${id}/active-channels\`);
  const { activeChannels } = await acRes.json();
  
  document.getElementById('mainContent').innerHTML = \`
    <h2>\${name}</h2>
    <div class="stats-grid">
      <div class="stat-card"><div>الرسائل</div><div class="stat-value">\${stats.messagesHandled}</div></div>
      <div class="stat-card"><div>البينج</div><div class="stat-value">\${stats.ping}ms</div></div>
    </div>
    <h3>رومات الـ AI</h3>
    \${channels.map(ch => \`
      <div class="channel-item">
        <span># \${ch.name}</span>
        <label class="toggle">
          <input type="checkbox" \${activeChannels.includes(ch.id) ? 'checked' : ''} onchange="toggleChannel('\${id}', '\${ch.id}')">
          <span class="slider"></span>
        </label>
      </div>
    \`).join('')}
  \`;
}
async function toggleChannel(gid, cid) {
  await fetch(\`/api/guild/\${gid}/channel/toggle\`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({channelId: cid}) });
}
loadData();
</script>
</body>
</html>`;

app.get("/", (req, res) => req.session.user ? res.redirect("/dashboard") : res.send(LOGIN_HTML));
app.get("/dashboard", requireAuth, (req, res) => res.send(DASHBOARD_HTML));

const server = http.createServer(app);
server.listen(CONFIG.DASHBOARD_PORT, () => console.log(`🔥 Dashboard running on port ${CONFIG.DASHBOARD_PORT}`));
client.login(CONFIG.DISCORD_TOKEN).catch(err => console.error("❌ Discord Login Error:", err.message));

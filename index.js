// ============================================================
//  🤖 NexusAI Bot — STABLE FREE EDITION (Groq + Axios)
//  Dashboard | Memory | Multi-Language | 100% Free
// ============================================================

const { Client, GatewayIntentBits, Partials, ActivityType } = require("discord.js");
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const http = require("http");

// ─── CONFIG ──────────────────────────────────────────────────
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DASHBOARD_PORT: process.env.PORT || 3000,
  DASHBOARD_URL: process.env.DASHBOARD_URL,
  SESSION_SECRET: process.env.SESSION_SECRET || "nexus-stable-secret",
  MAX_MEMORY: 15,
};

// ─── DISCORD CLIENT ──────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const userMemory = new Map();
const aiChannels = new Map();
const botStats = { messagesHandled: 0, startTime: Date.now(), errors: 0 };

// ─── HELPERS ─────────────────────────────────────────────────
function getMemory(userId) {
  if (!userMemory.has(userId)) userMemory.set(userId, []);
  return userMemory.get(userId);
}

function addToMemory(userId, role, content) {
  const mem = getMemory(userId);
  mem.push({ role, content });
  if (mem.length > CONFIG.MAX_MEMORY * 2) mem.splice(0, 2);
}

// ─── DISCORD HANDLERS ────────────────────────────────────────
client.once("ready", () => {
  console.log(`✅ Stable Free AI Bot Online: ${client.user.tag}`);
  client.user.setActivity("🤖 Free AI Chat", { type: ActivityType.Watching });
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
    return message.reply("🧹 تم مسح الذاكرة!");
  }

  await message.channel.sendTyping();

  try {
    addToMemory(userId, "user", message.content);
    
    // Direct Axios call to Groq (More stable on Render)
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "أنت مساعد ذكاء اصطناعي ذكي اسمك NexusAI. تحدث دائماً بلغة المستخدم وتذكر كل شيء يخبرك به." },
          ...getMemory(userId),
        ],
      },
      {
        headers: {
          "Authorization": `Bearer ${CONFIG.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 seconds timeout
      }
    );

    const reply = response.data.choices[0].message.content;
    addToMemory(userId, "assistant", reply);
    botStats.messagesHandled++;
    
    if (reply.length > 2000) {
      const chunks = reply.match(/.{1,1900}/gs) || [];
      for (const chunk of chunks) await message.reply(chunk);
    } else {
      await message.reply(reply);
    }
  } catch (err) {
    botStats.errors++;
    console.error("Groq API Error:", err.response?.data || err.message);
    message.reply("⚠️ خطأ في الاتصال بالذكاء الاصطناعي المجاني. تأكد من الـ API Key.");
  }
});

// ─── DASHBOARD (EXPRESS) ─────────────────────────────────────
const app = express();
app.use(express.json());
app.use(session({ secret: CONFIG.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: true } }));
app.set('trust proxy', 1);

app.get("/login", (req, res) => {
  const params = new URLSearchParams({ client_id: CONFIG.DISCORD_CLIENT_ID, redirect_uri: `${CONFIG.DASHBOARD_URL}/auth/discord/callback`, response_type: "code", scope: "identify guilds" });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const tokenRes = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({ client_id: CONFIG.DISCORD_CLIENT_ID, client_secret: CONFIG.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: `${CONFIG.DASHBOARD_URL}/auth/discord/callback` }));
    const { access_token } = tokenRes.data;
    const [userRes, guildsRes] = await Promise.all([
      axios.get("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${access_token}` } }),
      axios.get("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${access_token}` } }),
    ]);
    req.session.user = userRes.data;
    req.session.guilds = guildsRes.data.filter((g) => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8));
    res.redirect("/dashboard");
  } catch (err) { res.redirect("/login"); }
});

app.get("/api/me", (req, res) => res.json({ user: req.session.user, guilds: req.session.guilds || [] }));
app.get("/api/stats", (req, res) => res.json({ messages: botStats.messagesHandled, ping: client.ws.ping }));
app.get("/api/guild/:id/channels", (req, res) => {
  const guild = client.guilds.cache.get(req.params.id);
  res.json({ channels: guild ? guild.channels.cache.filter(c => c.type === 0).map(c => ({id:c.id, name:c.name})) : [] });
});
app.post("/api/guild/:id/channel/toggle", (req, res) => {
  if (!aiChannels.has(req.params.id)) aiChannels.set(req.params.id, new Set());
  const set = aiChannels.get(req.params.id);
  const active = set.has(req.body.channelId) ? (set.delete(req.body.channelId), false) : (set.add(req.body.channelId), true);
  res.json({ active });
});

app.get("/", (req, res) => req.session.user ? res.redirect("/dashboard") : res.send('<body style="background:#0a0a0f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><div style="text-align:center"><h1>⚡ NexusAI Stable Free</h1><a href="/login" style="background:#5865f2;color:#fff;padding:15px 30px;border-radius:10px;text-decoration:none;font-weight:bold">تسجيل الدخول بـ Discord</a></div></body>'));
app.get("/dashboard", (req, res) => req.session.user ? res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>NexusAI Stable Dashboard</title>
<style>body{font-family:sans-serif;background:#0a0a0f;color:#fff;display:flex;min-height:100vh;margin:0}aside{width:250px;background:#111;padding:1rem;border-left:1px solid #333}main{flex:1;padding:2rem}.guild{padding:10px;cursor:pointer;border-radius:5px;margin-bottom:5px}.guild:hover{background:#222}.active{background:#7c3aed !important}</style>
</head>
<body>
<aside id="gList">جاري التحميل...</aside>
<main id="main"><h1>اختر سيرفر 🔥 (Stable Free)</h1></main>
<script>
async function load(){
  const r = await fetch('/api/me'); const {user, guilds} = await r.json();
  document.getElementById('gList').innerHTML = guilds.map(g => \`<div class="guild" onclick="sel('\${g.id}', '\${g.name}')">\${g.name}</div>\`).join('');
}
async function sel(id, name){
  const r = await fetch(\`/api/guild/\${id}/channels\`); const {channels} = await r.json();
  document.getElementById('main').innerHTML = \`<h2>\${name}</h2>\` + channels.map(c => \`<div style="display:flex;justify-content:space-between;padding:10px;background:#111;margin:5px">\${c.name} <button onclick="tog('\${id}','\${c.id}')">تفعيل/تعطيل</button></div>\`).join('');
}
async function tog(gid, cid){ await fetch(\`/api/guild/\${gid}/channel/toggle\`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channelId:cid})}); alert('تم التحديث!'); }
load();
</script>
</body></html>`) : res.redirect("/"));

http.createServer(app).listen(CONFIG.DASHBOARD_PORT, () => console.log("🔥 Stable Free Dashboard Ready"));
client.login(CONFIG.DISCORD_TOKEN);

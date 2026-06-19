// ============================================================
//  🤖 NexusAI Bot — PRO VISION & CHAT EDITION
//  Main: Llama 3.3 70B (Ultra Smart) | Vision: Llama 3.2
//  Dashboard | Memory | Multi-Language | 100% Free
// ============================================================

const { Client, GatewayIntentBits, Partials, ActivityType } = require("discord.js");
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const http = require("http");

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DASHBOARD_PORT: process.env.PORT || 3000,
  DASHBOARD_URL: process.env.DASHBOARD_URL,
  SESSION_SECRET: process.env.SESSION_SECRET || "nexus-pro-secret",
  MAX_MEMORY: 15,
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message],
});

const userMemory = new Map();
const aiChannels = new Map();
const botStats = { messagesHandled: 0, errors: 0 };

// ─── AI MODELS ───────────────────────────────────────────────
const POWERFUL_CHAT_MODEL = "llama-3.3-70b-versatile"; // The Smartest
const VISION_MODEL = "llama-3.2-11b-vision-preview";   // The Eyes
const FALLBACK_MODEL = "llama-3.1-70b-versatile";

async function getAIResponse(messages, imageUrl = null) {
  // Use Vision model if there's an image, otherwise use the Powerful Chat model
  const model = imageUrl ? VISION_MODEL : POWERFUL_CHAT_MODEL;
  
  try {
    const payload = {
      model: model,
      messages: [
        { role: "system", content: "أنت مساعد ذكي جداً اسمك NexusAI. تستخدم أقوى الموديلات للرد. تحدث بلغة المستخدم دائماً." },
        ...messages
      ]
    };

    if (imageUrl) {
      const lastMsg = payload.messages[payload.messages.length - 1];
      lastMsg.content = [
        { type: "text", text: lastMsg.content },
        { type: "image_url", image_url: { url: imageUrl } }
      ];
    }

    const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", payload, {
      headers: { "Authorization": `Bearer ${CONFIG.GROQ_API_KEY}`, "Content-Type": "application/json" },
      timeout: 30000
    });
    return res.data.choices[0].message.content;
  } catch (err) {
    // If the powerful model is busy, try the fallback
    if (!imageUrl && err.response?.status === 503) {
       console.log("⚠️ Main model busy, trying fallback...");
       const fallbackPayload = { model: FALLBACK_MODEL, messages: [{role:"system", content:"smart assistant"}, ...messages] };
       const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", fallbackPayload, {
         headers: { "Authorization": `Bearer ${CONFIG.GROQ_API_KEY}`, "Content-Type": "application/json" }
       });
       return res.data.choices[0].message.content;
    }
    throw err;
  }
}

// ─── DISCORD ─────────────────────────────────────────────────
client.once("ready", () => {
  console.log(`✅ Pro AI Bot Online: ${client.user.tag}`);
  client.user.setActivity("🧠 Llama 3.3 70B | 👁️ Vision", { type: ActivityType.Watching });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const isAI = !message.guild || (aiChannels.get(message.guild.id)?.has(message.channel.id));
  if (!isAI) return;

  if (message.content === "!clear") { userMemory.delete(message.author.id); return message.reply("🧹 تم مسح الذاكرة!"); }

  const image = message.attachments.find(a => a.contentType?.startsWith("image/"));
  const userText = message.content || (image ? "ماذا ترى في هذه الصورة؟" : "");
  if (!userText && !image) return;

  await message.channel.sendTyping();
  try {
    const mem = userMemory.get(message.author.id) || [];
    mem.push({ role: "user", content: userText });
    
    const reply = await getAIResponse(mem, image?.url);
    
    mem.push({ role: "assistant", content: reply });
    if (mem.length > CONFIG.MAX_MEMORY * 2) mem.splice(0, 2);
    userMemory.set(message.author.id, mem);
    
    botStats.messagesHandled++;
    message.reply(reply.length > 2000 ? reply.substring(0, 1990) + "..." : reply);
  } catch (err) {
    botStats.errors++;
    console.error("AI Error:", err.response?.data || err.message);
    message.reply("⚠️ السيرفر مضغوط حالياً، جرب كمان شوي!");
  }
});

// ─── DASHBOARD (Simplified & Fast) ───────────────────────────
const app = express();
app.use(express.json());
app.use(session({ secret: CONFIG.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: true } }));
app.set('trust proxy', 1);

app.get("/login", (req, res) => {
  const p = new URLSearchParams({ client_id: CONFIG.DISCORD_CLIENT_ID, redirect_uri: `${CONFIG.DASHBOARD_URL}/auth/discord/callback`, response_type: "code", scope: "identify guilds" });
  res.redirect(`https://discord.com/api/oauth2/authorize?${p}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  try {
    const t = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({ client_id: CONFIG.DISCORD_CLIENT_ID, client_secret: CONFIG.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code: req.query.code, redirect_uri: `${CONFIG.DASHBOARD_URL}/auth/discord/callback` }));
    const u = await axios.get("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${t.data.access_token}` } });
    const g = await axios.get("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${t.data.access_token}` } });
    req.session.user = u.data;
    req.session.guilds = g.data.filter(x => (BigInt(x.permissions) & BigInt(0x8)) === BigInt(0x8));
    res.redirect("/dashboard");
  } catch (e) { res.redirect("/login"); }
});

app.get("/api/me", (req, res) => res.json({ user: req.session.user, guilds: req.session.guilds || [] }));
app.get("/api/guild/:id/channels", (req, res) => {
  const g = client.guilds.cache.get(req.params.id);
  res.json({ channels: g ? g.channels.cache.filter(c => c.type === 0).map(c => ({id:c.id, name:c.name})) : [] });
});
app.post("/api/guild/:id/channel/toggle", (req, res) => {
  if (!aiChannels.has(req.params.id)) aiChannels.set(req.params.id, new Set());
  const s = aiChannels.get(req.params.id);
  const a = s.has(req.body.channelId) ? (s.delete(req.body.channelId), false) : (s.add(req.body.channelId), true);
  res.json({ active: a });
});

app.get("/", (req, res) => req.session.user ? res.redirect("/dashboard") : res.send('<body style="background:#0a0a0f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><div style="text-align:center"><h1>🧠 NexusAI Pro</h1><p>Llama 3.3 70B + Vision</p><br><a href="/login" style="background:#5865f2;color:#fff;padding:15px 30px;border-radius:10px;text-decoration:none;font-weight:bold">Login with Discord</a></div></body>'));
app.get("/dashboard", (req, res) => res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>NexusAI Pro Dashboard</title>
<style>body{font-family:sans-serif;background:#0a0a0f;color:#fff;display:flex;margin:0}aside{width:250px;background:#111;padding:1rem;height:100vh}main{flex:1;padding:2rem}.g{padding:10px;cursor:pointer;margin-bottom:5px;background:#222;border-radius:5px}</style>
</head>
<body>
<aside id="L">Loading...</aside><main id="M"><h1>Pro Dashboard 🔥</h1></main>
<script>
async function load(){
  const r = await fetch('/api/me'); const {user, guilds} = await r.json();
  document.getElementById('L').innerHTML = guilds.map(g => \`<div class="g" onclick="sel('\${g.id}', '\${g.name}')">\${g.name}</div>\`).join('');
}
async function sel(id, name){
  const r = await fetch(\`/api/guild/\${id}/channels\`); const {channels} = await r.json();
  document.getElementById('M').innerHTML = \`<h2>\${name}</h2>\` + channels.map(c => \`<div style="display:flex;justify-content:space-between;padding:10px;background:#111;margin:5px">\${c.name} <button onclick="tog('\${id}','\${c.id}')">Toggle AI</button></div>\`).join('');
}
async function tog(gid, cid){ await fetch(\`/api/guild/\${gid}/channel/toggle\`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channelId:cid})}); alert('Done!'); }
load();
</script>
</body></html>`));

http.createServer(app).listen(CONFIG.DASHBOARD_PORT, () => console.log("🔥 Pro Dashboard Ready"));
client.login(CONFIG.DISCORD_TOKEN);

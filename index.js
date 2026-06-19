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
  SESSION_SECRET: process.env.SESSION_SECRET || "nexus-fire-dashboard",
  MAX_MEMORY: 15,
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message],
});

const userMemory = new Map();
const aiChannels = new Map();
const botStats = { messagesHandled: 0, errors: 0 };

const PRIMARY_MODEL = "llama-3.1-8b-instant";
const VISION_MODEL = "llama-3.2-11b-vision-preview";
const FALLBACK_MODELS = ["llama3-8b-8192", "gemma2-9b-it"];

async function getAIResponse(messages, imageUrl = null, attempt = 0) {
  const model = imageUrl ? VISION_MODEL : (attempt === 0 ? PRIMARY_MODEL : FALLBACK_MODELS[attempt - 1]);
  if (!model) throw new Error("All models exhausted.");
  try {
    const payload = { model, messages: [{ role: "system", content: "أنت مساعد ذكي وسريع اسمك NexusAI." }, ...messages] };
    if (imageUrl) {
      const lastMsg = payload.messages[payload.messages.length - 1];
      lastMsg.content = [{ type: "text", text: lastMsg.content }, { type: "image_url", image_url: { url: imageUrl } }];
    }
    const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", payload, {
      headers: { "Authorization": `Bearer ${CONFIG.GROQ_API_KEY}`, "Content-Type": "application/json" },
      timeout: 20000
    });
    return res.data.choices[0].message.content;
  } catch (err) {
    if (!imageUrl && attempt < FALLBACK_MODELS.length) return getAIResponse(messages, null, attempt + 1);
    throw err;
  }
}

client.once("ready", () => console.log(`✅ NexusAI Fire Bot Online: ${client.user.tag}`));
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const isAI = !message.guild || (aiChannels.get(message.guild.id)?.has(message.channel.id));
  if (!isAI) return;
  if (message.content === "!clear") { userMemory.delete(message.author.id); return message.reply("🧹 تم!"); }
  const image = message.attachments.find(a => a.contentType?.startsWith("image/"));
  const userText = message.content || (image ? "ماذا ترى؟" : "");
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
  } catch (err) { message.reply("⚠️ السيرفر مضغوط!"); }
});

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

// ─── DASHBOARD HTML (FIRE DESIGN) ────────────────────────────
const HTML_HEAD = `
<head>
  <meta charset="UTF-8">
  <title>NexusAI — Fire Dashboard</title>
  <style>
    :root { --p: #ff4d4d; --s: #1a1a2e; --g: linear-gradient(135deg, #ff4d4d, #f9cb28); }
    body { margin: 0; font-family: 'Segoe UI', sans-serif; background: var(--s); color: #fff; overflow-x: hidden; }
    .particles { position: fixed; width: 100%; height: 100%; z-index: -1; background: radial-gradient(circle at center, #252545 0%, #0a0a0f 100%); }
    .particles span { position: absolute; display: block; width: 2px; height: 2px; background: #fff; opacity: 0.2; animation: move 20s linear infinite; }
    @keyframes move { from { transform: translateY(0); } to { transform: translateY(-100vh); } }
    
    .nav { background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; z-index: 100; }
    .logo { font-size: 1.8rem; font-weight: 900; background: var(--g); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 10px rgba(255,77,77,0.5)); }
    
    .container { display: flex; min-height: calc(100vh - 70px); }
    .sidebar { width: 300px; background: rgba(255,255,255,0.03); border-right: 1px solid rgba(255,255,255,0.05); padding: 2rem 1rem; }
    .content { flex: 1; padding: 3rem; animation: fadeIn 0.5s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    
    .guild-card { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-bottom: 12px; cursor: pointer; transition: all 0.3s; border: 1px solid transparent; display: flex; align-items: center; gap: 15px; }
    .guild-card:hover { background: rgba(255,255,255,0.1); border-color: var(--p); transform: scale(1.02); box-shadow: 0 0 20px rgba(255,77,77,0.2); }
    .guild-card.active { background: var(--g); color: #000; font-weight: bold; box-shadow: 0 0 30px rgba(255,77,77,0.4); }
    
    .channel-row { background: rgba(255,255,255,0.03); padding: 20px; border-radius: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.05); transition: 0.3s; }
    .channel-row:hover { background: rgba(255,255,255,0.07); }
    
    .btn { background: var(--g); border: none; padding: 10px 20px; border-radius: 8px; color: #000; font-weight: bold; cursor: pointer; transition: 0.3s; text-transform: uppercase; letter-spacing: 1px; }
    .btn:hover { transform: translateY(-3px); box-shadow: 0 5px 15px rgba(255,77,77,0.4); }
    .btn-off { background: #444; color: #fff; }
    
    .hero { text-align: center; margin-top: 10vh; }
    .hero h1 { font-size: 4rem; margin: 0; background: var(--g); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { font-size: 1.2rem; opacity: 0.7; }
  </style>
</head>`;

app.get("/", (req, res) => res.send(`
  <html>${HTML_HEAD}<body>
    <div class="particles">${'<span></span>'.repeat(50)}</div>
    <div class="hero">
      <h1>NEXUS AI</h1>
      <p>أقوى بوت ذكاء اصطناعي في ديسكورد — ناري، شراري، أسطوري 🔥</p><br>
      <a href="/login"><button class="btn" style="padding: 20px 50px; font-size: 1.2rem;">دخول السيطرة 🚀</button></a>
    </div>
  </body></html>`));

app.get("/dashboard", (req, res) => {
  if(!req.session.user) return res.redirect("/");
  res.send(`
  <html>${HTML_HEAD}<body>
    <div class="particles">${'<span></span>'.repeat(50)}</div>
    <nav class="nav">
      <div class="logo">NEXUS PANEL</div>
      <div style="display:flex;align-items:center;gap:15px">
        <span>أهلاً، \${req.session.user.username}</span>
        <img src="https://cdn.discordapp.com/avatars/\${req.session.user.id}/\${req.session.user.avatar}.png" style="width:40px;border-radius:50%;border:2px solid var(--p)">
      </div>
    </nav>
    <div class="container">
      <aside class="sidebar" id="guildList">جاري تحميل السيرفرات...</aside>
      <main class="content" id="mainContent">
        <div style="text-align:center;margin-top:20vh">
          <h2 style="font-size:3rem">اختر سيرفرك 🔥</h2>
          <p>ابدأ بتفعيل القوة الخارقة في غرف الدردشة</p>
        </div>
      </main>
    </div>
    <script>
      async function load(){
        const r = await fetch('/api/me'); const {guilds} = await r.json();
        document.getElementById('guildList').innerHTML = guilds.map(g => \`
          <div class="guild-card" id="g-\${g.id}" onclick="sel('\${g.id}', '\${g.name}')">
            <img src="\${g.icon ? 'https://cdn.discordapp.com/icons/'+g.id+'/'+g.icon+'.png' : 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:40px;border-radius:8px">
            <span>\${g.name}</span>
          </div>\`).join('');
      }
      async function sel(id, name){
        document.querySelectorAll('.guild-card').forEach(el => el.classList.remove('active'));
        document.getElementById('g-'+id).classList.add('active');
        document.getElementById('mainContent').innerHTML = '<h2>جاري تحميل الغرف...</h2>';
        const r = await fetch(\`/api/guild/\${id}/channels\`); const {channels} = await r.json();
        document.getElementById('mainContent').innerHTML = \`
          <h1 style="margin-bottom:2rem">إدارة: \${name} 🔥</h1>
          <div style="display:grid;gap:15px">\` + 
          channels.map(c => \`
            <div class="channel-row">
              <span style="font-size:1.2rem;font-weight:bold"># \${c.name}</span>
              <button class="btn" id="btn-\${c.id}" onclick="tog('\${id}','\${c.id}')">تفعيل الذكاء</button>
            </div>\`).join('') + '</div>';
      }
      async function tog(gid, cid){
        const r = await fetch(\`/api/guild/\${gid}/channel/toggle\`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channelId:cid})});
        const {active} = await r.json();
        const btn = document.getElementById('btn-'+cid);
        btn.innerText = active ? 'إيقاف الذكاء' : 'تفعيل الذكاء';
        btn.className = active ? 'btn btn-off' : 'btn';
      }
      load();
    </script>
  </body></html>`);
});

http.createServer(app).listen(CONFIG.DASHBOARD_PORT, () => console.log("🔥 Fire Dashboard Ready"));
client.login(CONFIG.DISCORD_TOKEN);

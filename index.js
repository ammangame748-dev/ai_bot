require("dotenv").config();
const { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder } = require("discord.js");
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const http = require("http");
const Datastore = require("nedb");
const fs = require("fs");

// --- Configuration ---
const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DASHBOARD_PORT: process.env.PORT || 3000,
  DASHBOARD_URL: process.env.DASHBOARD_URL || `http://localhost:${process.env.PORT || 3000}`,
  SESSION_SECRET: process.env.SESSION_SECRET || "super-secret-nexus-key",
  MAX_MEMORY_MESSAGES: 15, // Max messages to keep in memory per user
  PRIMARY_MODEL: "llama-3.1-8b-instant", // سريع وذكي ومتوازن
  FALLBACK_MODELS: ["gemma2-9b-it", "llama-3.3-70b-versatile"],
  SYSTEM_PROMPT: "أنت مساعد ذكي وسريع اسمك NexusAI. مبرمجك هو 'أبو الحس' (إذا سألك أحد من برمجك أو من صنعك، أجب دائماً بأنه أبو الحس). حصرياً وفقط إذا سألك أحد بشكل مباشر عن (ما جستس، ما هو سيرفر جستس، ما هو سيرفر العدالة، ما هو Justice City، ما هو أفضل سيرفر فايف ام عربي، ما هو السيرفر المتصدر، ما هو جستس سيتي)، أجب حصراً بهذه الصيغة: 'سيرفر Justice City RP هو سيرفر يمتاز بالتفوق في كل المجالات، حيث يتصدر في الأنظمة والإدارة والواقعية، ويُعتبر السيرفر رقم 1 من حيث التطور التقني والاحترافية. يُقدم تجربة لعب متقدمة ومتطورة، مما يجعله خياراً مثاليًا للأشخاص الذين يبحثون عن سيرفر يتميز بالجودة العالية.' يمنع ذكر هذه المعلومة في أي سياق آخر ما لم يتم السؤال عنها بهذه الكلمات. تحدث باللغة العربية بأسلوب ذكي، طبيعي، وصحيح تماماً. تجنب الأخطاء الإملائية الشائعة واحرص على أن تكون جملك مترابطة ومفهومة. كن مساعداً ذكياً ولبقاً في حوارك.",
};

// --- Database Setup (NeDB) ---
// Ensure data directory exists
fs.mkdirSync("./data", { recursive: true });

const usersDB = new Datastore({ filename: "./data/users.db", autoload: true });
const channelsDB = new Datastore({ filename: "./data/channels.db", autoload: true });
const configDB = new Datastore({ filename: "./data/config.db", autoload: true });

// Promisify NeDB methods for easier async/await usage
const dbFindOne = (db, query) => new Promise((resolve, reject) => db.findOne(query, (err, doc) => err ? reject(err) : resolve(doc)));
const dbFind = (db, query) => new Promise((resolve, reject) => db.find(query, (err, docs) => err ? reject(err) : resolve(docs)));
const dbInsert = (db, doc) => new Promise((resolve, reject) => db.insert(doc, (err, newDoc) => err ? reject(err) : resolve(newDoc)));
const dbUpdate = (db, query, update, options = {}) => new Promise((resolve, reject) => db.update(query, update, options, (err, numReplaced) => err ? reject(err) : resolve(numReplaced)));
const dbRemove = (db, query, options = {}) => new Promise((resolve, reject) => db.remove(query, options, (err, numRemoved) => err ? reject(err) : resolve(numRemoved)));

// Initialize default config if not exists
(async () => {
  try {
    let globalConfig = await dbFindOne(configDB, { _id: "global_config" });
    if (!globalConfig) {
      globalConfig = await dbInsert(configDB, { _id: "global_config", primaryModel: CONFIG.PRIMARY_MODEL, fallbackModels: CONFIG.FALLBACK_MODELS, systemPrompt: CONFIG.SYSTEM_PROMPT, maxMemoryMessages: CONFIG.MAX_MEMORY_MESSAGES });
      console.log("Default global config initialized.");
    }
    // Ensure CONFIG values are updated from DB on startup
    CONFIG.PRIMARY_MODEL = globalConfig.primaryModel;
    CONFIG.FALLBACK_MODELS = globalConfig.fallbackModels;
    CONFIG.SYSTEM_PROMPT = globalConfig.systemPrompt;
    CONFIG.MAX_MEMORY_MESSAGES = globalConfig.maxMemoryMessages;
  } catch (err) {
    console.error("Error initializing global config:", err);
  }
})();

// --- Discord Client ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message],
});

const botStats = { messagesHandled: 0, errors: 0, uptime: new Date() };

// --- AI Response Function ---
async function getAIResponse(messages, attempt = 0) {
  const globalConfig = await dbFindOne(configDB, { _id: "global_config" }) || CONFIG;

  const model = attempt === 0 ? globalConfig.primaryModel : globalConfig.fallbackModels[attempt - 1];
  if (!model) throw new Error("All models exhausted.");

  try {
    const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
      model,
      temperature: 0.7, // توازن بين الذكاء والدقة اللغوية
      top_p: 0.9,
      messages: [
        { role: "system", content: globalConfig.systemPrompt },
        ...messages
      ]
    }, {
      headers: { "Authorization": `Bearer ${CONFIG.GROQ_API_KEY}`, "Content-Type": "application/json" },
      timeout: 30000 // Increased timeout
    });
    return res.data.choices[0].message.content;
  } catch (err) {
    console.error(`AI Error with model ${model}:`, err.response?.data || err.message);
    if (attempt < globalConfig.fallbackModels.length) {
      // Implement exponential backoff for retries
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      return getAIResponse(messages, attempt + 1);
    }
    throw err;
  }
}

// --- Discord Events ---
client.once("ready", async () => {
  console.log(`✅ NexusAI Text-Only Bot Online: ${client.user.tag}`);
  client.user.setActivity("مراقبة السيرفرات 🔥", { type: ActivityType.Watching });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  try {
    const channelSettings = await dbFindOne(channelsDB, { guildId: message.guild.id, channelId: message.channel.id });
    const isAIChannel = channelSettings && channelSettings.isActive;
    if (!isAIChannel) return;

    const globalConfig = await dbFindOne(configDB, { _id: "global_config" }) || CONFIG;

    // Clear user memory command
    if (message.content === "!clear") {
      await dbRemove(usersDB, { userId: message.author.id }, { multi: true });
      message.reply("🧹 تم مسح ذاكرتك بنجاح!");
      return;
    }

    await message.channel.sendTyping();

    let userDoc = await dbFindOne(usersDB, { userId: message.author.id });
    let userMessages = userDoc ? userDoc.messages : [];

    userMessages.push({ role: "user", content: message.content });

    // Trim memory if it exceeds MAX_MEMORY_MESSAGES
    if (userMessages.length > globalConfig.maxMemoryMessages * 2) {
      userMessages = userMessages.slice(userMessages.length - globalConfig.maxMemoryMessages * 2);
    }

    const replyContent = await getAIResponse(userMessages);
    userMessages.push({ role: "assistant", content: replyContent });

    await dbUpdate(usersDB, { userId: message.author.id }, { $set: { messages: userMessages } }, { upsert: true });

    botStats.messagesHandled++;

    const embed = new EmbedBuilder()
      .setColor("#ff4d4d")
      .setDescription(replyContent.length > 4000 ? replyContent.substring(0, 3990) + "..." : replyContent)
      .setFooter({ text: `Powered by NexusAI | Model: ${globalConfig.primaryModel}` });

    message.reply({ embeds: [embed] });

  } catch (err) {
    console.error("AI Error during message processing:", err);
    botStats.errors++;
    message.reply("⚠️ السيرفر مضغوط أو حدث خطأ في الاتصال! حاول مرة أخرى.");
  }
});

// --- Express Dashboard ---
const app = express();
app.use(express.json());
app.use(session({
  secret: CONFIG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));
app.set("trust proxy", 1);

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
}

app.get("/login", (req, res) => {
  const p = new URLSearchParams({ client_id: CONFIG.DISCORD_CLIENT_ID, redirect_uri: `${CONFIG.DASHBOARD_URL}/auth/discord/callback`, response_type: "code", scope: "identify guilds" });
  res.redirect(`https://discord.com/api/oauth2/authorize?${p}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  try {
    const tokenResponse = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({
      client_id: CONFIG.DISCORD_CLIENT_ID,
      client_secret: CONFIG.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: req.query.code,
      redirect_uri: `${CONFIG.DASHBOARD_URL}/auth/discord/callback`
    }));

    const userResponse = await axios.get("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` } });
    const guildsResponse = await axios.get("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` } });

    req.session.user = userResponse.data;
    // Filter for guilds where the user has 'MANAGE_GUILD' permission (0x8)
    req.session.guilds = guildsResponse.data.filter(x => (BigInt(x.permissions) & BigInt(0x8)) === BigInt(0x8));
    res.redirect("/dashboard");
  } catch (e) {
    console.error("Discord OAuth Error:", e.response?.data || e.message);
    res.redirect("/login");
  }
});

app.get("/api/me", isAuthenticated, (req, res) => res.json({ user: req.session.user, guilds: req.session.guilds || [] }));

app.get("/api/guild/:id/channels", isAuthenticated, async (req, res) => {
  const guildId = req.params.id;
  const guild = client.guilds.cache.get(guildId);

  if (!guild) return res.json({ channels: [] });

  try {
    const activeChannelsDocs = await dbFind(channelsDB, { guildId: guildId });
    const activeChannels = new Set(activeChannelsDocs.map(d => d.channelId));

    const channels = guild.channels.cache
      .filter(c => c.type === 0) // Text channels
      .map(c => ({
        id: c.id,
        name: c.name,
        isActive: activeChannels.has(c.id)
      }));

    res.json({ channels });
  } catch (err) {
    console.error("Error fetching guild channels:", err);
    res.status(500).json({ error: "Failed to fetch channels" });
  }
});

app.post("/api/guild/:id/channel/toggle", isAuthenticated, async (req, res) => {
  const guildId = req.params.id;
  const channelId = req.body.channelId;

  try {
    let doc = await dbFindOne(channelsDB, { guildId, channelId });

    let isActive;
    if (doc) {
      isActive = !doc.isActive;
      await dbUpdate(channelsDB, { guildId, channelId }, { $set: { isActive } });
    } else {
      isActive = true;
      await dbInsert(channelsDB, { guildId, channelId, isActive });
    }
    res.json({ active: isActive });
  } catch (err) {
    console.error("Error toggling channel:", err);
    res.status(500).json({ error: "Failed to toggle channel" });
  }
});

app.get("/api/config", isAuthenticated, async (req, res) => {
  try {
    const globalConfig = await dbFindOne(configDB, { _id: "global_config" }) || CONFIG;
    res.json(globalConfig);
  } catch (err) {
    console.error("Error fetching config:", err);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

app.post("/api/config", isAuthenticated, async (req, res) => {
  const { primaryModel, fallbackModels, systemPrompt, maxMemoryMessages } = req.body;
  try {
    await dbUpdate(configDB, { _id: "global_config" }, { $set: { primaryModel, fallbackModels, systemPrompt, maxMemoryMessages } }, { upsert: true });
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating config:", err);
    res.status(500).json({ error: "Failed to update config" });
  }
});

app.get("/api/stats", isAuthenticated, (req, res) => {
  const uptimeSeconds = Math.floor((new Date() - botStats.uptime) / 1000);
  const uptimeString = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;
  res.json({ ...botStats, uptime: uptimeString, discordGuilds: client.guilds.cache.size });
});

// --- Dashboard HTML ---
const HTML_HEAD = `
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NexusAI — لوحة التحكم</title>
  <style>
    :root { --p: #ff4d4d; --s: #1a1a2e; --off: #2ecc71; --on: #e74c3c; --bg-light: #252545; --text-color: #fff; --border-color: rgba(255,255,255,0.1); }
    body { margin: 0; font-family: 'Segoe UI', sans-serif; background: var(--s); color: var(--text-color); overflow-x: hidden; }
    .particles { position: fixed; width: 100%; height: 100%; z-index: -1; background: radial-gradient(circle at center, var(--bg-light) 0%, #0a0a0f 100%); }
    .particles span { position: absolute; display: block; width: 2px; height: 2px; background: #fff; opacity: 0.2; animation: move 20s linear infinite; }
    @keyframes move { from { transform: translateY(0); } to { transform: translateY(-100vh); } }
    .nav { background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; z-index: 100; }
    .logo { font-size: 1.8rem; font-weight: 900; background: linear-gradient(135deg, #ff4d4d, #f9cb28); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 10px rgba(255,77,77,0.5)); }
    .container { display: flex; min-height: calc(100vh - 70px); }
    .sidebar { width: 300px; background: rgba(255,255,255,0.03); border-right: 1px solid var(--border-color); padding: 2rem 1rem; overflow-y: auto; min-height: calc(100vh - 70px); }
    .content { flex: 1; padding: 3rem; animation: fadeIn 0.5s ease; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .guild-card { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-bottom: 12px; cursor: pointer; transition: 0.3s; display: flex; align-items: center; gap: 15px; }
    .guild-card:hover { background: rgba(255,255,255,0.1); transform: scale(1.02); }
    .guild-card.active { border: 1px solid var(--p); box-shadow: 0 0 20px rgba(255,77,77,0.2); }
    .channel-row, .config-section { background: rgba(255,255,255,0.03); padding: 20px; border-radius: 15px; margin-bottom: 15px; border: 1px solid var(--border-color); }
    .channel-row { display: flex; justify-content: space-between; align-items: center; }
    .btn { border: none; padding: 12px 25px; border-radius: 8px; color: #fff; font-weight: bold; cursor: pointer; transition: 0.3s; text-transform: uppercase; }
    .btn-active { background: var(--on); box-shadow: 0 0 15px rgba(231,76,60,0.4); } /* RED when active */
    .btn-inactive { background: var(--off); box-shadow: 0 0 15px rgba(46,204,113,0.4); } /* GREEN when inactive */
    .btn:hover { transform: translateY(-3px); filter: brightness(1.2); }
    .form-group { margin-bottom: 15px; }
    .form-group input[type="text"], .form-group textarea, .form-group select { width: 100%; padding: 10px; border-radius: 5px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.05); color: var(--text-color); box-sizing: border-box; }
    .form-group textarea { min-height: 100px; resize: vertical; }
    .save-btn { background: #007bff; margin-top: 20px; }
    .save-btn:hover { background: #0056b3; }
    .tab-button { background: rgba(255,255,255,0.1); border: none; padding: 10px 20px; cursor: pointer; margin-right: 5px; border-radius: 5px 5px 0 0; color: var(--text-color); }
    .tab-button.active { background: var(--p); }
    .tab-content { border: 1px solid var(--border-color); border-top: none; padding: 20px; border-radius: 0 0 15px 15px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
    .stat-card { background: rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; text-align: center; }
    .stat-card h3 { margin-top: 0; color: var(--p); }
    .stat-card p { font-size: 1.5rem; font-weight: bold; }
  </style>
</head>`;

app.get("/", (req, res) => res.send(`<html>${HTML_HEAD}<body><div class="particles">${"<span></span>".repeat(50)}</div><div style="text-align:center;margin-top:20vh"><h1>NEXUS AI PRO</h1><p>الدردشة النصية الخارقة 🔥</p><br><a href="/login"><button class="btn btn-inactive" style="padding:20px 50px">دخول لوحة التحكم 🚀</button></a></div></body></html>`));

app.get("/dashboard", isAuthenticated, (req, res) => {
  res.send(`<html>${HTML_HEAD}<body><div class="particles">${"<span></span>".repeat(50)}</div>
    <nav class="nav"><div class="logo">NEXUS PANEL</div><div>أهلاً، ${req.session.user.username}</div></nav>
    <div class="container">
      <aside class="sidebar" id="guildList">Loading...</aside>
      <main class="content" id="mainContent">
        <div class="tabs">
          <button class="tab-button active" onclick="showTab('channels')">إدارة القنوات</button>
          <button class="tab-button" onclick="showTab('config')">إعدادات الذكاء الاصطناعي</button>
          <button class="tab-button" onclick="showTab('stats')">إحصائيات البوت</n          </button>
        </div>
        <div id="channelsTab" class="tab-content">
          <div style="text-align:center;margin-top:20vh"><h2>اختر سيرفرك 🔥</h2></div>
        </div>
        <div id="configTab" class="tab-content" style="display:none;">
          <h1>إعدادات الذكاء الاصطناعي العامة</h1>
          <div class="config-section">
            <div class="form-group">
              <label for="primaryModel">النموذج الأساسي (Primary Model)</label>
              <input type="text" id="primaryModel" placeholder="مثال: llama-3.1-8b-instant">
            </div>
            <div class="form-group">
              <label for="fallbackModels">النماذج الاحتياطية (Fallback Models - مفصولة بفاصلة)</label>
              <input type="text" id="fallbackModels" placeholder="مثال: gemma2-9b-it,llama-3.3-70b-versatile">
            </div>
            <div class="form-group">
              <label for="systemPrompt">موجه النظام (System Prompt)</label>
              <textarea id="systemPrompt" rows="10"></textarea>
            </div>
            <div class="form-group">
              <label for="maxMemoryMessages">أقصى عدد رسائل للذاكرة (لكل مستخدم)</label>
              <input type="number" id="maxMemoryMessages" min="1" value="15">
            </div>
            <button class="btn save-btn" onclick="saveConfig()">حفظ الإعدادات</button>
            <p id="configStatus" style="margin-top: 10px; color: var(--off);"></p>
          </div>
        </div>
        <div id="statsTab" class="tab-content" style="display:none;">
          <h1>إحصائيات البوت</h1>
          <div class="stats-grid">
            <div class="stat-card"><h3>الرسائل المعالجة</h3><p id="messagesHandled">0</p></div>
            <div class="stat-card"><h3>الأخطاء</h3><p id="errors">0</p></div>
            <div class="stat-card"><h3>وقت التشغيل</h3><p id="uptime">0h 0m 0s</p></div>
            <div class="stat-card"><h3>عدد السيرفرات</h3><p id="discordGuilds">0</p></div>
          </div>
        </div>
      </main>
    </div>
    <script>
      let currentGuildId = null;

      function showTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        
        const activeBtn = document.querySelector(`.tab-button[onclick*='${tabName}']`);
        if (activeBtn) activeBtn.classList.add('active');

        document.getElementById(tabName + 'Tab').style.display = 'block';
        
        if (tabName === 'config') loadConfig();
        if (tabName === 'stats') loadStats();
      }

      async function load(){
        try {
          const r = await fetch('/api/me');
          if (!r.ok) {
            const errorText = await r.text();
            throw new Error(`فشل تحميل بيانات المستخدم: ${r.status} ${r.statusText} - ${errorText}`);
          }
          const {guilds, user} = await r.json();
          document.querySelector('.nav div:last-child').innerText = "أهلاً، " + (user ? user.username : 'مستخدم');
          if (guilds && guilds.length > 0) {
            document.getElementById('guildList').innerHTML = guilds.map(g => 
              `<div class="guild-card" id="g-${g.id}" onclick="selectGuild('${g.id}', '${g.name.replace(/'/g, "\\'")}')">
                <img src="${g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;">
                <span>${g.name}</span>
              </div>`
            ).join('');
          } else {
            document.getElementById('guildList').innerHTML = '<div style="padding:10px;text-align:center">لا توجد سيرفرات متاحة (تأكد من وجود صلاحية إدارة السيرفر)</div>';
          }
        } catch (e) {
          console.error('Load Error:', e);
          document.getElementById('guildList').innerHTML = `<div style="padding:10px;text-align:center;color:var(--on)">خطأ في تحميل البيانات: ${e.message}</div>`;
        }
      }

      async function selectGuild(id, name){
        try {
          currentGuildId = id;
          document.querySelectorAll('.guild-card').forEach(el => el.classList.remove('active'));
          const activeCard = document.getElementById('g-'+id);
          if (activeCard) activeCard.classList.add('active');
          
          document.getElementById('channelsTab').innerHTML = '<div style="text-align:center;margin-top:5vh">جاري تحميل القنوات...</div>';
          
          const r = await fetch('/api/guild/' + id + '/channels');
          if (!r.ok) {
            const errorText = await r.text();
            throw new Error(`فشل تحميل القنوات: ${r.status} ${r.statusText} - ${errorText}`);
          }
          const data = await r.json(); 
          const channels = data.channels;

          if (channels && channels.length > 0) {
            document.getElementById('channelsTab').innerHTML = `<h1 style="margin-bottom:2rem">إدارة: ${name} 🔥</h1><div style="display:grid;gap:15px">` + 
              channels.map(c => 
                `<div class="channel-row">
                  <span style="font-size:1.2rem;font-weight:bold"># ${c.name}</span>
                  <button class="btn ${c.isActive ? 'btn-active' : 'btn-inactive'}" id="btn-${c.id}" onclick="toggleChannel('${id}','${c.id}')">
                    ${c.isActive ? 'إيقاف الذكاء' : 'تفعيل الذكاء'}
                  </button>
                </div>`
              ).join('') + '</div>';
          } else {
            document.getElementById('channelsTab').innerHTML = `<h1 style="margin-bottom:2rem">إدارة: ${name} 🔥</h1><div style="text-align:center;margin-top:5vh">لا توجد قنوات نصية متاحة في هذا السيرفر أو أن البوت لا يملك صلاحية رؤيتها.</div>`;
          }
        } catch (e) {
          console.error('Select Guild Error:', e);
          document.getElementById('channelsTab').innerHTML = `<div style="text-align:center;margin-top:5vh;color:var(--on)">خطأ في تحميل قنوات السيرفر: ${e.message}</div>`;
        }
      }

      async function toggleChannel(gid, cid){
        try {
          const r = await fetch('/api/guild/' + gid + '/channel/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: cid })
          });
          if (!r.ok) {
            const errorText = await r.text();
            throw new Error(`فشل تبديل حالة القناة: ${r.status} ${r.statusText} - ${errorText}`);
          }
          const data = await r.json();
          const btn = document.getElementById('btn-' + cid);
          if (btn) {
            btn.innerText = data.active ? 'إيقاف الذكاء' : 'تفعيل الذكاء';
            btn.className = data.active ? 'btn btn-active' : 'btn btn-inactive';
          }
        } catch (e) {
          console.error('Toggle Error:', e);
          alert(`خطأ في تبديل حالة القناة: ${e.message}`);
        }
      }

      async function loadConfig() {
        try {
          const r = await fetch('/api/config');
          if (!r.ok) {
            const errorText = await r.text();
            throw new Error(`فشل تحميل الإعدادات: ${r.status} ${r.statusText} - ${errorText}`);
          }
          const config = await r.json();
          document.getElementById('primaryModel').value = config.primaryModel;
          document.getElementById('fallbackModels').value = config.fallbackModels.join(',');
          document.getElementById('systemPrompt').value = config.systemPrompt;
          document.getElementById('maxMemoryMessages').value = config.maxMemoryMessages;
        } catch (e) {
          console.error('Config Load Error:', e);
          alert(`خطأ في تحميل الإعدادات: ${e.message}`);
        }
      }

      async function saveConfig() {
        const primaryModel = document.getElementById('primaryModel').value;
        const fallbackModels = document.getElementById('fallbackModels').value.split(',').map(m => m.trim()).filter(m => m);
        const systemPrompt = document.getElementById('systemPrompt').value;
        const maxMemoryMessages = parseInt(document.getElementById('maxMemoryMessages').value);

        const statusElem = document.getElementById('configStatus');
        statusElem.style.color = 'orange';
        statusElem.innerText = 'جاري الحفظ...';

        try {
          const r = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ primaryModel, fallbackModels, systemPrompt, maxMemoryMessages })
          });
          if (!r.ok) {
            const errorText = await r.text();
            throw new Error(`فشل حفظ الإعدادات: ${r.status} ${r.statusText} - ${errorText}`);
          }
          const result = await r.json();
          if (result.success) {
            statusElem.style.color = 'var(--off)';
            statusElem.innerText = 'تم حفظ الإعدادات بنجاح!';
          } else {
            statusElem.style.color = 'var(--on)';
            statusElem.innerText = 'فشل حفظ الإعدادات: ' + (result.error || 'خطأ غير معروف');
          }
         } catch (e) {
          statusElem.style.color = 'var(--on)';
          statusElem.innerText = 'خطأ في الاتصال: ' + e.message;
        }
      }

      async function loadStats() {
        try {
          const r = await fetch('/api/stats');
          if (!r.ok) {
            const errorText = await r.text();
            throw new Error(`فشل تحميل الإحصائيات: ${r.status} ${r.statusText} - ${errorText}`);
          }
          const stats = await r.json();
          document.getElementById('messagesHandled').innerText = stats.messagesHandled || 0;
          document.getElementById('errors').innerText = stats.errors || 0;
          document.getElementById('uptime').innerText = stats.uptime || '0h';
          if (document.getElementById('discordGuilds')) {
            document.getElementById('discordGuilds').innerText = stats.discordGuilds || 0;
          }
        } catch (e) {
          console.error('Stats Load Error:', e);
          alert(`خطأ في تحميل الإحصائيات: ${e.message}`);
        }
      }

      load();
      showTab('channels');
    </script></body></html>`);
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

http.createServer(app).listen(CONFIG.DASHBOARD_PORT, () => console.log(`🔥 NexusAI Dashboard Live on port ${CONFIG.DASHBOARD_PORT}`));
client.login(CONFIG.DISCORD_TOKEN);

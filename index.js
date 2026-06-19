const { Client, GatewayIntentBits, Partials, EmbedBuilder, ChannelType, AttachmentBuilder } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const { removeBackground } = require('@imgly/background-removal-node');

// ==========================================
// ⚙️ الإعدادات - عبي بياناتك هون يا وحش
// ==========================================
const CONFIG = {
    TOKEN: 'YOUR_BOT_TOKEN',
    CLIENT_ID: 'YOUR_CLIENT_ID',
    CLIENT_SECRET: 'YOUR_CLIENT_SECRET',
    CALLBACK_URL: 'http://localhost:3000/auth/discord/callback',
    PORT: 3000,
    OLLAMA_URL: 'http://127.0.0.1:11434/api/generate',
    OLLAMA_MODEL: 'llama3',
    STABLE_DIFFUSION_URL: 'http://127.0.0.1:7860/sdapi/v1/txt2img' // إذا بدك تولد صور محلياً
};

// مخزن البيانات البسيط (في الذاكرة)
let db = { guilds: {} };

// ==========================================
// 🤖 إعداد البوت (Discord Bot)
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const settings = db.guilds[message.guildId] || { aiRooms: [], imgRooms: [], bgRooms: [] };

    // 1. نظام الشات الذكي (Ollama)
    if (settings.aiRooms.includes(message.channelId)) {
        message.channel.sendTyping();
        try {
            const res = await axios.post(CONFIG.OLLAMA_URL, {
                model: CONFIG.OLLAMA_MODEL,
                prompt: message.content,
                stream: false
            });
            message.reply(res.data.response);
        } catch (e) {
            message.reply("❌ تأكد إن Ollama شغال عندك بالخلفية.");
        }
    }

    // 2. نظام توليد الصور (Stable Diffusion المحلي)
    if (settings.imgRooms.includes(message.channelId)) {
        const wait = await message.reply("🎨 جاري رسم لوحتك... انتظر قليلاً.");
        try {
            const res = await axios.post(CONFIG.STABLE_DIFFUSION_URL, {
                prompt: message.content,
                steps: 20
            });
            const buffer = Buffer.from(res.data.images[0], 'base64');
            const attachment = new AttachmentBuilder(buffer, { name: 'generated.png' });
            await message.reply({ files: [attachment] });
            wait.delete();
        } catch (e) {
            wait.edit("❌ فشل الاتصال بـ Stable Diffusion. تأكد إنه شغال.");
        }
    }

    // 3. إزالة الخلفية (تلقائي عند رفع صورة)
    if (settings.bgRooms.includes(message.channelId) && message.attachments.size > 0) {
        const file = message.attachments.first();
        if (file.contentType.startsWith('image/')) {
            const wait = await message.reply("✨ جاري مسح الخلفية...");
            try {
                const blob = await removeBackground(file.url);
                const buffer = Buffer.from(await blob.arrayBuffer());
                const attachment = new AttachmentBuilder(buffer, { name: 'no-bg.png' });
                await message.reply({ files: [attachment] });
                wait.delete();
            } catch (e) {
                wait.edit("❌ حدث خطأ أثناء معالجة الصورة.");
            }
        }
    }
});

// ==========================================
// 🌐 الداشبورد (Dashboard)
// ==========================================
const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((o, d) => d(null, o));

passport.use(new DiscordStrategy({
    clientID: CONFIG.CLIENT_ID,
    clientSecret: CONFIG.CLIENT_SECRET,
    callbackURL: CONFIG.CALLBACK_URL,
    scope: ['identify', 'guilds']
}, (a, r, p, d) => d(null, p)));

// قوالب الـ HTML (بملف واحد)
const CSS = `
    body { background: #0f0c29; background: linear-gradient(to right, #24243e, #302b63, #0f0c29); color: white; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; }
    .container { max-width: 900px; margin: 50px auto; padding: 20px; background: rgba(0,0,0,0.5); border-radius: 20px; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
    .card { background: #1a1a2e; border: 1px solid #16213e; border-radius: 15px; padding: 20px; margin: 15px; display: inline-block; width: 250px; transition: 0.3s; }
    .card:hover { transform: translateY(-10px); box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
    .btn { background: #e94560; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: bold; border: none; cursor: pointer; }
    select { width: 100%; padding: 10px; border-radius: 5px; background: #16213e; color: white; border: 1px solid #e94560; margin-bottom: 15px; }
`;

app.get('/', (req, res) => {
    res.send(`
        <style>${CSS}</style>
        <div class="container" dir="rtl">
            <h1>🚀 داشبورد البوت الخارق</h1>
            <p>تحكم في سيرفرك بذكاء اصطناعي محلي كامل</p>
            ${req.user ? `<p>أهلاً بك، ${req.user.username}</p><a href="/dashboard" class="btn">دخول اللوحة</a>` : `<a href="/auth/discord" class="btn">تسجيل دخول ديسكورد</a>`}
        </div>
    `);
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', (req, res) => {
    if (!req.user) return res.redirect('/');
    const guilds = req.user.guilds.filter(g => (g.permissions & 0x8) === 0x8);
    res.send(`
        <style>${CSS}</style>
        <div class="container" dir="rtl">
            <h2>اختر سيرفر للإدارة</h2>
            ${guilds.map(g => `
                <div class="card">
                    <h3>${g.name}</h3>
                    <a href="/manage/${g.id}" class="btn">إعداد الرومات</a>
                </div>
            `).join('')}
        </div>
    `);
});

app.get('/manage/:id', (req, res) => {
    if (!req.user) return res.redirect('/');
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.send("البوت مش موجود بالسيرفر!");
    
    const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    const s = db.guilds[req.params.id] || { aiRooms: [], imgRooms: [], bgRooms: [] };

    res.send(`
        <style>${CSS}</style>
        <div class="container" dir="rtl">
            <h2>إدارة سيرفر: ${guild.name}</h2>
            <form action="/save/${req.params.id}" method="POST">
                <div style="text-align: right; padding: 20px;">
                    <label>🤖 رومات الشات الذكي (Ollama):</label>
                    <select name="aiRooms" multiple>
                        ${channels.map(c => `<option value="${c.id}" ${s.aiRooms.includes(c.id) ? 'selected' : ''}>#${c.name}</option>`).join('')}
                    </select>

                    <label>🎨 رومات توليد الصور (Stable Diffusion):</label>
                    <select name="imgRooms" multiple>
                        ${channels.map(c => `<option value="${c.id}" ${s.imgRooms.includes(c.id) ? 'selected' : ''}>#${c.name}</option>`).join('')}
                    </select>

                    <label>✨ رومات إزالة الخلفية:</label>
                    <select name="bgRooms" multiple>
                        ${channels.map(c => `<option value="${c.id}" ${s.bgRooms.includes(c.id) ? 'selected' : ''}>#${c.name}</option>`).join('')}
                    </select>
                </div>
                <button type="submit" class="btn">حفظ الإعدادات ✅</button>
            </form>
        </div>
    `);
});

app.post('/save/:id', (req, res) => {
    const format = (v) => Array.isArray(v) ? v : (v ? [v] : []);
    db.guilds[req.params.id] = {
        aiRooms: format(req.body.aiRooms),
        imgRooms: format(req.body.imgRooms),
        bgRooms: format(req.body.bgRooms)
    };
    res.redirect('/dashboard');
});

// تشغيل الكل
app.listen(CONFIG.PORT, () => console.log(`🌐 Dashboard: http://localhost:${CONFIG.PORT}`));
client.login(CONFIG.TOKEN).catch(() => console.log("❌ التوكن غلط يا وحش!"));

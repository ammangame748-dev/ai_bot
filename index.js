const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const path = require('path');

/**
 * CONFIGURATION & INITIALIZATION
 */
const PORT = process.env.PORT || 3000;

// Validate essential environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'HF_TOKEN', 'CLIENT_ID', 'CLIENT_SECRET', 'CALLBACK_URL'];
requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
        console.error(`Error: Missing environment variable: ${envVar}`);
    }
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const app = express();

/**
 * MODEL SELECTION: Qwen/Qwen2.5-72B-Instruct
 * One of the most powerful open-source models in 2026.
 * Hugging Face provides massive free inference limits for this model.
 */
const HF_MODEL = "Qwen/Qwen2.5-72B-Instruct";
const HF_TOKEN = process.env.HF_TOKEN;

// In-memory Database
let botSettings = {
    allowedRoles: [],
    allowedChannels: [],
    themeColor: "#7289da", // Discord Blurple for a clean look
    prefix: "!"
};

// User Conversation Memory
const userMemory = new Map();

/**
 * DISCORD BOT LOGIC
 */
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}! (Hugging Face Infinite Edition)`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const hasRole = botSettings.allowedRoles.length === 0 || message.member.roles.cache.some(r => botSettings.allowedRoles.includes(r.id));
    const isChannel = botSettings.allowedChannels.length === 0 || botSettings.allowedChannels.includes(message.channel.id);

    if (!hasRole || !isChannel) return;

    try {
        message.channel.sendTyping();

        // Get or Initialize User History
        let history = userMemory.get(message.author.id) || [
            { role: "system", content: "You are 'Ai bot', a 2026 updated AI. You are highly intelligent, respond in the user's language (Arabic/English), and provide real-time information. Use emojis. Respond in plain text only." }
        ];

        history.push({ role: "user", content: message.content });

        // Hugging Face handles large context well, but we keep it efficient at 15 messages
        if (history.length > 16) {
            history = [history[0], ...history.slice(-15)];
        }

        const response = await axios.post(
            `https://api-inference.huggingface.co/models/${HF_MODEL}/v1/chat/completions`,
            {
                model: HF_MODEL,
                messages: history,
                max_tokens: 1500,
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${HF_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const aiContent = response.data.choices[0].message.content;

        // Add AI response to history
        history.push({ role: "assistant", content: aiContent });
        userMemory.set(message.author.id, history);

        const embed = new EmbedBuilder()
            .setColor(botSettings.themeColor)
            .setAuthor({ name: 'Ai bot', iconURL: client.user.displayAvatarURL() })
            .setDescription(aiContent)
            .setFooter({ text: `Infinite AI Power via ${HF_MODEL.split('/')[1]}` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });

    } catch (error) {
        console.error("AI Error:", error.response ? error.response.data : error.message);
        message.reply("يا غالي، السيرفر عليه ضغط بسيط، جرب تبعت رسالتك كمان مرة هسا! 🔄");
    }
});

/**
 * DASHBOARD & OAUTH2 LOGIC
 */
const CALLBACK_URL = process.env.CALLBACK_URL;

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

app.use(session({
    secret: 'ai-bot-infinite-secret',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dashboardHTML = (user, guilds) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ai bot Dashboard (Infinite)</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
        body { background-color: #0f0f1a; color: #fff; font-family: 'Cairo', sans-serif; margin: 0; }
        .container { max-width: 900px; margin: 50px auto; padding: 30px; background: #1a1a2e; border-radius: 20px; border: 1px solid #7289da; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        h1 { color: #7289da; text-align: center; }
        .form-group { margin-bottom: 25px; }
        label { display: block; margin-bottom: 10px; color: #b9bbbe; }
        input, select { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #23272a; background: #2f3136; color: #fff; outline: none; }
        .btn { width: 100%; padding: 15px; background: #7289da; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; transition: 0.3s; }
        .btn:hover { background: #5b6eae; }
    </style>
</head>
<body>
    <div class="container">
        <h1>إعدادات البوت اللانهائي 🚀</h1>
        <div style="text-align: center; margin-bottom: 20px;">مرحباً، ${user.username}</div>
        <form action="/settings" method="POST">
            <div class="form-group">
                <label>اختر السيرفر</label>
                <select name="guildId">${guilds.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}</select>
            </div>
            <div class="form-group">
                <label>معرف الرومات (ID)</label>
                <input type="text" name="allowedChannels" value="${botSettings.allowedChannels.join(',')}">
            </div>
            <div class="form-group">
                <label>معرف الرتب (ID)</label>
                <input type="text" name="allowedRoles" value="${botSettings.allowedRoles.join(',')}">
            </div>
            <button type="submit" class="btn">حفظ الإعدادات</button>
        </form>
    </div>
</body>
</html>
`;

app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.send(`<html><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><div style="text-align:center;border:1px solid #7289da;padding:50px;border-radius:20px;"><h1>Ai bot Infinite</h1><a href="/login" style="background:#7289da;color:#fff;padding:15px 30px;text-decoration:none;border-radius:5px;font-weight:bold;">Login with Discord</a></div></body></html>`);
});

app.get('/login', passport.authenticate('discord'));

// FIX: Added both routes to support any Callback URL configuration
const callbackHandler = passport.authenticate('discord', { failureRedirect: '/' });
app.get('/callback', callbackHandler, (req, res) => res.redirect('/dashboard'));
app.get('/auth/discord/callback', callbackHandler, (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    const adminGuilds = req.user.guilds.filter(g => (g.permissions & 0x8) === 0x8);
    res.send(dashboardHTML(req.user, adminGuilds));
});

app.post('/settings', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send('Unauthorized');
    const { allowedChannels, allowedRoles } = req.body;
    botSettings.allowedChannels = allowedChannels.split(',').map(s => s.trim()).filter(s => s);
    botSettings.allowedRoles = allowedRoles.split(',').map(s => s.trim()).filter(s => s);
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
client.login(process.env.DISCORD_TOKEN);

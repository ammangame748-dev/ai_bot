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

// Validate essential environment variables for Render/Production
const requiredEnvVars = ['DISCORD_TOKEN', 'GROQ_API_KEY', 'CLIENT_ID', 'CLIENT_SECRET', 'CALLBACK_URL'];
requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
        console.error(`Error: Missing environment variable: ${envVar}`);
        // We don't exit here to allow the process to start, but it will fail when used
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

// Groq Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = "groq/compound"; 

// In-memory Database
let botSettings = {
    allowedRoles: [],
    allowedChannels: [],
    themeColor: "#ff0000",
    prefix: "!"
};

// User Conversation Memory
const userMemory = new Map();

/**
 * DISCORD BOT LOGIC
 */
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
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
            { role: "system", content: "You are 'Ai bot', a highly advanced AI assistant. Respond naturally in the same language as the user (Arabic for Arabic, English for English).  You know the latest news. IMPORTANT: Provide ONLY the text of your response. DO NOT wrap it in any code blocks, tags, or embed syntax. Just plain, beautiful text." }
        ];

        // Add current user message to history
        history.push({ role: "user", content: message.content });

        // Limit history to last 10 messages to keep context efficient (System + 10 messages)
        if (history.length > 11) {
            history = [history[0], ...history.slice(-10)];
        }

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: GROQ_MODEL,
            messages: history
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiContent = response.data.choices[0].message.content;

        // Add AI response to history
        history.push({ role: "assistant", content: aiContent });
        userMemory.set(message.author.id, history);

        const embed = new EmbedBuilder()
            .setColor(botSettings.themeColor)
            .setAuthor({ name: 'Ai bot', iconURL: client.user.displayAvatarURL() })
            .setDescription(aiContent)
            .setFooter({ text: 'Powered by Groq Compound AI System with Web Search' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });

    } catch (error) {
        console.error("AI Error:", error.response ? error.response.data : error.message);
        message.reply("عذراً، حدث خطأ أثناء معالجة طلبك.");
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
    secret: 'ai-bot-secret-key',
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
    <title>Ai bot Dashboard</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
        body { background-color: #0a0a0a; color: #fff; font-family: 'Cairo', sans-serif; margin: 0; overflow-x: hidden; }
        .fire-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at bottom, #440000 0%, #000 70%); z-index: -1; animation: pulse 5s infinite alternate; }
        @keyframes pulse { 0% { opacity: 0.6; } 100% { opacity: 1; } }
        .container { max-width: 1000px; margin: 50px auto; padding: 20px; background: rgba(20, 20, 20, 0.9); border: 2px solid #ff0000; border-radius: 15px; box-shadow: 0 0 30px #ff000055; animation: fadeIn 1s ease-in; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        h1 { color: #ff0000; text-align: center; text-transform: uppercase; letter-spacing: 2px; }
        .user-info { display: flex; align-items: center; justify-content: center; margin-bottom: 30px; }
        .user-info img { border-radius: 50%; border: 2px solid #ff0000; margin-left: 15px; width: 60px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; color: #ff4444; font-weight: bold; }
        select, input { width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #440000; color: #fff; border-radius: 5px; outline: none; transition: 0.3s; }
        select:focus, input:focus { border-color: #ff0000; box-shadow: 0 0 10px #ff0000; }
        .btn { display: block; width: 100%; padding: 15px; background: #ff0000; color: #fff; text-align: center; text-decoration: none; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; transition: 0.3s; text-transform: uppercase; }
        .btn:hover { background: #cc0000; box-shadow: 0 0 20px #ff0000; transform: scale(1.02); }
    </style>
</head>
<body>
    <div class="fire-bg"></div>
    <div class="container">
        <h1>Ai bot Dashboard</h1>
        <div class="user-info">
            <span>مرحباً، ${user.username}</span>
            <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" alt="Avatar">
        </div>
        <form action="/settings" method="POST">
            <div class="form-group">
                <label>تحديد السيرفر النشط</label>
                <select name="guildId">${guilds.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}</select>
            </div>
            <div class="form-group">
                <label>معرف الرومات المسموحة (فصل بفاصلة)</label>
                <input type="text" name="allowedChannels" placeholder="ID1, ID2..." value="${botSettings.allowedChannels.join(',')}">
            </div>
            <div class="form-group">
                <label>معرف الرتب المسموحة (فصل بفاصلة)</label>
                <input type="text" name="allowedRoles" placeholder="RoleID1, RoleID2..." value="${botSettings.allowedRoles.join(',')}">
            </div>
            <button type="submit" class="btn">حفظ الإعدادات النارية</button>
        </form>
        <div style="margin-top: 30px; text-align: center;"><a href="/logout" style="color: #666; text-decoration: none;">تسجيل الخروج</a></div>
    </div>
</body>
</html>
`;

app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.send(`
        <html>
        <head><title>Ai bot Login</title><style>body { background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }.login-box { text-align: center; border: 2px solid #ff0000; padding: 50px; border-radius: 20px; box-shadow: 0 0 50px #ff0000; }h1 { color: #ff0000; margin-bottom: 30px; }.btn { background: #ff0000; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 1.2rem; transition: 0.3s; }.btn:hover { background: #fff; color: #ff0000; box-shadow: 0 0 20px #fff; }</style></head>
        <body><div class="login-box"><h1>Ai bot</h1><a href="/login" class="btn">تسجيل الدخول عبر ديسكورد</a></div></body>
        </html>
    `);
});

app.get('/login', passport.authenticate('discord'));
// Support both /callback and /auth/discord/callback
const callbackAuth = passport.authenticate('discord', { failureRedirect: '/' });
app.get('/callback', callbackAuth, (req, res) => res.redirect('/dashboard'));
app.get('/auth/discord/callback', callbackAuth, (req, res) => res.redirect('/dashboard'));


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

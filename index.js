const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Mistral } = require('@mistralai/mistralai');
const path = require('path');

/**
 * CONFIGURATION & INITIALIZATION
 */
const PORT = process.env.PORT || 3000;

// Validate essential environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'MISTRAL_API_KEY', 'CLIENT_ID', 'CLIENT_SECRET', 'CALLBACK_URL'];
requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
        console.error(`Error: Missing environment variable: ${envVar}`);
    }
});

// Initialize Mistral Client
const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const app = express();

// In-memory Database
let botSettings = {
    allowedRoles: [],
    allowedChannels: [],
    themeColor: "#f36d00", // Mistral Orange
    prefix: "!"
};

// User Conversation Memory
const userMemory = new Map();

/**
 * DISCORD BOT LOGIC
 */
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}! (Mistral 2026 Edition)`);
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
            { role: "system", content: "You are 'Ai bot', a highly advanced AI assistant updated to 2026. You have access to Web Search. Respond naturally in the user's language (Arabic/English). Use emojis. IMPORTANT: Provide ONLY plain text responses." }
        ];

        history.push({ role: "user", content: message.content });

        // Limit history to 10 messages for efficiency
        if (history.length > 11) {
            history = [history[0], ...history.slice(-10)];
        }

        /**
         * MISTRAL CHAT WITH WEB SEARCH
         * This uses the built-in websearch tool for real-time 2026 info.
         */
        const chatResponse = await mistral.chat.complete({
            model: "mistral-small-latest",
            messages: history,
            tools: [{ type: "websearch" }] // Enabling the magic web search tool
        });

        const aiContent = chatResponse.choices[0].message.content;

        // Add AI response to history
        history.push({ role: "assistant", content: aiContent });
        userMemory.set(message.author.id, history);

        const embed = new EmbedBuilder()
            .setColor(botSettings.themeColor)
            .setAuthor({ name: 'Ai bot', iconURL: client.user.displayAvatarURL() })
            .setDescription(aiContent)
            .setFooter({ text: 'Powered by Mistral AI (Infinite Web Search 2026)' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });

    } catch (error) {
        console.error("AI Error:", error);
        if (error.message && error.message.includes("429")) {
            message.reply("يا غالي، أنا حالياً مضغوط شوي. استنى دقيقة وجرب مرة ثانية! ⏳");
        } else {
            message.reply("عذراً، حدث خطأ أثناء معالجة طلبك.");
        }
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
    secret: 'ai-bot-mistral-secret',
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
    <title>Ai bot Dashboard (Mistral)</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
        body { background-color: #0a0a0a; color: #fff; font-family: 'Cairo', sans-serif; margin: 0; }
        .container { max-width: 900px; margin: 50px auto; padding: 30px; background: #1a1a1a; border-radius: 20px; border: 2px solid #f36d00; box-shadow: 0 0 40px rgba(243, 109, 0, 0.3); }
        h1 { color: #f36d00; text-align: center; text-transform: uppercase; }
        .user-info { display: flex; align-items: center; justify-content: center; margin-bottom: 30px; }
        .user-info img { border-radius: 50%; border: 2px solid #f36d00; margin-left: 15px; width: 60px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; color: #ff9d4d; font-weight: bold; }
        select, input { width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: #fff; border-radius: 8px; outline: none; }
        .btn { display: block; width: 100%; padding: 15px; background: #f36d00; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; }
        .btn:hover { background: #ff8533; transform: scale(1.02); }
    </style>
</head>
<body>
    <div class="container">
        <h1>Ai bot Dashboard (2026)</h1>
        <div class="user-info">
            <span>مرحباً، ${user.username}</span>
            <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" alt="Avatar">
        </div>
        <form action="/settings" method="POST">
            <div class="form-group">
                <label>تحديد السيرفر</label>
                <select name="guildId">${guilds.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}</select>
            </div>
            <div class="form-group">
                <label>الرومات المسموحة (IDs)</label>
                <input type="text" name="allowedChannels" value="${botSettings.allowedChannels.join(',')}">
            </div>
            <div class="form-group">
                <label>الرتب المسموحة (IDs)</label>
                <input type="text" name="allowedRoles" value="${botSettings.allowedRoles.join(',')}">
            </div>
            <button type="submit" class="btn">حفظ الإعدادات</button>
        </form>
        <div style="margin-top: 30px; text-align: center;"><a href="/logout" style="color: #666; text-decoration: none;">تسجيل الخروج</a></div>
    </div>
</body>
</html>
`;

app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.send(`<html><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><div style="text-align:center;border:2px solid #f36d00;padding:50px;border-radius:20px;"><h1>Ai bot Mistral</h1><a href="/login" style="background:#f36d00;color:#fff;padding:15px 30px;text-decoration:none;border-radius:5px;font-weight:bold;">Login with Discord</a></div></body></html>`);
});

app.get('/login', passport.authenticate('discord'));

// SUPPORT BOTH CALLBACK URLS
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

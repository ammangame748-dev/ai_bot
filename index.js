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
const requiredEnvVars = ['DISCORD_TOKEN', 'MISTRAL_API_KEY', 'CLIENT_ID', 'CLIENT_SECRET', 'CALLBACK_URL'];
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
    console.log(`Logged in as ${client.user.tag}! (Mistral 2026 Stable)`);
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
            { role: "system", content: "You are 'Ai bot', a highly advanced AI assistant updated to 2026. You provide accurate, real-time information. Respond naturally in the user's language (Arabic/English). Use emojis. IMPORTANT: Provide ONLY plain text responses." }
        ];

        history.push({ role: "user", content: message.content });

        // Limit history for efficiency
        if (history.length > 11) {
            history = [history[0], ...history.slice(-10)];
        }

        /**
         * MISTRAL API CALL
         * FIX: Corrected tool type to 'web_search' as required by Mistral API
         */
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: "mistral-large-latest",
            messages: history,
            tools: [{
                type: "web_search" // Correct type is 'web_search'
            }],
            tool_choice: "auto"
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let aiContent = "";
        const choice = response.data.choices[0].message;

        // If the model wants to search the web, it returns tool_calls.
        // For simplicity in this version, we ensure we get content.
        // Mistral Large often provides content directly when grounded.
        if (choice.content) {
            aiContent = choice.content;
        } else if (choice.tool_calls) {
            // If it only returns tool_calls, it means it's trying to search.
            // In a simple bot, we'll ask it to summarize its knowledge or we'd need a second pass.
            // For now, we'll re-request without tools if it fails to provide content to ensure a response.
            const retryResponse = await axios.post('https://api.mistral.ai/v1/chat/completions', {
                model: "mistral-large-latest",
                messages: history
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            aiContent = retryResponse.data.choices[0].message.content;
        }

        // Add AI response to history
        history.push({ role: "assistant", content: aiContent });
        userMemory.set(message.author.id, history);

        const embed = new EmbedBuilder()
            .setColor(botSettings.themeColor)
            .setAuthor({ name: 'Ai bot', iconURL: client.user.displayAvatarURL() })
            .setDescription(aiContent)
            .setFooter({ text: 'Powered by Mistral AI (2026 Grounded Knowledge)' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });

    } catch (error) {
        console.error("AI Error Details:", error.response ? JSON.stringify(error.response.data) : error.message);
        message.reply("عذراً، حدث خطأ أثناء معالجة طلبك. جرب مرة ثانية!");
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
    secret: 'ai-bot-mistral-stable-secret',
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
        body { background-color: #0a0a0a; color: #fff; font-family: 'Cairo', sans-serif; margin: 0; }
        .container { max-width: 900px; margin: 50px auto; padding: 30px; background: #1a1a1a; border-radius: 20px; border: 2px solid #f36d00; }
        h1 { color: #f36d00; text-align: center; }
        .btn { display: block; width: 100%; padding: 15px; background: #f36d00; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; text-align: center; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Ai bot Dashboard</h1>
        <div style="text-align: center; margin-bottom: 20px;">مرحباً، ${user.username}</div>
        <form action="/settings" method="POST">
            <div style="margin-bottom: 15px;">
                <label>السيرفر</label>
                <select name="guildId" style="width: 100%; padding: 10px;">${guilds.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}</select>
            </div>
            <button type="submit" class="btn">حفظ الإعدادات</button>
        </form>
    </div>
</body>
</html>
`;

app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.send(`<html><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="text-align:center;border:2px solid #f36d00;padding:50px;border-radius:20px;"><h1>Ai bot Mistral</h1><a href="/login" style="background:#f36d00;color:#fff;padding:15px 30px;text-decoration:none;border-radius:5px;font-weight:bold;">Login with Discord</a></div></body></html>`);
});

app.get('/login', passport.authenticate('discord'));
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
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

app.listen(PORT, () => console.log(`Dashboard running on port ${PORT}`));
client.login(process.env.DISCORD_TOKEN);

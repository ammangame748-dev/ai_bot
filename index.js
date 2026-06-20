#!/usr/bin/env node

/**
 * ✨ ULTIMATE DISCORD AI BOT ✨
 * Rebuilt from scratch for maximum stability and performance.
 * Features: AI Chat (Groq), Web Dashboard, Server/Channel Management, Persistence.
 */

import dotenv from 'dotenv';
dotenv.config();

import { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ActionRowBuilder,
    ChannelType
} from 'discord.js';
import Groq from 'groq-sdk';
import express from 'express';
import session from 'express-session';
import axios from 'axios';
import bodyParser from 'body-parser';
import { promises as fs } from 'fs';
import path from 'path';

// --- CONFIGURATION & CONSTANTS ---
const PORT = process.env.PORT || 3000;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const BOT_PREFIX = process.env.BOT_PREFIX || '!';
const SETTINGS_FILE = path.resolve('bot_settings.json');

// --- BOT INITIALIZATION ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // REQUIRED: Enable in Discord Dev Portal
        GatewayIntentBits.DirectMessages,
    ],
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- STATE MANAGEMENT ---
const userConversations = new Map();
let botSettings = {
    enabledChannels: [],
    botActive: true,
    totalQuestions: 0,
    totalDataConsumed: 0,
    startTime: Date.now(),
};

// --- DATA PERSISTENCE ---
async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        const parsed = JSON.parse(data);
        // Merge with defaults to handle schema updates
        botSettings = { ...botSettings, ...parsed };
        console.log('[SYSTEM] Settings loaded successfully.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[SYSTEM] No settings file found. Using defaults.');
            await saveSettings();
        } else {
            console.error('[ERROR] Failed to load settings:', error);
        }
    }
}

async function saveSettings() {
    try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(botSettings, null, 2), 'utf8');
        console.log('[SYSTEM] Settings saved to disk.');
    } catch (error) {
        console.error('[ERROR] Failed to save settings:', error);
    }
}

// --- DISCORD EVENT HANDLERS ---
client.once('ready', async () => {
    console.log(`[BOT] Logged in as ${client.user.tag}`);
    await loadSettings();
    client.user.setActivity('مساعدك الذكي ✨', { type: 3 }); // Watching
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Check if bot is active globally
    if (!botSettings.botActive) return;

    // Check if channel is enabled
    if (!botSettings.enabledChannels.includes(message.channel.id)) return;

    // Handle Prefix
    if (message.content.startsWith(BOT_PREFIX)) {
        const userQuery = message.content.slice(BOT_PREFIX.length).trim();
        if (!userQuery) return;

        console.log(`[CHAT] Processing request from ${message.author.tag} in #${message.channel.name}`);

        // Maintain Context
        let history = userConversations.get(message.author.id) || [];
        history.push({ role: 'user', content: userQuery });
        if (history.length > 12) history = history.slice(-12);
        userConversations.set(message.author.id, history);

        // Show Typing Indicator
        await message.channel.sendTyping();

        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: 'system', 
                        content: 'أنت بوت ديسكورد عربي ذكي ومحترف. ردودك يجب أن تكون منسقة، واضحة، ومدعومة بالإيموجيات المناسبة. أنت تستخدم موديل Llama 3.1.' 
                    },
                    ...history
                ],
                model: 'llama3-8b-8192',
                temperature: 0.6,
                max_tokens: 1024,
            });

            const aiResponse = completion.choices[0]?.message?.content || 'عذراً، لم أستطع توليد رد حالياً.';
            const tokensUsed = completion.usage?.total_tokens || 0;

            // Update Stats
            botSettings.totalQuestions++;
            botSettings.totalDataConsumed += tokensUsed;
            await saveSettings();

            // Save AI Response to History
            history.push({ role: 'assistant', content: aiResponse });
            userConversations.set(message.author.id, history);

            // Create Rich Embed
            const responseEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🤖 رد الذكاء الاصطناعي')
                .setDescription(aiResponse)
                .setFooter({ 
                    text: `استهلاك: ${tokensUsed} توكن | الأسئلة: ${botSettings.totalQuestions}`,
                    iconURL: client.user.displayAvatarURL()
                })
                .setTimestamp();

            // Action Buttons
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('clear_chat').setLabel('مسح الذاكرة 🧹').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('bot_info').setLabel('إحصائيات 📊').setStyle(ButtonStyle.Primary)
            );

            await message.reply({ embeds: [responseEmbed], components: [buttons] });

        } catch (error) {
            console.error('[AI ERROR]', error);
            await message.reply('❌ حدث خطأ أثناء الاتصال بمحرك الذكاء الاصطناعي.');
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'clear_chat') {
        userConversations.delete(interaction.user.id);
        await interaction.reply({ content: '✅ تم مسح ذاكرة المحادثة الخاصة بك.', ephemeral: true });
    } else if (interaction.customId === 'bot_info') {
        const uptime = Math.floor((Date.now() - botSettings.startTime) / 1000);
        const h = Math.floor(uptime / 3600);
        const m = Math.floor((uptime % 3600) / 60);
        await interaction.reply({ 
            content: `**إحصائيات البوت:**\n• إجمالي الأسئلة: ${botSettings.totalQuestions}\n• وقت التشغيل: ${h} ساعة و ${m} دقيقة`,
            ephemeral: true 
        });
    }
});

// --- WEB DASHBOARD (EXPRESS) ---
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'manus-ultra-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set true if using HTTPS
}));

// Auth Middleware
const isAuth = (req, res, next) => req.session.user ? next() : res.redirect('/login');

// --- UI COMPONENTS ---
const CSS = `
:root { --primary: #5865F2; --bg: #232428; --card: #2B2D31; --text: #DBDEE1; --success: #248046; --danger: #DA373C; }
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: var(--bg); color: var(--text); margin: 0; direction: rtl; }
.nav { background: #1E1F22; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
.container { max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
.card { background: var(--card); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border: 1px solid #3F4147; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
.stat-box { background: #1E1F22; padding: 1rem; border-radius: 6px; text-align: center; }
.stat-val { display: block; font-size: 1.5rem; font-weight: bold; color: var(--primary); }
.btn { padding: 0.6rem 1.2rem; border-radius: 4px; border: none; cursor: pointer; font-weight: bold; transition: 0.2s; text-decoration: none; display: inline-block; }
.btn-primary { background: var(--primary); color: white; }
.btn-danger { background: var(--danger); color: white; }
.btn-success { background: var(--success); color: white; }
.switch { position: relative; display: inline-block; width: 50px; height: 26px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #4E5058; transition: .4s; border-radius: 34px; }
.slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background: white; transition: .4s; border-radius: 50%; }
input:checked + .slider { background: var(--success); }
input:checked + .slider:before { transform: translateX(24px); }
select, .channel-list { width: 100%; padding: 0.8rem; background: #1E1F22; border: 1px solid #3F4147; color: white; border-radius: 4px; margin-top: 0.5rem; }
.channel-item { display: flex; align-items: center; padding: 0.5rem; border-bottom: 1px solid #3F4147; }
.channel-item:last-child { border: none; }
.channel-item input { margin-left: 10px; }
`;

const Layout = (title, content, user = null) => `
<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | AI Bot</title>
    <style>${CSS}</style>
</head>
<body>
    <div class="nav">
        <div style="font-weight: bold; font-size: 1.2rem;">🤖 AI Dashboard</div>
        ${user ? `<div><span>مرحباً، ${user.username}</span> <a href="/logout" class="btn btn-danger" style="margin-right: 15px; font-size: 0.8rem;">خروج</a></div>` : ''}
    </div>
    <div class="container">${content}</div>
</body>
</html>
`;

// --- ROUTES ---
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    const error = req.query.error ? `<div style="color: var(--danger); margin-bottom: 1rem;">❌ خطأ: ${req.query.error}</div>` : '';
    res.send(Layout('تسجيل الدخول', `
        <div class="card" style="max-width: 400px; margin: 5rem auto; text-align: center;">
            <h2>تسجيل الدخول</h2>
            ${error}
            <p>يرجى تسجيل الدخول بحساب المسؤول للوصول للوحة التحكم.</p>
            <a href="/auth/discord" class="btn btn-primary" style="width: 100%; box-sizing: border-box;">الدخول عبر Discord</a>
        </div>
    `));
});

app.get('/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.CALLBACK_URL)}&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
});

app.get('/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/login?error=no_code');

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.CALLBACK_URL,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        const { access_token, token_type } = tokenResponse.data;
        const user = (await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `${token_type} ${access_token}` } })).data;
        const guilds = (await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `${token_type} ${access_token}` } })).data;

        if (user.id !== ADMIN_USER_ID) return res.redirect('/login?error=not_admin');

        req.session.user = user;
        req.session.guilds = guilds;
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.redirect('/login?error=auth_failed');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/dashboard', isAuth, async (req, res) => {
    const botGuilds = client.guilds.cache;
    const adminGuilds = req.session.guilds.filter(g => botGuilds.has(g.id));
    
    const selectedGuildId = req.query.guildId;
    let channels = [];
    if (selectedGuildId) {
        const guild = botGuilds.get(selectedGuildId);
        if (guild) {
            channels = guild.channels.cache
                .filter(c => c.type === ChannelType.GuildText)
                .map(c => ({ id: c.id, name: c.name }));
        }
    }

    const uptime = Math.floor((Date.now() - botSettings.startTime) / 1000);
    const uptimeStr = `${Math.floor(uptime/3600)}س ${Math.floor((uptime%3600)/60)}د`;

    const content = `
        <div class="grid">
            <div class="card stat-box">
                <span class="stat-val">${botSettings.totalQuestions}</span>
                <span>إجمالي الأسئلة</span>
            </div>
            <div class="card stat-box">
                <span class="stat-val">${uptimeStr}</span>
                <span>وقت التشغيل</span>
            </div>
            <div class="card stat-box">
                <span class="stat-val" style="color: ${client.isReady() ? 'var(--success)' : 'var(--danger)'}">${client.isReady() ? 'متصل' : 'أوفلاين'}</span>
                <span>حالة البوت</span>
            </div>
        </div>

        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3>تفعيل البوت</h3>
                <label class="switch">
                    <input type="checkbox" id="activeToggle" ${botSettings.botActive ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <div class="card">
            <h3>إعدادات السيرفر والقنوات</h3>
            <form action="/dashboard" method="GET">
                <label>اختر السيرفر:</label>
                <select name="guildId" onchange="this.form.submit()">
                    <option value="">-- اختر سيرفر --</option>
                    ${adminGuilds.map(g => `<option value="${g.id}" ${selectedGuildId === g.id ? 'selected' : ''}>${g.name}</option>`).join('')}
                </select>
            </form>

            ${selectedGuildId ? `
                <div style="margin-top: 1.5rem;">
                    <label>قنوات الدردشة المتاحة:</label>
                    <div class="channel-list" id="channelList">
                        ${channels.map(c => `
                            <div class="channel-item">
                                <input type="checkbox" value="${c.id}" ${botSettings.enabledChannels.includes(c.id) ? 'checked' : ''}>
                                <span># ${c.name}</span>
                            </div>
                        `).join('')}
                        ${channels.length === 0 ? '<p>لا توجد قنوات نصية متاحة.</p>' : ''}
                    </div>
                    <button class="btn btn-success" style="margin-top: 1rem; width: 100%;" onclick="saveChannels()">حفظ إعدادات القنوات ✅</button>
                </div>
            ` : ''}
        </div>

        <script>
            document.getElementById('activeToggle').addEventListener('change', async (e) => {
                await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ botActive: e.target.checked })
                });
            });

            async function saveChannels() {
                const checkboxes = document.querySelectorAll('#channelList input:checked');
                const enabledChannels = Array.from(checkboxes).map(cb => cb.value);
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabledChannels })
                });
                if (res.ok) alert('تم الحفظ بنجاح!');
            }
        </script>
    `;
    res.send(Layout('لوحة التحكم', content, req.session.user));
});

app.post('/api/settings', isAuth, async (req, res) => {
    const { botActive, enabledChannels } = req.body;
    if (botActive !== undefined) botSettings.botActive = !!botActive;
    if (enabledChannels !== undefined) botSettings.enabledChannels = enabledChannels;
    await saveSettings();
    res.json({ success: true });
});

// --- STARTUP ---
app.listen(PORT, () => console.log(`[WEB] Dashboard active on port ${PORT}`));
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('[BOT] Login failed:', err));

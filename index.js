#!/usr/bin/env node

/**
 * ✨ PIXEL AI BOT - V3 (FINAL STABILITY) ✨
 * Rebuilt to handle Render's filesystem resets and Discord Intent issues.
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

// --- CONFIG ---
const PORT = process.env.PORT || 3000;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const BOT_PREFIX = process.env.BOT_PREFIX || '!';
const SETTINGS_FILE = path.resolve('bot_settings.json');

// --- BOT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // CRITICAL: Must be ON in Discord Portal
        GatewayIntentBits.DirectMessages,
    ],
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- STATE ---
const userConversations = new Map();
let botSettings = {
    enabledChannels: [],
    botActive: true,
    totalQuestions: 0,
    totalDataConsumed: 0,
    startTime: Date.now(),
};

// --- PERSISTENCE ---
async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        botSettings = { ...botSettings, ...JSON.parse(data) };
        console.log('[DEBUG] Settings loaded from disk.');
    } catch (error) {
        console.log('[DEBUG] Settings file not found, using defaults.');
    }
}

async function saveSettings() {
    try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(botSettings, null, 2), 'utf8');
        console.log('[DEBUG] Settings saved to disk.');
    } catch (error) {
        console.error('[ERROR] Failed to save settings:', error);
    }
}

// --- DISCORD EVENTS ---
client.once('ready', async () => {
    console.log(`[BOT] Connected as ${client.user.tag}`);
    await loadSettings();
    client.user.setActivity('مساعدك الذكي V3 ✨', { type: 3 });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- EMERGENCY DEBUG COMMAND (Works everywhere) ---
    if (message.content === '!test') {
        console.log(`[DEBUG] Received !test from ${message.author.tag}`);
        return message.reply('✅ البوت متصل ويسمعك! إذا لم أرد على الأسئلة العادية، تأكد من تفعيل القناة من لوحة التحكم.');
    }

    // --- DIAGNOSTIC LOGGING ---
    console.log(`[MSG] Seen: "${message.content}" | Channel: ${message.channel.id} | Active: ${botSettings.botActive}`);

    // Check Global State
    if (!botSettings.botActive) {
        console.log('[DEBUG] Message ignored: Bot is disabled in dashboard.');
        return;
    }

    // Check Channel Permission
    if (!botSettings.enabledChannels.includes(message.channel.id)) {
        // Only log if it starts with prefix to avoid spamming logs
        if (message.content.startsWith(BOT_PREFIX)) {
            console.log(`[DEBUG] Message ignored: Channel ${message.channel.id} is NOT enabled.`);
        }
        return;
    }

    // Process AI Request
    if (message.content.startsWith(BOT_PREFIX)) {
        const query = message.content.slice(BOT_PREFIX.length).trim();
        if (!query) return;

        console.log(`[AI] Processing: ${query}`);
        await message.channel.sendTyping();

        try {
            let history = userConversations.get(message.author.id) || [];
            history.push({ role: 'user', content: query });
            if (history.length > 10) history = history.slice(-10);

            const completion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'أنت بوت ديسكورد عربي ذكي. ردودك قصيرة، واضحة، ومنسقة.' },
                    ...history
                ],
                model: 'llama3-8b-8192',
                temperature: 0.7,
            });

            const response = completion.choices[0]?.message?.content || 'خطأ في توليد الرد.';
            const tokens = completion.usage?.total_tokens || 0;

            botSettings.totalQuestions++;
            botSettings.totalDataConsumed += tokens;
            await saveSettings();

            history.push({ role: 'assistant', content: response });
            userConversations.set(message.author.id, history);

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setDescription(response)
                .setFooter({ text: `استهلاك: ${tokens} توكنز`, iconURL: client.user.displayAvatarURL() });

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('[AI ERROR]', error);
            await message.reply('❌ عذراً، واجهت مشكلة تقنية.');
        }
    }
});

// --- DASHBOARD (EXPRESS) ---
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'pixel-v3-secret', resave: false, saveUninitialized: false }));

const isAuth = (req, res, next) => req.session.user ? next() : res.redirect('/login');

app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/login', (req, res) => {
    res.send(`<body style="background:#232428;color:white;font-family:sans-serif;text-align:center;padding-top:100px;">
        <h2>تسجيل دخول البوت</h2>
        <a href="/auth/discord" style="background:#5865F2;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">الدخول عبر Discord</a>
    </body>`);
});

app.get('/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.CALLBACK_URL)}&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
});

app.get('/auth/discord/callback', async (req, res) => {
    try {
        const { code } = req.query;
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code, redirect_uri: process.env.CALLBACK_URL,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        const user = (await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } })).data;
        if (user.id !== ADMIN_USER_ID) return res.send('Unauthorized');
        
        req.session.user = user;
        req.session.guilds = (await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } })).data;
        res.redirect('/dashboard');
    } catch (e) { res.redirect('/login'); }
});

app.get('/dashboard', isAuth, async (req, res) => {
    const botGuilds = client.guilds.cache;
    const adminGuilds = req.session.guilds.filter(g => botGuilds.has(g.id));
    const selectedId = req.query.guildId;
    let channels = [];
    if (selectedId) {
        const g = botGuilds.get(selectedId);
        if (g) channels = g.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({id:c.id, name:c.name}));
    }

    res.send(`
    <body style="background:#232428;color:#DBDEE1;font-family:sans-serif;direction:rtl;padding:20px;">
        <div style="max-width:800px;margin:0 auto;background:#2B2D31;padding:20px;border-radius:8px;">
            <h2>🤖 لوحة تحكم Pixel AI</h2>
            <hr border="0" style="border-top:1px solid #3F4147;">
            <p>حالة البوت: <b style="color:${client.isReady()?'#248046':'#DA373C'}">${client.isReady()?'متصل':'أوفلاين'}</b></p>
            
            <div style="background:#1E1F22;padding:15px;border-radius:5px;margin:20px 0;">
                <label>تفعيل البوت:</label>
                <input type="checkbox" id="active" ${botSettings.botActive?'checked':''} onchange="update()">
            </div>

            <form action="/dashboard" method="GET">
                <label>اختر السيرفر:</label>
                <select name="guildId" onchange="this.form.submit()" style="width:100%;padding:10px;background:#1E1F22;color:white;border:1px solid #3F4147;">
                    <option value="">-- اختر --</option>
                    ${adminGuilds.map(g => `<option value="${g.id}" ${selectedId===g.id?'selected':''}>${g.name}</option>`).join('')}
                </select>
            </form>

            ${selectedId ? `
                <div style="margin-top:20px;">
                    <label>القنوات المفعلة:</label>
                    <div id="list" style="background:#1E1F22;padding:10px;margin-top:10px;max-height:200px;overflow-y:auto;">
                        ${channels.map(c => `<div><input type="checkbox" value="${c.id}" ${botSettings.enabledChannels.includes(c.id)?'checked':''}> #${c.name}</div>`).join('')}
                    </div>
                    <button onclick="save()" style="width:100%;padding:10px;margin-top:10px;background:#5865F2;color:white;border:none;border-radius:5px;cursor:pointer;">حفظ القنوات</button>
                </div>
            ` : ''}
        </div>
        <script>
            async function update() {
                await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({botActive:document.getElementById('active').checked}) });
            }
            async function save() {
                const ids = Array.from(document.querySelectorAll('#list input:checked')).map(i => i.value);
                await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({enabledChannels:ids}) });
                alert('تم الحفظ!');
            }
        </script>
    </body>`);
});

app.post('/api/settings', isAuth, async (req, res) => {
    const { botActive, enabledChannels } = req.body;
    if (botActive !== undefined) botSettings.botActive = botActive;
    if (enabledChannels !== undefined) botSettings.enabledChannels = enabledChannels;
    await saveSettings();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`[WEB] Active on port ${PORT}`));
client.login(process.env.DISCORD_TOKEN);

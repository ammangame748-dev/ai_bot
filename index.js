const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');

/**
 * CONFIGURATION
 */
const PORT = process.env.PORT || 3000;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const app = express();

// User Conversation Memory
const userMemory = new Map();

/**
 * DISCORD BOT LOGIC
 */
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}! (Perplexity 2026 Edition)`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try {
        message.channel.sendTyping();

        // Perplexity handles history and web search automatically in a single call
        const response = await axios.post('https://api.perplexity.ai/chat/completions', {
            model: "sonar-reasoning", // The best model for reasoning + web search
            messages: [
                { role: "system", content: "You are 'Ai bot', a highly advanced AI updated to 2026. You have real-time web search. Respond naturally in Arabic/English with emojis. Plain text only." },
                { role: "user", content: message.content }
            ],
            max_tokens: 1000
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiContent = response.data.choices[0].message.content;

        const embed = new EmbedBuilder()
            .setColor("#00a693") // Perplexity Teal
            .setAuthor({ name: 'Ai bot', iconURL: client.user.displayAvatarURL() })
            .setDescription(aiContent)
            .setFooter({ text: 'Powered by Perplexity AI (Real-time 2026)' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });

    } catch (error) {
        console.error("AI Error:", error.response ? JSON.stringify(error.response.data) : error.message);
        message.reply("عذراً، حدث خطأ. تأكد من صحة مفتاح الـ API الخاص بـ Perplexity.");
    }
});

/**
 * DASHBOARD (Simplified to ensure no errors)
 */
const CALLBACK_URL = process.env.CALLBACK_URL;
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));
passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

app.use(session({ secret: 'ai-bot-secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => res.send('<h1>Ai bot is Running!</h1><a href="/login">Login with Discord</a>'));
app.get('/login', passport.authenticate('discord'));
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/dashboard', (req, res) => res.send(`<h1>Welcome, ${req.user.username}</h1><p>Bot is active and using Perplexity AI.</p>`));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
client.login(process.env.DISCORD_TOKEN);

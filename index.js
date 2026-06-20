
require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const Groq = require("groq-sdk");
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs").promises;

// --- Discord Bot Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
});

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const BOT_PREFIX = process.env.BOT_PREFIX || "!";
const ADMIN_USER_ID = process.env.ADMIN_USER_ID; // Discord User ID for admin

// Store conversation history and bot settings
const userConversations = new Map(); // userId -> [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
let botSettings = {
    enabledChannels: [],
    botActive: true,
    totalQuestions: 0,
    totalDataConsumed: 0,
    startTime: Date.now(),
};

const SETTINGS_FILE = "bot_settings.json";

async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, "utf8");
        botSettings = { ...botSettings, ...JSON.parse(data) };
        console.log("Bot settings loaded.");
    } catch (error) {
        if (error.code === "ENOENT") {
            console.log("Settings file not found, creating default.");
            await saveSettings();
        } else {
            console.error("Failed to load bot settings:", error);
        }
    }
}

async function saveSettings() {
    try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(botSettings, null, 2), "utf8");
        console.log("Bot settings saved.");
    } catch (error) {
        console.error("Failed to save bot settings:", error);
    }
}

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await loadSettings();
    // Set bot presence
    client.user.setActivity("مع جروك", { type: 3 }); // 3 = Watching
});

client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!botSettings.botActive || !botSettings.enabledChannels.includes(message.channel.id)) {
        return; // Bot is inactive or channel is not enabled
    }

    if (message.content.startsWith(BOT_PREFIX)) {
        const userMessage = message.content.slice(BOT_PREFIX.length).trim();

        // Get or initialize conversation history for the user
        let conversation = userConversations.get(message.author.id) || [];

        // Add user message to history
        conversation.push({ role: "user", content: userMessage });

        // Keep conversation history to a reasonable length (e.g., last 10 messages)
        if (conversation.length > 10) {
            conversation = conversation.slice(conversation.length - 10);
        }

        userConversations.set(message.author.id, conversation);

        const startTime = Date.now();
        let groqResponseContent = "حدث خطأ أثناء معالجة طلبك.";
        let dataConsumed = 0;

        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: "أنت بوت ديسكورد عربي فخم ومرح، تتحدث بثقة وتستخدم إيموجيات ديسكورد متناسقة. مهمتك هي مساعدة المستخدمين والإجابة على أسئلتهم بذكاء وإبداع. أنت متصل بموديل Llama 3.1." },
                    ...conversation
                ],
                model: "llama3-8b-8192",
                temperature: 0.7,
                max_tokens: 1024,
            });

            groqResponseContent = chatCompletion.choices[0]?.message?.content || groqResponseContent;
            dataConsumed = chatCompletion.usage.total_tokens; // Example, adjust based on actual Groq API response
            botSettings.totalQuestions++;
            botSettings.totalDataConsumed += dataConsumed;
            await saveSettings();

            // Add bot response to history
            conversation.push({ role: "assistant", content: groqResponseContent });
            userConversations.set(message.author.id, conversation);

        } catch (error) {
            console.error("Error calling Groq API:", error);
            groqResponseContent = "عذراً، واجهت مشكلة في التواصل مع Groq AI. يرجى المحاولة مرة أخرى لاحقاً.";
        }

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        const embed = new EmbedBuilder()
            .setColor("#0099ff") // Discord blue
            .setTitle("✨ رد البوت السريع ✨")
            .setDescription(groqResponseContent)
            .setFooter({
                text: `زمن الاستجابة: ${responseTime}ms | استهلاك البيانات: ${dataConsumed} توكنز`,
                iconURL: client.user.displayAvatarURL(),
            })
            .setTimestamp();

        // Add server icon or GIF if available (example, needs actual implementation)
        if (message.guild && message.guild.iconURL()) {
            embed.setThumbnail(message.guild.iconURL());
        } else {
            // You can set a default GIF here if no guild icon
            // embed.setImage('URL_TO_YOUR_DEFAULT_GIF');
        }

        const clearMemoryButton = new ButtonBuilder()
            .setCustomId("clear_memory")
            .setLabel("مسح الذاكرة 🗑️")
            .setStyle(ButtonStyle.Danger);

        const usageStatsButton = new ButtonBuilder()
            .setCustomId("usage_stats")
            .setLabel("إحصائيات الاستخدام 📊")
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder()
            .addComponents(clearMemoryButton, usageStatsButton);

        await message.reply({ embeds: [embed], components: [row] });
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === "clear_memory") {
        userConversations.delete(interaction.user.id);
        await interaction.reply({ content: "تم مسح ذاكرتك بنجاح! يمكنك البدء بمحادثة جديدة.", ephemeral: true });
    } else if (interaction.customId === "usage_stats") {
        const uptimeSeconds = Math.floor((Date.now() - botSettings.startTime) / 1000);
        const uptimeString = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;

        await interaction.reply({
            content: `**إحصائيات استخدام البوت:**\n- عدد الأسئلة الكلي: ${botSettings.totalQuestions}\n- إجمالي استهلاك البيانات: ${botSettings.totalDataConsumed} توكنز\n- وقت تشغيل البوت: ${uptimeString}`,
            ephemeral: true
        });
    }
});

// --- Web Dashboard Setup ---
const app = express();
const PORT = process.env.WEB_PORT || 3000;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `http://localhost:${PORT}/auth/discord/callback`;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

// Embedded CSS
const embeddedCss = `
body {
    font-family: Arial, sans-serif;
    background-color: #2c2f33; /* Discord dark background */
    color: #ffffff; /* White text */
    margin: 0;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    direction: rtl; /* Right-to-left for Arabic */
    text-align: right;
}

.container {
    display: flex;
    width: 90%;
    max-width: 1200px;
    background-color: #36393f; /* Discord darker grey */
    border-radius: 8px;
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
    overflow: hidden;
}

.sidebar {
    width: 250px;
    background-color: #23272a; /* Even darker grey for sidebar */
    padding: 20px;
    border-left: 1px solid #2c2f33;
    text-align: center;
}

.sidebar h2 {
    color: #7289da; /* Discord blue */
    margin-bottom: 15px;
}

.sidebar .avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    margin-bottom: 15px;
    border: 2px solid #7289da;
}

.sidebar hr {
    border-color: #4f545c;
    margin: 20px 0;
}

.sidebar h3 {
    color: #99aab5; /* Light grey */
    margin-bottom: 10px;
}

.sidebar p {
    font-size: 0.9em;
    margin-bottom: 5px;
}

.bot-status {
    font-weight: bold;
}

.bot-status.online {
    color: #43b581; /* Green */
}

.bot-status.offline {
    color: #f04747; /* Red */
}

.logout-button {
    display: block;
    background-color: #f04747; /* Red */
    color: white;
    padding: 10px 15px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    text-decoration: none;
    margin-top: 20px;
    transition: background-color 0.3s ease;
}

.logout-button:hover {
    background-color: #cc3c3c;
}

.main-content {
    flex-grow: 1;
    padding: 20px;
}

h1 {
    color: #7289da;
    text-align: center;
    margin-bottom: 30px;
}

.card {
    background-color: #2f3136; /* Discord grey */
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.card h3 {
    color: #ffffff;
    margin-top: 0;
    margin-bottom: 15px;
    border-bottom: 1px solid #4f545c;
    padding-bottom: 10px;
}

.form-group {
    margin-bottom: 15px;
}

label {
    display: block;
    margin-bottom: 5px;
    color: #99aab5;
}

select, input[type="text"] {
    width: 100%;
    padding: 10px;
    border-radius: 5px;
    border: 1px solid #4f545c;
    background-color: #40444b;
    color: #ffffff;
    box-sizing: border-box;
}

select:focus, input[type="text"]:focus {
    border-color: #7289da;
    outline: none;
}

.discord-login-button {
    display: inline-block;
    background-color: #7289da; /* Discord blue */
    color: white;
    padding: 12px 25px;
    border: none;
    border-radius: 5px;
    font-size: 1.1em;
    cursor: pointer;
    text-decoration: none;
    transition: background-color 0.3s ease;
    margin-top: 20px;
}

.discord-login-button:hover {
    background-color: #677bc4;
}

.error-message {
    color: #f04747;
    background-color: #5c2d2d;
    padding: 10px;
    border-radius: 5px;
    margin-bottom: 15px;
}

.switch {
    position: relative;
    display: inline-block;
    width: 60px;
    height: 34px;
    margin-left: 10px;
    vertical-align: middle;
}

.switch input {
    opacity: 0;
    width: 0;
    height: 0;
}

.slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    -webkit-transition: .4s;
    transition: .4s;
}

.slider:before {
    position: absolute;
    content: "";
    height: 26px;
    width: 26px;
    left: 4px;
    bottom: 4px;
    background-color: white;
    -webkit-transition: .4s;
    transition: .4s;
}

input:checked + .slider {
    background-color: #7289da;
}

input:focus + .slider {
    box-shadow: 0 0 1px #7289da;
}

input:checked + .slider:before {
    -webkit-transform: translateX(26px);
    -ms-transform: translateX(26px);
    transform: translateX(-26px); /* Adjusted for RTL */
}

/* Rounded sliders */
.slider.round {
    border-radius: 34px;
}

.slider.round:before {
    border-radius: 50%;
}

#botStatusText {
    vertical-align: middle;
    font-weight: bold;
    margin-right: 10px;
}

.channel-list {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #4f545c;
    border-radius: 5px;
    padding: 10px;
    background-color: #40444b;
    margin-bottom: 15px;
}

.channel-item {
    display: block;
    margin-bottom: 8px;
    cursor: pointer;
}

.channel-item input[type="checkbox"] {
    margin-left: 10px; /* Adjusted for RTL */
    width: auto;
}

.save-button {
    background-color: #43b581; /* Green */
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s ease;
}

.save-button:hover {
    background-color: #36946f;
}
`;

// Embedded Login HTML
const loginHtml = (query) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تسجيل الدخول - بوت ديسكورد</title>
    <style>${embeddedCss}</style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h2>تسجيل الدخول</h2>
            ${query.error ? `
                <p class="error-message">
                    ${query.error === 'no_code' ? 'خطأ: لم يتم استلام رمز المصادقة من ديسكورد.' : ''}
                    ${query.error === 'oauth_failed' ? 'خطأ: فشلت عملية المصادقة مع ديسكورد. يرجى المحاولة مرة أخرى.' : ''}
                    ${query.error === 'not_admin' ? 'خطأ: أنت لست المسؤول المعتمد لهذا البوت.' : ''}
                    ${!['no_code', 'oauth_failed', 'not_admin'].includes(query.error) ? `حدث خطأ غير معروف: ${query.error}` : ''}
                </p>
            ` : ''}
            <a href="/auth/discord" class="discord-login-button">
                تسجيل الدخول باستخدام ديسكورد
            </a>
        </div>
    </div>
</body>
</html>
`;

// Embedded Dashboard HTML
const dashboardHtml = (data) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لوحة تحكم بوت ديسكورد</title>
    <style>${embeddedCss}</style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <h2>مرحباً، ${data.user.username}</h2>
            <img src="https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=128" alt="Avatar" class="avatar">
            <a href="/logout" class="logout-button">تسجيل الخروج</a>
            <hr>
            <h3>إحصائيات البوت</h3>
            <p>حالة البوت: <span class="bot-status ${data.botStatus === 'متصل' ? 'online' : 'offline'}">${data.botStatus}</span></p>
            <p>الأسئلة الكلية: ${data.totalQuestions}</p>
            <p>استهلاك البيانات: ${data.totalDataConsumed} توكنز</p>
            <p>وقت التشغيل: ${data.uptime}</p>
        </div>
        <div class="main-content">
            <h1>لوحة تحكم بوت ديسكورد</h1>

            <div class="card">
                <h3>التحكم بالبوت</h3>
                <label class="switch">
                    <input type="checkbox" id="botToggle" ${data.botSettings.botActive ? 'checked' : ''}>
                    <span class="slider round"></span>
                </label>
                <span id="botStatusText">${data.botSettings.botActive ? 'البوت مفعل' : 'البوت معطل'}</span>
            </div>

            <div class="card">
                <h3>اختيار السيرفر والقنوات</h3>
                <form id="guildSelectForm">
                    <label for="guildSelect">اختر سيرفر:</label>
                    <select id="guildSelect" name="guildId" onchange="this.form.submit()">
                        <option value="">-- اختر سيرفر --</option>
                        ${data.guilds.map(guild => `
                            <option value="${guild.id}" ${data.selectedGuildId === guild.id ? 'selected' : ''}>${guild.name}</option>
                        `).join('')}
                    </select>
                </form>

                ${data.selectedGuildId ? `
                    <form id="channelSettingsForm">
                        <h4>قنوات الدردشة في السيرفر المحدد:</h4>
                        <div class="channel-list">
                            ${data.channels.length > 0 ? `
                                ${data.channels.map(channel => `
                                    <label class="channel-item">
                                        <input type="checkbox" name="enabledChannels" value="${channel.id}" ${data.botSettings.enabledChannels.includes(channel.id) ? 'checked' : ''}>
                                        #${channel.name}
                                    </label>
                                `).join('')}
                            ` : `
                                <p>لا توجد قنوات نصية في هذا السيرفر.</p>
                            `}
                        </div>
                        <button type="submit" class="save-button">حفظ إعدادات القنوات</button>
                    </form>
                ` : `
                    <p>الرجاء اختيار سيرفر لعرض القنوات.</p>
                `}
            </div>
        </div>
    </div>

    <script>
        document.getElementById("botToggle").addEventListener("change", async function() {
            const botActive = this.checked;
            const response = await fetch("/api/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ botActive }),
            });
            const data = await response.json();
            if (data.success) {
                document.getElementById("botStatusText").textContent = botActive ? "البوت مفعل" : "البوت معطل";
                alert("تم تحديث حالة البوت بنجاح!");
            } else {
                alert("فشل تحديث حالة البوت.");
            }
        });

        document.getElementById("channelSettingsForm")?.addEventListener("submit", async function(event) {
            event.preventDefault();
            const checkboxes = document.querySelectorAll("input[name=\'enabledChannels\"]:checked");
            const enabledChannels = Array.from(checkboxes).map(cb => cb.value);

            const response = await fetch("/api/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ enabledChannels }),
            });
            const data = await response.json();
            if (data.success) {
                alert("تم حفظ إعدادات القنوات بنجاح!");
            } else {
                alert("فشل حفظ إعدادات القنوات.");
            }
        });
    </script>
</body>
</html>
`;

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect("/login");
}

// Login route
app.get("/login", (req, res) => {
    res.send(loginHtml(req.query));
});

// Discord OAuth2 login
app.get("/auth/discord", (req, res) => {
    const authorizeURL = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(authorizeURL);
});

// Discord OAuth2 callback
app.get("/auth/discord/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.redirect("/login?error=no_code");
    }

    try {
        const tokenResponse = await axios.post("https://discord.com/api/oauth2/token", new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: DISCORD_REDIRECT_URI,
            scope: "identify guilds",
        }).toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });

        const { access_token, token_type } = tokenResponse.data;

        const userResponse = await axios.get("https://discord.com/api/users/@me", {
            headers: {
                authorization: `${token_type} ${access_token}`,
            },
        });

        const userGuildsResponse = await axios.get("https://discord.com/api/users/@me/guilds", {
            headers: {
                authorization: `${token_type} ${access_token}`,
            },
        });

        // Check if the authenticated user is the admin
        if (userResponse.data.id !== ADMIN_USER_ID) {
            return res.redirect("/login?error=not_admin");
        }

        req.session.user = userResponse.data;
        req.session.guilds = userGuildsResponse.data;
        res.redirect("/dashboard");

    } catch (error) {
        console.error("Error during Discord OAuth2 callback:", error.response ? error.response.data : error.message);
        res.redirect("/login?error=oauth_failed");
    }
});

// Logout route
app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Error destroying session:", err);
        }
        res.redirect("/login");
    });
});

// Dashboard route
app.get("/dashboard", isAuthenticated, async (req, res) => {
    const guilds = req.session.guilds;
    const botGuilds = client.guilds.cache;
    const availableGuilds = guilds.filter(g => botGuilds.has(g.id));

    let channels = [];
    if (req.query.guildId) {
        const selectedGuild = client.guilds.cache.get(req.query.guildId);
        if (selectedGuild) {
            channels = selectedGuild.channels.cache
                .filter(channel => channel.type === 0) // Text channels
                .map(channel => ({ id: channel.id, name: channel.name }));
        }
    }

    const uptimeSeconds = Math.floor((Date.now() - botSettings.startTime) / 1000);
    const uptimeString = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;

    res.send(dashboardHtml({
        user: req.session.user,
        guilds: availableGuilds,
        channels: channels,
        botSettings: botSettings,
        selectedGuildId: req.query.guildId || null,
        botStatus: client.isReady() ? "متصل" : "غير متصل",
        totalQuestions: botSettings.totalQuestions,
        totalDataConsumed: botSettings.totalDataConsumed,
        uptime: uptimeString,
    }));
});

// API to update bot settings
app.post("/api/settings", isAuthenticated, async (req, res) => {
    const { enabledChannels, botActive } = req.body;

    if (enabledChannels !== undefined) {
        botSettings.enabledChannels = enabledChannels;
    }
    if (botActive !== undefined) {
        botSettings.botActive = botActive === "true"; // Convert string to boolean
    }

    await saveSettings();
    res.json({ success: true, botSettings });
});

// Serve embedded CSS directly
app.get('/style.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.send(embeddedCss);
});

// Start the web server
app.listen(PORT, () => {
    console.log(`Web dashboard running on http://localhost:${PORT}`);
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_BOT_TOKEN);

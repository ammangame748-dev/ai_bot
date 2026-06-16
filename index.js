import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import Replicate from "replicate";
import express from "express";
import axios from "axios";
import Groq from "groq-sdk";
import { Buffer } from "buffer";

// =====================
// EXPRESS DASHBOARD
// =====================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// =====================
// API CLIENTS
// =====================
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// =====================
// CONFIG (DASH CONTROL)
// =====================
let CARDS_CONFIG = {
    IMAGES_CHANNEL_ID: "",
    CHAT_CHANNEL_ID: "",
    LINKS_CHANNEL_ID: ""
};

// =====================
// DASHBOARD (PLACEHOLDER)
// =====================
app.get("/", (req, res) => {
    res.send("<h1>Bot Dashboard Running ✅</h1>");
});

app.post("/save-config", (req, res) => {
    CARDS_CONFIG.IMAGES_CHANNEL_ID = req.body.IMAGES_CHANNEL_ID?.trim();
    CARDS_CONFIG.CHAT_CHANNEL_ID = req.body.CHAT_CHANNEL_ID?.trim();
    CARDS_CONFIG.LINKS_CHANNEL_ID = req.body.LINKS_CHANNEL_ID?.trim();

    console.log("🔄 CONFIG UPDATED:", CARDS_CONFIG);

    res.redirect("/?saved=true");
});

app.listen(PORT, () => {
    console.log(`🌐 Dashboard running on port ${PORT}`);
});

// =====================
// DISCORD CLIENT
// =====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
});

// =====================
// MESSAGE SYSTEM
// =====================
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const channelId = message.channel.id;

    // =====================
    // 🖼 IMAGE SYSTEM
    // =====================
    if (CARDS_CONFIG.IMAGES_CHANNEL_ID && channelId === CARDS_CONFIG.IMAGES_CHANNEL_ID) {

        // 🧽 REMOVE BACKGROUND
        if (message.attachments.size > 0 && message.content.includes("ازالة خلفية")) {
            await message.channel.sendTyping();

            const imageUrl = message.attachments.first().url;

            try {
                const formData = new URLSearchParams();
                formData.append("image_url", imageUrl);
                formData.append("size", "auto");

                const response = await axios.post(
                    "https://api.remove.bg/v1.0/removebg",
                    formData,
                    {
                        headers: {
                            "X-API-Key": process.env.REMOVE_BG_KEY,
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        responseType: "arraybuffer"
                    }
                );

                const buffer = Buffer.from(response.data);
                const file = new AttachmentBuilder(buffer, { name: "no-bg.png" });

                return message.reply({
                    content: "✨ تم إزالة الخلفية بنجاح",
                    files: [file]
                });

            } catch (err) {
                console.error(err);
                return message.reply("❌ فشل إزالة الخلفية");
            }
        }

        // 🎨 GENERATE IMAGE
        if (message.content.startsWith("انشئ صورة")) {
            await message.channel.sendTyping();

            const prompt = message.content.replace("انشئ صورة", "").trim();
            if (!prompt) return message.reply("اكتب وصف الصورة");

            try {
                const output = await replicate.run(
                    "black-forest-labs/flux-dev",
                    {
                        input: { prompt }
                    }
                );

                const image = output?.[0];
                return message.reply(image);

            } catch (err) {
                console.error(err);
                return message.reply("❌ فشل إنشاء الصورة");
            }
        }
    }

    // =====================
    // 💬 CHAT SYSTEM
    // =====================
    if (CARDS_CONFIG.CHAT_CHANNEL_ID && channelId === CARDS_CONFIG.CHAT_CHANNEL_ID) {
        await message.channel.sendTyping();

        try {
            const chat = await groq.chat.completions.create({
                messages: [{ role: "user", content: message.content }],
                model: "llama-3.1-8b-instant",
            });

            return message.reply(
                chat?.choices?.[0]?.message?.content || "❌ ما قدرت أرد"
            );

        } catch (err) {
            console.error(err);
            return message.reply("❌ خطأ بالدردشة");
        }
    }

    // =====================
    // 📥 LINKS SYSTEM
    // =====================
    if (CARDS_CONFIG.LINKS_CHANNEL_ID && channelId === CARDS_CONFIG.LINKS_CHANNEL_ID) {

        const urlRegex = /(tiktok\.com|instagram\.com|twitter\.com|x\.com)/gi;
        if (!urlRegex.test(message.content)) return;

        await message.channel.sendTyping();

        const urls = message.content.match(/https?:\/\/[^\s]+/g);
        if (!urls) return;

        try {
            const response = await axios.post(
                `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
                {
                    directUrls: [urls[0]],
                    resultsLimit: 1
                }
            );

            const data = response.data?.[0];

            const media =
                data?.videoUrl ||
                data?.displayUrl ||
                data?.url;

            if (!media) return message.reply("❌ ما تم العثور على ميديا");

            await message.channel.send({
                content: "📥 تم التحميل:",
                files: [{ attachment: media }]
            });

            return message.delete().catch(() => {});

        } catch (err) {
            console.error(err);
            return message.reply("❌ فشل التحميل");
        }
    }
});

// =====================
// LOGIN
// =====================
if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN);
} else {
    console.error("❌ Missing DISCORD_TOKEN");
}

import { Client, GatewayIntentBits, AttachmentBuilder } from 'discord.js';
import express from 'express';
import axios from 'axios';
import fs from 'fs';
import 'dotenv/config';

// =========================
// 🌐 EXPRESS DASHBOARD
// =========================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CONFIG_FILE = './cards_config.json';

let CARDS_CONFIG = {
  IMAGES_CHANNEL_ID: "",
  CHAT_CHANNEL_ID: "",
  LINKS_CHANNEL_ID: ""
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    CARDS_CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {}
}

app.get('/', (req, res) => {
  res.send(`
    <html dir="rtl">
      <body style="font-family:tajawal;background:#111;color:white;padding:40px">
        <h2>🤖 Bot Dashboard</h2>
        <form method="POST" action="/save">
          <input name="IMAGES_CHANNEL_ID" placeholder="Images Channel" value="${CARDS_CONFIG.IMAGES_CHANNEL_ID}" /><br><br>
          <input name="CHAT_CHANNEL_ID" placeholder="Chat Channel" value="${CARDS_CONFIG.CHAT_CHANNEL_ID}" /><br><br>
          <input name="LINKS_CHANNEL_ID" placeholder="Links Channel" value="${CARDS_CONFIG.LINKS_CHANNEL_ID}" /><br><br>
          <button>Save</button>
        </form>
      </body>
    </html>
  `);
});

app.post('/save', (req, res) => {
  CARDS_CONFIG = {
    IMAGES_CHANNEL_ID: req.body.IMAGES_CHANNEL_ID?.trim(),
    CHAT_CHANNEL_ID: req.body.CHAT_CHANNEL_ID?.trim(),
    LINKS_CHANNEL_ID: req.body.LINKS_CHANNEL_ID?.trim()
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(CARDS_CONFIG, null, 2));
  res.redirect('/');
});

app.listen(PORT, () => console.log("🌐 Dashboard running:", PORT));

// =========================
// 🤖 DISCORD CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =========================
// 🤖 OPENROUTER
// =========================
const openrouter = new (await import("openai")).OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

// =========================
// READY
// =========================
client.once('ready', () => {
  console.log(`🤖 Bot online: ${client.user.tag}`);
});

// =========================
// MESSAGE HANDLER
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;

  // ========== حماية طول الرسائل ==========
  const safeReply = async (text) => {
    if (!text) return message.reply("❌ لا يوجد رد");

    const chunks = [];
    for (let i = 0; i < text.length; i += 1900) {
      chunks.push(text.substring(i, i + 1900));
    }

    for (const chunk of chunks) {
      await message.channel.send(chunk);
    }
  };

  // ========== رفع صورة ==========
  const imageUrl = message.attachments.first()?.url;

  // =======================
  // 🖼️ IMAGES CARD
  // =======================
  if (
    CARDS_CONFIG.IMAGES_CHANNEL_ID &&
    channelId === CARDS_CONFIG.IMAGES_CHANNEL_ID
  ) {

    // ❌ إزالة الخلفية
    if (message.content.includes("ازالة خلفية") && imageUrl) {
      try {
        const res = await axios.post(
          "https://api.remove.bg/v1.0/removebg",
          { image_url: imageUrl, size: "auto" },
          {
            headers: { "X-Api-Key": process.env.REMOVE_BG_KEY },
            responseType: "arraybuffer",
          }
        );

        return message.reply({
          files: [new AttachmentBuilder(Buffer.from(res.data), { name: "no-bg.png" })],
        });

      } catch (e) {
        return message.reply("❌ فشل إزالة الخلفية");
      }
    }

    // ✨ تحسين صورة (HuggingFace)
    if (message.content.includes("تحسين") && imageUrl) {
      try {
        const res = await axios.post(
          "https://api-inference.huggingface.co/models/ai-forever/Real-ESRGAN",
          { inputs: imageUrl },
          {
            headers: {
              Authorization: `Bearer ${process.env.HF_API_KEY}`,
            },
            responseType: "arraybuffer",
          }
        );

        return message.reply({
          files: [new AttachmentBuilder(Buffer.from(res.data), { name: "up.png" })],
        });

      } catch (e) {
        return message.reply("❌ فشل التحسين");
      }
    }

    // 🎨 توليد صورة (نص)
    if (message.content.startsWith("انشئ صورة")) {
      const prompt = message.content.replace("انشئ صورة", "").trim();
      if (!prompt) return message.reply("اكتب وصف الصورة");

      try {
        const res = await axios.post(
          "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1",
          { inputs: prompt },
          {
            headers: {
              Authorization: `Bearer ${process.env.HF_API_KEY}`,
            },
            responseType: "arraybuffer",
          }
        );

        return message.reply({
          files: [new AttachmentBuilder(Buffer.from(res.data), { name: "img.png" })],
        });

      } catch (e) {
        return message.reply("❌ فشل توليد الصورة");
      }
    }
  }

  // =======================
  // 💬 CHAT CARD
  // =======================
  if (
    CARDS_CONFIG.CHAT_CHANNEL_ID &&
    channelId === CARDS_CONFIG.CHAT_CHANNEL_ID
  ) {
    try {
      const res = await openrouter.chat.completions.create({
        model: "openrouter/free",
        messages: [{ role: "user", content: message.content }],
      });

      const reply = res.choices?.[0]?.message?.content;
      return safeReply(reply);

    } catch (e) {
      return message.reply("❌ خطأ بالدردشة");
    }
  }

  // =======================
  // 📥 LINKS CARD
  // =======================
  if (
    CARDS_CONFIG.LINKS_CHANNEL_ID &&
    channelId === CARDS_CONFIG.LINKS_CHANNEL_ID
  ) {

    const url = message.content.match(/https?:\/\/[^\s]+/);
    if (!url) return;

    try {
      const res = await axios.post(
        "https://api.cobalt.tools/api/json",
        { url: url[0], vQuality: "720" },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      const video = res.data?.url;
      if (!video) return message.reply("❌ ما قدرنا نجيب الرابط");

      return message.channel.send(`📥 الرابط:\n${video}`);

    } catch (e) {
      return message.reply("❌ فشل التحميل");
    }
  }
});

// =========================
// LOGIN
// =========================
client.login(process.env.DISCORD_TOKEN);

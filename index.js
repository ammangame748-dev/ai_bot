import "dotenv/config";
import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import express from "express";
import axios from "axios";
import FormData from "form-data";

/* ================= SERVER ================= */
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("🤖 ULTIMATE BOT V3 PRO ONLINE");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Dashboard running");
});

/* ================= MEMORY ================= */
const memory = new Map();

/* ================= RATE LIMIT ================= */
const cooldown = new Map();
function rateLimit(id) {
  const now = Date.now();
  const last = cooldown.get(id) || 0;
  if (now - last < 2500) return false;
  cooldown.set(id, now);
  return true;
}

/* ================= AI ================= */
async function askAI(text, userId) {
  const history = memory.get(userId) || [];

  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "meta-llama/llama-3.1-8b-instruct",
      messages: [
        ...history,
        { role: "user", content: text }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const reply = res.data.choices[0]?.message?.content || "لم أتمكن من الحصول على رد.";

  history.push(
    { role: "user", content: text },
    { role: "assistant", content: reply }
  );

  if (history.length > 20) history.splice(0, 2);
  memory.set(userId, history);

  return reply;
}

/* ================= REMOVE BG ================= */
async function removeBG(url) {
  const form = new FormData();
  form.append("image_url", url);
  form.append("size", "auto");

  const res = await axios.post(
    "https://api.remove.bg/v1.0/removebg",
    form,
    {
      headers: {
        "X-Api-Key": process.env.REMOVE_BG_KEY,
        ...form.getHeaders()
      },
      responseType: "arraybuffer"
    }
  );

  return Buffer.from(res.data);
}

async function downloadVideo(url) {
const res = await axios.post(
  "https://cobalt.tools/api/json",
  {
    url: url
  },
  {
    headers: {
      "Content-Type": "application/json"
    },
    timeout: 20000
  }
);

  return res.data?.url;
}


/* ================= IMAGE ANALYSIS ================= */
async function analyzeImage(url) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "meta-llama/llama-3-vision:free",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "حلل الصورة بالتفصيل" },
            { type: "image_url", image_url: { url } }
          ]
        }
      ]
    },
    {
         headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    }

    }
  );

  return res.data.choices[0].message.content;
}

/* ================= DISCORD ================= */
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

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const msg = message.content;
  const userId = message.author.id;

  if (!rateLimit(userId)) {
    return message.reply("⏳ Slow down شوي");
  }

  try {

    /* 🤖 AI */
   /* 🤖 AI */
  if (msg.startsWith("سؤال")) {
    const text = msg.replace("سؤال", "").trim();
    if (!text) return message.reply("❌ اكتب سؤالك بعد كلمة سؤال");

    await message.channel.sendTyping(); 
    const reply = await askAI(text, userId);
    return message.reply(reply);
  }


    /* 🖼️ IMAGE ANALYSIS */
    if (msg.includes("حلل") && message.attachments.size > 0) {
      const img = message.attachments.first().url;
      const result = await analyzeImage(img);
      return message.reply(result);
    }

    /* ✂️ REMOVE BG */
    if (msg.includes("ازالة خلفية") && message.attachments.size > 0) {
      const img = message.attachments.first().url;
      const buffer = await removeBG(img);

      return message.reply({
        files: [new AttachmentBuilder(buffer, { name: "no-bg.png" })]
      });
    }

    /* 📥 VIDEO DOWNLOAD */
    if (/instagram|tiktok|twitter|x\.com/.test(msg)) {
      const video = await downloadVideo(msg);

      if (!video) return message.reply("❌ ما قدرت أحمل الفيديو");

      return message.reply(video);
    }

  } catch (err) {
    console.log(err);
    return message.reply("❌ صار خطأ داخل النظام");
  }
});

/* ================= LOGIN ================= */
if (!process.env.DISCORD_TOKEN) {
  console.log("❌ Missing token");
} else {
  client.login(process.env.DISCORD_TOKEN);
}

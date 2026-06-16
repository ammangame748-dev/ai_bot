import "dotenv/config";
import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import express from "express";
import axios from "axios";
import FormData from "form-data";
import fs from "fs"; // مسح أو إضافة هذا السطر مع الـ imports فوق
function safeReply(message, text) {
  if (!text) return;

  const max = 3900;

  if (text.length > max) {
    text = text.slice(0, max) + "\n\n... (cut)";
  }

  return message.reply(text);
}
const SETTINGS_FILE = "./bot_settings.json";
let botSettings = {
  ai_room: "",
  vision_room: "",
  bg_room: "",
  download_room: ""
};

// إذا الملف موجود، اقرأ البيانات منه
if (fs.existsSync(SETTINGS_FILE)) {
  botSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}

// دالة لحفظ الإعدادات بالملف عند التعديل
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(botSettings, null, 2));
}

/* ================= SERVER ================= */
const app = express();
app.use(express.json());

// تفعيل قراءة البيانات القادمة من الفورم (توضع تحت app.use(express.json());)
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>لوحة التحكم</title>
      <style>
        body { font-family: sans-serif; background-color: #0f111a; color: #fff; padding: 20px; display: flex; flex-direction: column; align-items: center; }
        .container { max-width: 800px; width: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px; }
        .card { background-color: #161925; border: 1px solid #23273a; border-radius: 10px; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
        .card h3 { margin-top: 0; color: #5865F2; }
        input { background-color: #0f111a; border: 1px solid #23273a; padding: 10px; border-radius: 6px; color: #fff; width: 90%; }
        .btn { grid-column: 1 / -1; background-color: #5865F2; color: #fff; padding: 15px; border: none; border-radius: 8px; font-size: 1.1rem; cursor: pointer; font-weight: bold; margin-top: 10px; }
        .btn:hover { background-color: #4752c4; }
      </style>
    </head>
    <body>
      <h1>🤖 لوحة تحكم البوت الاحترافية</h1>
      <form action="/save" method="POST" style="width: 100%; max-width: 800px; display: contents;">
        <div class="container">
          
          <div class="card">
            <h3>🤖 بطاقة الذكاء الاصطناعي</h3>
            <p>أدخل ID الروم المخصصة لأمر (سؤال):</p>
            <input type="text" name="ai_room" value="${botSettings.ai_room}">
          </div>

          <div class="card">
            <h3>🖼️ بطاقة تحليل الصور</h3>
            <p>أدخل ID الروم المخصصة لأمر (حلل):</p>
            <input type="text" name="vision_room" value="${botSettings.vision_room}">
          </div>

          <div class="card">
            <h3>✂️ بطاقة إزالة الخلفية</h3>
            <p>أدخل ID الروم المخصصة لأمر (ازالة خلفية):</p>
            <input type="text" name="bg_room" value="${botSettings.bg_room}">
          </div>

          <div class="card">
            <h3>📥 بطاقة تحميل الفيديوهات</h3>
            <p>أدخل ID الروم المخصصة للروابط المباشرة:</p>
            <input type="text" name="download_room" value="${botSettings.download_room}">
          </div>

          <button type="submit" class="btn">💾 حفظ الإعدادات وتحديث البوت</button>
        </div>
      </form>
    </body>
    </html>
  `);
});

// استقبال البيانات عند الضغط على زر الحفظ
app.post("/save", (req, res) => {
  botSettings.ai_room = req.body.ai_room.trim();
  botSettings.vision_room = req.body.vision_room.trim();
  botSettings.bg_room = req.body.bg_room.trim();
  botSettings.download_room = req.body.download_room.trim();
  
  saveSettings(); // حفظ في الملف النصي
  res.redirect("/"); // إعادة توجيه للرئيسية
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

  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-flash-1.5",
        messages: [
          ...history,
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    const reply =
      res.data?.choices?.[0]?.message?.content ||
      "لم أتمكن من الحصول على رد.";

    if (!reply || reply.trim().length === 0) {
      return "لم أتمكن من الحصول على رد.";
    }

    history.push(
      { role: "user", content: text },
      { role: "assistant", content: reply }
    );

    if (history.length > 10) history.splice(0, 2);

    memory.set(userId, history);

    return reply;

  } catch (err) {
    console.error("AI ERROR:", err?.response?.data || err.message);
    return "❌ صار خطأ في الذكاء الاصطناعي";
  }
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
  "https://co.wuk.sh/api/json",
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


async function analyzeImage(url) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "meta-llama/llama-3.1-8b-instruct", // نموذج رؤية مجاني ومستقر جداً على OpenRouter
      messages: [
        {
          role: "user",
         messages: [
  {
    role: "user",
    content: "حلل الصورة بالتفصيل باللغة العربية: " + url
  }
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

  return res.data.choices?.[0]?.message?.content || "لم أتمكن من تحليل الصورة.";

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
  const channelId = message.channel.id;

  if (!rateLimit(userId + channelId)) {
    return message.reply("⏳ Slow down شوي");
  }

  try {
    /* 🤖 AI */
    if (msg.startsWith("سؤال") && botSettings.ai_room && channelId === botSettings.ai_room) {
      const text = msg.replace("سؤال", "").trim();
      if (!text) return message.reply("❌ اكتب سؤالك بعد كلمة سؤال");

      await message.channel.sendTyping(); 
      const reply = await askAI(text, userId);
      return safeReply(message, reply);
    }

    /* 🖼️ IMAGE ANALYSIS */
    if (msg.includes("حلل") && message.attachments.size > 0 && botSettings.vision_room && channelId === botSettings.vision_room) {
      await message.channel.sendTyping();
      const img = message.attachments.first().url;
      const result = await analyzeImage(img);
      return message.reply(result);
    }

    /* ✂️ REMOVE BG */
    if (msg.includes("ازالة خلفية") && message.attachments.size > 0 && botSettings.bg_room && channelId === botSettings.bg_room) {
      try {
        const img = message.attachments.first().url;
        await message.channel.sendTyping();
        const buffer = await removeBG(img);
        return message.reply({
          files: [new AttachmentBuilder(buffer, { name: "no-bg.png" })]
        });
      } catch (err) {
        console.error("BG ERROR:", err);
        return message.reply("❌ فشل إزالة الخلفية");
      }
    }

    /* 📥 VIDEO DOWNLOAD */
    if (/instagram|tiktok|twitter|x\.com/.test(msg) && botSettings.download_room && channelId === botSettings.download_room) {
      try {
        await message.channel.sendTyping();
        const video = await downloadVideo(msg);
        if (!video) {
          return message.reply("❌ ما قدرت أحمل الفيديو");
        }
        return message.reply(video);
      } catch (err) {
        console.error("DOWNLOAD ERROR:", err);
        return message.reply("❌ صار خطأ أثناء تحميل الفيديو");
      }
    }

  } catch (err) {
    console.error("GLOBAL ERROR:", err);
    return message.reply("❌ صار خطأ داخل النظام");
  }
});

/* ================= LOGIN ================= */
if (!process.env.DISCORD_TOKEN) {
  console.log("❌ Missing token");
} else {
  client.login(process.env.DISCORD_TOKEN);
}

import { Client, GatewayIntentBits, AttachmentBuilder } from 'discord.js';
import 'dotenv/config'; 
import { OpenAI } from 'openai';
import express from 'express';
import axios from 'axios';
import fs from 'fs';

// 1. إعداد خادم الويب (Express) وتأمين حفظ البيانات
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const CONFIG_FILE = './cards_config.json';
let CARDS_CONFIG = { IMAGES_CHANNEL_ID: "", CHAT_CHANNEL_ID: "", LINKS_CHANNEL_ID: "" };

if (fs.existsSync(CONFIG_FILE)) {
  try {
    CARDS_CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) {
    console.log("⚠️ فشل قراءة ملف الإعدادات القديم.");
  }
}

// واجهة الداش بورد
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة تحكم بوت الذكاء الاصطناعي المتكامل</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Tajawal', sans-serif; background-color: #0e1118; color: #e2e8f0; margin: 0; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; }
            h1 { color: #5865F2; margin-bottom: 10px; font-size: 2.2rem; }
            p.subtitle { color: #94a3b8; margin-bottom: 40px; font-size: 1.1rem; }
            .container { display: flex; flex-wrap: wrap; gap: 25px; justify-content: center; max-width: 1200px; width: 100%; }
            .card { background: #161b26; border: 2px solid #232a3c; border-radius: 16px; padding: 30px; width: 320px; box-shadow: 0 10px 20px rgba(0,0,0,0.3); transition: transform 0.3s, border-color 0.3s; display: flex; flex-direction: column; justify-content: space-between; }
            .card:hover { transform: translateY(-5px); border-color: #5865F2; }
            .card-title { font-size: 1.4rem; font-weight: bold; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
            .card-desc { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 25px; min-height: 70px; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 8px; font-size: 0.9rem; color: #cbd5e1; }
            input[type="text"] { width: 100%; padding: 12px; background: #0f131a; border: 1px solid #2d3748; border-radius: 8px; color: #fff; font-size: 1rem; box-sizing: border-box; text-align: center; }
            input[type="text"]:focus { border-color: #5865F2; outline: none; }
            button { width: 100%; background: #5865F2; color: white; border: none; padding: 12px; font-size: 1rem; font-weight: bold; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
            button:hover { background: #4752c4; }
            .alert { background: #10b981; color: white; padding: 15px 30px; border-radius: 8px; margin-bottom: 25px; display: none; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>🤖 لوحة تحكم بوت الذكاء الاصطناعي الشامل</h1>
        <p class="subtitle">قم بتعيين آيدي الرومات لتفعيل البطاقات والميزات فوراً داخل ديسكورد</p>
        <div id="successAlert" class="alert">✅ تم حفظ وتحديث الرومات بنجاح وبشكل فوري!</div>
        <form action="/save-config" method="POST" id="configForm">
            <div class="container">
                <div class="card">
                    <div>
                        <div class="card-title" style="color: #ec4899;">🖼️ بطاقة الصور والتعديل</div>
                        <div class="card-desc">توليد الصور عبر الذكاء الاصطناعي (أمر: انشئ صورة [الوصف]) وإزالة خلفية أي صورة مرفوعة (اكتب: ازالة خلفية).</div>
                    </div>
                    <div class="form-group">
                        <label>ID روم الصور والتعديل:</label>
                        <input type="text" name="IMAGES_CHANNEL_ID" value="${CARDS_CONFIG.IMAGES_CHANNEL_ID}" placeholder="أدخل ID الروم هنا">
                    </div>
                </div>
                <div class="card">
                    <div>
                        <div class="card-title" style="color: #3b82f6;">💬 بطاقة الأسئلة والدردشة</div>
                        <div class="card-desc">روم دردشة تفاعلية مفتوحة وسريعة جداً مع ذكاء OpenRouter الخارق المتواصل بدون حدود يومية.</div>
                    </div>
                    <div class="form-group">
                        <label>ID روم الدردشة والأسئلة:</label>
                        <input type="text" name="CHAT_CHANNEL_ID" value="${CARDS_CONFIG.CHAT_CHANNEL_ID}" placeholder="أدخل ID الروم هنا">
                    </div>
                </div>
                <div class="card">
                    <div>
                        <div class="card-title" style="color: #10b981;">📥 بطاقة تحميل الروابط</div>
                        <div class="card-desc">تحميل الفيديوهات والميديا تلقائياً من روابط إنستغرام عبر السكرابر المدمج.</div>
                    </div>
                    <div class="form-group">
                        <label>ID روم تحميل الروابط:</label>
                        <input type="text" name="LINKS_CHANNEL_ID" value="${CARDS_CONFIG.LINKS_CHANNEL_ID}" placeholder="أدخل ID الروم هنا">
                    </div>
                </div>
            </div>
            <button type="submit" style="margin-top: 30px; max-width: 400px; display: block; margin-left: auto; margin-right: auto; font-size: 1.2rem; padding: 15px;">💾 حفظ وتطبيق الإعدادات الحالية</button>
        </form>
        <script>
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('saved') === 'true') {
                document.getElementById('successAlert').style.display = 'block';
                setTimeout(() => { document.getElementById('successAlert').style.display = 'none'; }, 4000);
            }
        </script>
    </body>
    </html>
    `);
});

app.post('/save-config', (req, res) => {
  CARDS_CONFIG.IMAGES_CHANNEL_ID = req.body.IMAGES_CHANNEL_ID.trim();
  CARDS_CONFIG.CHAT_CHANNEL_ID = req.body.CHAT_CHANNEL_ID.trim();
  CARDS_CONFIG.LINKS_CHANNEL_ID = req.body.LINKS_CHANNEL_ID.trim();

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(CARDS_CONFIG, null, 2));
  res.redirect('/?saved=true');
});

app.listen(PORT, () => {
  console.log(`🌐 الداش بورد تعمل على البورت: ${PORT}`);
});
// 2. إعداد ديسكورد وربطه بالكامل بـ OpenRouter بناءً على إعداداتك
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// إعداد اتصال OpenRouter للدردشة والصور بدلاً من جروق وأوبن إيه آي
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1"
});

client.once('ready', () => {
  console.log(`🤖 البوت متصل عبر OpenRouter باسم: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;

  // 🃏 [البطاقة الأولى]: الصور والتعديل
  if (CARDS_CONFIG.IMAGES_CHANNEL_ID && channelId === CARDS_CONFIG.IMAGES_CHANNEL_ID) {

    if (message.attachments.size > 0 && message.content.includes('ازالة خلفية')) {
      await message.channel.sendTyping();
      const imageUrl = message.attachments.first().url;

      try {
        const response = await axios.post(
          'https://api.remove.bg/v1.0/removebg',
          { image_url: imageUrl, size: 'auto' },
          {
            headers: { 'X-API-Key': process.env.REMOVE_BG_KEY },
            responseType: 'arraybuffer'
          }
        );

        const buffer = Buffer.from(response.data, 'binary');
        const attachment = new AttachmentBuilder(buffer, { name: 'no-bg.png' });

        return message.reply({
          content: "✨ تم إزالة الخلفية بنجاح:",
          files: [attachment]
        });
      } catch (error) {
        console.error(error);
        return message.reply("❌ خطأ في إزالة الخلفية، تأكد من قيمة REMOVE_BG_KEY");
      }
    }
if (message.attachments.size > 0 && message.content.includes('تحسين')) {
  await message.channel.sendTyping();

  const imageUrl = message.attachments.first().url;

  try {
    const form = new URLSearchParams();
    form.append("image", imageUrl);

    const response = await axios.post(
      "https://api.deepai.org/api/waifu2x",
      form,
      {
        headers: {
          "api-key": process.env.DEEPAI_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const finalUrl = response.data?.output_url;

    if (!finalUrl)
      return message.reply("❌ فشل تحسين الصورة");

    return message.reply({
      content: "✨ تم تحسين الصورة:",
      files: [finalUrl]
    });

  } catch (error) {
    console.error(error?.response?.data || error);
    return message.reply("❌ حدث خطأ أثناء تحسين الصورة");
  }

        }
       if (message.attachments.size > 0 && message.content.includes('تلوين')) {
  await message.channel.sendTyping();

  const imageUrl = message.attachments.first().url;

  try {
    const form = new URLSearchParams();
    form.append("image", imageUrl);

    const response = await axios.post(
      "https://api.deepai.org/api/colorizer",
      form,
      {
        headers: {
          "api-key": process.env.DEEPAI_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const finalUrl = response.data?.output_url;

    if (!finalUrl)
      return message.reply("❌ فشل تلوين الصورة");

    return message.reply({
      content: "🎨 تم تلوين الصورة بنجاح:",
      files: [finalUrl]
    });

  } catch (error) {
    console.error(error?.response?.data || error);
    return message.reply("❌ حدث خطأ أثناء تلوين الصورة");
  }

        }

if (message.content.startsWith('انشئ صورة')) {
  await message.channel.sendTyping();

  const prompt = message.content.replace('انشئ صورة', '').trim();
  if (!prompt) return message.reply("اكتب وصف الصورة");

  try {
    const form = new URLSearchParams();
    form.append("text", prompt);

    const response = await axios.post(
      "https://api.deepai.org/api/text2img",
      form,
      {
        headers: {
          "api-key": process.env.DEEPAI_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const finalImgUrl = response.data?.output_url;

    if (!finalImgUrl)
      return message.reply("❌ ما تم إرجاع صورة من DeepAI");

    return message.reply({
      content: "🖼️ تم إنشاء الصورة بنجاح:",
      files: [finalImgUrl]
    });

  } catch (error) {
    console.error(error?.response?.data || error);
    return message.reply("❌ فشل إنشاء الصورة من DeepAI");
  }
}
  }

  // 🃏 [البطاقة الثانية]: الدردشة الذكية اللانهائية (OpenRouter)
  if (CARDS_CONFIG.CHAT_CHANNEL_ID && channelId === CARDS_CONFIG.CHAT_CHANNEL_ID) {
    await message.channel.sendTyping();

    try {
      const chatCompletion = await openrouter.chat.completions.create({
        // استخدام موديل متطور ومجاني تماماً وبدون حدود ضيقة من ميتا لاما
        model: "openrouter/free",

        messages: [{ role: "user", content: message.content }],
      });

      return message.reply(chatCompletion.choices[0].message.content || "❌ لم يصل رد من الذكاء الاصطناعي.");
    } catch (error) {
      console.error(error);
      return message.reply("❌ خطأ في معالجة الرد عبر OpenRouter");
    }
  }
  // 🃏 [البطاقة الثالثة]: تحميل الروابط
  if (CARDS_CONFIG.LINKS_CHANNEL_ID && channelId === CARDS_CONFIG.LINKS_CHANNEL_ID) {

    const urlRegex = /(instagram.com|tiktok.com|twitter.com|x.com|facebook.com|youtube.com|youtu.be)/i;

    if (!urlRegex.test(message.content)) return;

    await message.channel.sendTyping();

    const matchedUrls = message.content.match(/https?:\/\/[^\s]+/g);
    if (!matchedUrls) return;

    try {

      const response = await axios.post(
     'https://api.cobalt.tools/',

        {
          url: matchedUrls[0],
          vQuality: "720",
          filenamePattern: "basic"
        },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
        }
      );

      const videoUrl = response.data?.url;

      if (!videoUrl) {
        return message.reply("❌ عذراً، لم نتمكن من استخراج رابط التحميل المباشر من هذا الموقع.");
      }

      await message.channel.send({ content: `📥 **تم تحميل الميديا بنجاح:**\n${videoUrl}` });
      return await message.delete().catch(() => { });


    } catch (error) {
      console.error("Cobalt Error:", error.response?.data || error.message);
      return message.reply("❌ فشل تحميل الميديا. قد يكون الفيديو خاصاً أو السيرفر مضغوطاً حالياً.");
    }

  }

}); // إغلاق client.on('messageCreate')
const TOKEN = process.env.DISCORD_TOKEN;

if (TOKEN && TOKEN.trim() !== "") {
    console.log("🔄 جاري محاولة تسجيل الدخول باستخدام التوكن المتوفر...");
    client.login(TOKEN.trim()).catch(err => {
        console.error("❌ فشل تسجيل دخول البوت! تأكد من صحة الصلاحيات والتوكن:", err.message);
    });
} else {
    console.error("❌ خطأ قاتل: لم يتم العثور على قيمة DISCORD_TOKEN. تأكد من إضافتها في إعدادات البيئة على Render.");
}

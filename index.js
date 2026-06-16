import { Client, GatewayIntentBits, AttachmentBuilder } from 'discord.js';
import { Replicate } from 'replicate';
import express from 'express';
import axios from 'axios';

// 1. إعداد خادم الويب (Express) للداش بورد على منصة Render
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ذاكرة مؤقتة لتخزين آيديهات الرومات (البطاقات) بشكل ديناميكي لتحديثها من الداش بورد فوراً
let CARDS_CONFIG = {
    IMAGES_CHANNEL_ID: "", 
    CHAT_CHANNEL_ID: "",
    LINKS_CHANNEL_ID: ""
};

// واجهة الداش بورد الاحترافية (HTML + CSS) بتصميم البطاقات المظلم
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
            body {
                font-family: 'Tajawal', sans-serif;
                background-color: #0e1118;
                color: #e2e8f0;
                margin: 0;
                padding: 40px 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            h1 { color: #5865F2; margin-bottom: 10px; font-size: 2.2rem; }
            p.subtitle { color: #94a3b8; margin-bottom: 40px; font-size: 1.1rem; }
            .container {
                display: flex;
                flex-wrap: wrap;
                gap: 25px;
                justify-content: center;
                max-width: 1200px;
                width: 100%;
            }
            .card {
                background: #161b26;
                border: 2px solid #232a3c;
                border-radius: 16px;
                padding: 30px;
                width: 320px;
                box-shadow: 0 10px 20px rgba(0,0,0,0.3);
                transition: transform 0.3s, border-color 0.3s;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
            }
            .card:hover {
                transform: translateY(-5px);
                border-color: #5865F2;
            }
            .card-title {
                font-size: 1.4rem;
                font-weight: bold;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .card-desc {
                color: #94a3b8;
                font-size: 0.95rem;
                line-height: 1.6;
                margin-bottom: 25px;
                min-height: 70px;
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 8px;
                font-size: 0.9rem;
                color: #cbd5e1;
            }
            input[type="text"] {
                width: 100%;
                padding: 12px;
                background: #0f131a;
                border: 1px solid #2d3748;
                border-radius: 8px;
                color: #fff;
                font-size: 1rem;
                box-sizing: border-box;
                text-align: center;
            }
            input[type="text"]:focus {
                border-color: #5865F2;
                outline: none;
            }
            button {
                width: 100%;
                background: #5865F2;
                color: white;
                border: none;
                padding: 12px;
                font-size: 1rem;
                font-weight: bold;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.2s;
            }
            button:hover { background: #4752c4; }
            .alert {
                background: #10b981;
                color: white;
                padding: 15px 30px;
                border-radius: 8px;
                margin-bottom: 25px;
                display: none;
                font-weight: bold;
            }
        </style>
    </head>
    <body>

        <h1>🤖 لوحة تحكم بوت الذكاء الاصطناعي الشامل</h1>
        <p class="subtitle">قم بتعيين آيدي الرومات لتفعيل البطاقات والميزات فوراً داخل ديسكورد</p>

        <div id="successAlert" class="alert">✅ تم حفظ وتحديث الرومات بنجاح وبشكل فوري!</div>

        <form action="/save-config" method="POST" id="configForm">
            <div class="container">
                
                <!-- البطاقة الأولى -->
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

                <!-- البطاقة الثانية -->
                <div class="card">
                    <div>
                        <div class="card-title" style="color: #3b82f6;">💬 بطاقة الأسئلة والدردشة</div>
                        <div class="card-desc">روم دردشة تفاعلية مفتوحة وسريعة جداً مع الذكاء الاصطناعي الذكي للإجابة عن كل الأسئلة والقصص بدون أي أوامر.</div>
                    </div>
                    <div class="form-group">
                        <label>ID روم الدردشة والأسئلة:</label>
                        <input type="text" name="CHAT_CHANNEL_ID" value="${CARDS_CONFIG.CHAT_CHANNEL_ID}" placeholder="أدخل ID الروم هنا">
                    </div>
                </div>

                <!-- البطاقة الثالثة -->
                <div class="card">
                    <div>
                        <div class="card-title" style="color: #10b981;">📥 بطاقة تحميل الروابط</div>
                        <div class="card-desc">تحميل الفيديوهات والميديا تلقائياً بمجرد إرسال أي رابط من تيك توك، إنستغرام، وتويتر (X) وإرساله مباشرة بالروم.</div>
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

// استقبال وحفظ البيانات من الداش بورد وتطبيقها في ثوانٍ
app.post('/save-config', (req, res) => {
    CARDS_CONFIG.IMAGES_CHANNEL_ID = req.body.IMAGES_CHANNEL_ID.trim();
    CARDS_CONFIG.CHAT_CHANNEL_ID = req.body.CHAT_CHANNEL_ID.trim();
    CARDS_CONFIG.LINKS_CHANNEL_ID = req.body.LINKS_CHANNEL_ID.trim();
    console.log("🔄 تم تحديث إعدادات الرومات بنجاح:", CARDS_CONFIG);
    res.redirect('/?saved=true');
});

// تشغيل سيرفر الويب على Render
app.listen(PORT, () => {
    console.log(`🌐 الداش بورد تعمل بنجاح على البورت: ${PORT}`);
});
// 2. إعداد وصلاحيات بوت الديسكورد (Discord Bot)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// جلب مفاتيح الـ API من متغيرات بيئة Render مباشرة لضمان الحماية
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });


client.once('ready', () => {
    console.log(`🤖 بوت الديسكورد جاهز ومتصل الآن باسم: ${client.user.tag}`);
});

// معالجة كافة الرسائل بناءً على إعدادات "البطاقات" في الداش بورد
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const channelId = message.channel.id;

    // 🃏 [البطاقة الأولى]: الصور
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
                return message.reply("❌ خطأ في إزالة الخلفية");
            }
        }

        if (message.content.startsWith('انشئ صورة')) {
            await message.channel.sendTyping();

            const prompt = message.content.replace('انشئ صورة', '').trim();
            if (!prompt) return message.reply("اكتب وصف الصورة");

            try {
                const output = await replicate.run(
                    "stability-ai/sdxl:39d312616b966de0f87def29d8a9e42d1a31a4805f264e466c1736c641b8a952",
                    {
                        input: {
                            prompt: prompt,
                            scheduler: "K_EULER_ANCESTRAL",
                            guidance_scale: 7.5,
                            num_inference_steps: 50
                        }
                    }
                );

                return message.reply(Array.isArray(output) ? output[0] : output);

            } catch (error) {
                console.error(error);
                return message.reply("❌ فشل إنشاء الصورة عبر Replicate، تأكد من رصيدك وحالة التوكن.");
            }
            }

}



    // 🃏 [البطاقة الثانية]: الدردشة
    if (CARDS_CONFIG.CHAT_CHANNEL_ID && channelId === CARDS_CONFIG.CHAT_CHANNEL_ID) {
        await message.channel.sendTyping();

          try {
            const response = await axios.post(
                "https://groq.com",
                {
                    messages: [{ role: "user", content: message.content }],
                    model: "llama-3.1-8b-instant",
                },
                {
                    headers: {
                        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            return message.reply(response.data.choices[0].message.content);

        } catch (error) {
            console.error(error);
            return message.reply("❌ خطأ بالدردشة");
        }

    }

    // 🃏 [البطاقة الثالثة]: تحميل الروابط
    if (CARDS_CONFIG.LINKS_CHANNEL_ID && channelId === CARDS_CONFIG.LINKS_CHANNEL_ID) {

        const urlRegex = /(tiktok\.com|instagram\.com|twitter\.com|x\.com)/gi;

        if (!urlRegex.test(message.content)) return;

        await message.channel.sendTyping();

        const matchedUrls = message.content.match(/https?:\/\/[^\s]+/g);
        if (!matchedUrls) return;

        try {
            const response = await axios.post(
                `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}`,
                {
                    directUrls: [matchedUrls[0]],
                    resultsLimit: 1
                }
            );

            const data = response.data?.[0];

            const videoUrl =
                data?.videoUrl ||
                data?.displayUrl ||
                data?.url;

            if (!videoUrl) {
                return message.reply("❌ ما قدرنا نطلع الميديا");
            }

            await message.channel.send({
                content: `📥 تم التحميل بنجاح:`,
                files: [{ attachment: videoUrl }]
            });

            return await message.delete().catch(() => {});

        } catch (error) {
            console.error(error);
            return message.reply("❌ فشل تحميل الميديا من Apify");
        }
    }
});
// 3. تشغيل البوت بربطه بالتوكن الخاص به من متغيرات البيئة
// تأكد من إضافة DISCORD_TOKEN في إعدادات البيئة (Environment Variables) على Render
if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN).catch(err => {
        console.error("❌ فشل تسجيل دخول البوت! تأكد من صحة التوكن والصلاحيات:", err.message);
    });
} else {
    console.error("❌ خطأ: لم يتم العثور على متغير البيئة DISCORD_TOKEN!");
}

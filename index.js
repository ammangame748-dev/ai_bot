const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const Jsoning = require('jsoning');
const FormData = require('form-data');
const Groq = require('groq-sdk');

const db = new Jsoning('database.json');
const Groq = require('groq-sdk');
const ai = new Groq({ apiKey: process.env.GROQ_API_KEY });


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ---------------- READY ----------------
client.on('ready', () => {
    console.log(`🔥 Bot Ready: ${client.user.tag}`);
});

// ---------------- MESSAGE CREATE ----------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const currentChannelId = message.channel.id;

    const downloadChannel = await db.get('download_channel');
    const artChannel = await db.get('art_channel');
    const aiChannel = await db.get('ai_channel');

    try {

        // =====================================================
        // 1. VIDEO DOWNLOAD
        // =====================================================
        if (downloadChannel && currentChannelId === downloadChannel) {

            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matchedUrls = content.match(urlRegex);
            if (!matchedUrls) return;

            const targetUrl = matchedUrls[0];

            const waiting = await message.reply('⏳ جاري تحميل الفيديو...');

            const response = await axios.post(
                'https://api.cobalt.tools/api/json',
                { url: targetUrl },
                {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.data || !response.data.url) {
                throw new Error('No video url returned');
            }

            const video = await axios.get(response.data.url, {
                responseType: 'arraybuffer'
            });

            const file = new AttachmentBuilder(Buffer.from(video.data), {
                name: 'video.mp4'
            });

            await message.channel.send({ files: [file] });
            await waiting.delete().catch(() => {});

            return;
        }

        // =====================================================
        // 2. IMAGE GENERATION + EDIT + REMOVE BG
        // =====================================================
        if (currentChannelId === artChannel) {

            const attachedImage = message.attachments.first();

            // -------- generate image
            if (
                content.startsWith('ارسم') ||
                content.startsWith('تخيل') ||
                content.startsWith('صمم صوره')
            ) {
                const prompt = content.replace(/(ارسم|تخيل|صمم صوره)/, '').trim();
                if (!prompt) return message.reply('❌ اكتب وصف للصورة');

                const waiting = await message.reply('🎨 جاري توليد الصورة...');

                const res = await ai.models.generateImages({
                    model: 'imagen-3.0-generate-002',
                    prompt,
                    config: {
                        numberOfImages: 1,
                        outputMimeType: 'image/jpeg',
                        aspectRatio: '1:1'
                    }
                });

               const base64 = res.generatedImages?.[0]?.image?.imageBytes;

if (!base64) {
    throw new Error("No image returned from Gemini");
}

// هنا قمنا بتعريف الـ buffer بشكل صحيح وتحويل الـ base64 إليه
const imgBuffer = Buffer.from(base64, 'base64');

await message.channel.send({
    files: [new AttachmentBuilder(imgBuffer, { name: 'image.jpg' })]
});


                await waiting.delete().catch(() => {});
                return;
            }

            // -------- must have image
            if (!attachedImage) return;

            // -------- remove background
            if (
                content.includes('شيل الخلفيه') ||
                content.includes('remove background')
            ) {
                const waiting = await message.reply('✂️ جاري إزالة الخلفية...');

                const formData = new FormData();
                formData.append('image_url', attachedImage.url);
                formData.append('size', 'auto');

                const response = await axios.post(
                    'https://api.remove.bg/v1.0/removebg',
                    formData,
                    {
                        headers: {
                            ...formData.getHeaders(),
                            'X-API-Key': process.env.REMOVE_BG_KEY
                        },
                        responseType: 'arraybuffer'
                    }
                );

                await message.channel.send({
                    files: [
                        new AttachmentBuilder(Buffer.from(response.data), {
                            name: 'nobg.png'
                        })
                    ]
                });

                await waiting.delete().catch(() => {});
                return;
            }

            // -------- AI image enhance
            if (
                content.includes('تعديل') ||
                content.includes('عدل') ||
                content.includes('احسن')
            ) {
                const waiting = await message.reply('🪄 جاري تحليل الصورة...');

                const img = await axios.get(attachedImage.url, {
                    responseType: 'arraybuffer'
                });

                const base64 = Buffer.from(img.data).toString('base64');

                const result = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    inlineData: {
                                        data: base64,
                                        mimeType: 'image/jpeg'
                                    }
                                },
                                {
                                    text: 'حلل الصورة وحسنها وقدم اقتراحات'
                                }
                            ]
                        }
                    ]
                });

                await message.reply(result.text);
                await waiting.delete().catch(() => {});
                return;
            }

            return;
        }

        // =====================================================
        // 3. AI CHAT
        // =====================================================
        if (currentChannelId === aiChannel) {
            if (!content || content.length < 2) return;

            try {
                // تفعيل ميزة إظهار البوت وهو يكتب في القناة فوراً
                await message.channel.sendTyping();

                const res = await ai.chat.completions.create({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: content }]
                });

                const reply = res.choices?.[0]?.message?.content || "لم أستطع فهم ذلك";

                await message.reply(reply);
            } catch (chatErr) {
                console.error('AI Chat Error:', chatErr);
                await message.reply('❌ عذراً، واجهت مشكلة في الاتصال بسيرفر الذكاء الاصطناعي.');
            }
        }

    } catch (err) {
        console.error('BOT ERROR:', err);
    }
});


// ---------------- LOGIN ----------------
client.login(process.env.DISCORD_TOKEN);
// ---------------- DASHBOARD & WEB SERVER ----------------
// =====================================================
// 🛠️ DASHBOARD - GET ROUTE (واجهة التحكم والبطاقات)
// =====================================================
app.get('/', async (req, res) => {
    // جلب القيم الحالية من قاعدة البيانات أو وضع نص افتراضي إذا كانت فارغة
    const downloadChannel = await db.get('download_channel') || 'لم يتم التحديد بعد';
    const artChannel = await db.get('art_channel') || 'لم يتم التحديد بعد';
    const aiChannel = await db.get('ai_channel') || 'لم يتم التحديد بعد';

    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة تحكم البوت الذكي</title>
        <style>
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #0f172a;
                color: #f1f5f9;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
            }
            header {
                background-color: #1e293b;
                border-bottom: 2px solid #334155;
                padding: 30px 20px;
                text-align: center;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
            }
            header h1 {
                color: #818cf8;
                font-size: 32px;
                margin-bottom: 10px;
            }
            header p {
                color: #94a3b8;
                font-size: 15px;
            }
            main {
                max-width: 1200px;
                width: 95%;
                margin: 40px auto;
                display: flex;
                flex-wrap: wrap;
                gap: 30px;
                justify-content: center;
            }
            .card {
                background-color: #1e293b;
                border: 1px solid #334155;
                border-radius: 20px;
                padding: 30px;
                width: 350px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                box-shadow: 0 15px 25px rgba(0, 0, 0, 0.4);
                transition: transform 0.3s ease, box-shadow 0.3s ease;
            }
            .card:hover {
                transform: translateY(-8px);
                box-shadow: 0 20px 35px rgba(129, 140, 248, 0.15);
            }
            .card-icon {
                font-size: 45px;
                text-align: center;
                margin-bottom: 20px;
            }
            .card-title {
                font-size: 22px;
                color: #c7d2fe;
                text-align: center;
                margin-bottom: 15px;
                font-weight: bold;
            }
            .card-desc {
                color: #94a3b8;
                font-size: 14px;
                text-align: center;
                line-height: 1.7;
                margin-bottom: 25px;
                min-height: 70px;
            }
            .form-group {
                border-top: 1px solid #334155;
                padding-top: 20px;
            }
            .current-id {
                text-align: center;
                font-size: 13px;
                color: #94a3b8;
                margin-bottom: 12px;
            }
            .current-id code {
                background-color: #0f172a;
                color: #38bdf8;
                padding: 3px 8px;
                border-radius: 6px;
                font-family: monospace;
                font-size: 14px;
                margin-right: 5px;
            }
            .input-field {
                width: 100%;
                background-color: #0f172a;
                border: 1px solid #475569;
                border-radius: 8px;
                padding: 10px 12px;
                color: #ffffff;
                font-size: 14px;
                text-align: center;
                margin-bottom: 12px;
                outline: none;
                transition: border-color 0.2s;
            }
            .input-field:focus {
                border-color: #818cf8;
            }
            .save-btn {
                width: 100%;
                background-color: #4f46e5;
                color: #ffffff;
                border: none;
                border-radius: 8px;
                padding: 11px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .save-btn:hover {
                background-color: #4338ca;
            }
            footer {
                background-color: #0f172a;
                text-align: center;
                padding: 20px;
                font-size: 13px;
                color: #475569;
                border-top: 1px solid #1e293b;
            }
        </style>
    </head>
    <body>

        <header>
            <h1>🤖 لوحة تحكم البوت الذكي</h1>
            <p>قم بإدارة وتحديث قنوات البوت في سيرفر الديسكورد بكل سهولة</p>
        </header>

        <main>
            
            <!-- 1. بطاقة الأسئلة والشات -->
            <div class="card">
                <div>
                    <div class="card-icon">💬</div>
                    <div class="card-title">نظام الأسئلة والمحادثة</div>
                    <div class="card-desc">
                        البطاقة المخصصة للرد الذكي والآلي على أسئلة الأعضاء وتوليد النصوص المحادثات والنقاشات الطويلة بناءً على نموذج Gemini-2.5.
                    </div>
                </div>
                <form action="/update-channels" method="POST" class="form-group">
                    <div class="current-id">القناة الحالية: <code>${aiChannel}</code></div>
                    <input type="text" name="ai_channel" class="input-field" placeholder="أدخل ID قناة الشات الجديد" required autocomplete="off">
                    <button type="submit" class="save-btn">تحديث قناة الشات</button>
                </form>
            </div>

            <!-- 2. بطاقة الفنون والصور -->
            <div class="card">
                <div>
                    <div class="card-icon">🎨</div>
                    <div class="card-title">إنشاء وتعديل الصور</div>
                    <div class="card-desc">
                        تتيح للأعضاء إنشاء صور إبداعية من النصوص بـ Imagen 3، إزالة خلفيات الصور تلقائياً بلمسة واحدة، وتحسين وتحليل الصور عبر الذكاء الاصطناعي.
                    </div>
                </div>
                <form action="/update-channels" method="POST" class="form-group">
                    <div class="current-id">القناة الحالية: <code>${artChannel}</code></div>
                    <input type="text" name="art_channel" class="input-field" placeholder="أدخل ID قناة الصور الجديد" required autocomplete="off">
                    <button type="submit" class="save-btn">تحديث قناة الصور</button>
                </form>
            </div>

            <!-- 3. بطاقة تحميل الفيديوهات -->
            <div class="card">
                <div>
                    <div class="card-icon">📥</div>
                    <div class="card-title">جلب وتحميل الفيديوهات</div>
                    <div class="card-desc">
                        تسمح بسحب وتحميل الفيديوهات مباشرة من تطبيقات التواصل الاجتماعي (إنستغرام، تويتر/X، وتيك توك) بمجرد إرسال الرابط داخل الغرفة المخصصة.
                    </div>
                </div>
                <form action="/update-channels" method="POST" class="form-group">
                    <div class="current-id">القناة الحالية: <code>${downloadChannel}</code></div>
                    <input type="text" name="download_channel" class="input-field" placeholder="أدخل ID قناة التحميل الجديد" required autocomplete="off">
                    <button type="submit" class="save-btn">تحديث قناة التحميل</button>
                </form>
            </div>

        </main>

        <footer>
            لوحة تحكم خاصة ببوت الديسكورد الفعال • جميع الحقوق محفوظة لكم
        </footer>

    </body>
    </html>
    `);
});

// =====================================================
// 📥 DASHBOARD - POST ROUTE (أمر استقبال البيانات وحفظها)
// =====================================================
app.post('/update-channels', async (req, res) => {
    try {
        const { download_channel, art_channel, ai_channel } = req.body;

        // التحقق من الحقل المرسل وحفظه داخل قاعدة البيانات
        if (download_channel) await db.set('download_channel', download_channel.trim());
        if (art_channel) await db.set('art_channel', art_channel.trim());
        if (ai_channel) await db.set('ai_channel', ai_channel.trim());

        // إعادة توجيه المستخدم لصفحة لوحة التحكم بعد الحفظ بنجاح لتحديث البيانات
        res.send(`
            <script>
                alert('✅ تم تحديث القناة وحفظ البيانات بنجاح!');
                window.location.href = '/';
            </script>
        `);
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).send('❌ حدث خطأ أثناء محاولة حفظ البيانات');
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log("🌐 Server running on port", process.env.PORT || 3000);
});

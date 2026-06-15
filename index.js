const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const Jsoning = require('jsoning');
const FormData = require('form-data');
const { GoogleGenAI } = require('@google/genai');

const db = new Jsoning('database.json');
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

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
const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: content }] }] // تعديل الصيغة هنا
});

const reply = res.text || "No response";

await message.reply(reply); // تكتفي برسم رد واحد فقط وحذفنا السطر المكرر

        }

    } catch (err) {
        console.error('BOT ERROR:', err);
    }
});


// ---------------- LOGIN ----------------
client.login(process.env.DISCORD_TOKEN);
// ---------------- DASHBOARD & WEB SERVER ----------------
app.get('/', async (req, res) => {
    // جلب قيم الغرف الحالية من قاعدة البيانات لعرضها داخل البطاقات
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
        <!-- استدعاء مكتبة التصميم Tailwind CSS -->
        <script src="https://tailwindcss.com"></script>
        <link href="https://googleapis.com" rel="stylesheet">
        <style>
            body { font-family: 'Tajawal', sans-serif; }
        </style>
    </head>
    <body class="bg-gray-900 text-gray-100 min-h-screen flex flex-col justify-between">

        <!-- الهيدر أو الرأسية -->
        <header class="bg-gray-800 border-b border-gray-700 p-5 text-center shadow-lg">
            <h1 class="text-3xl font-bold text-indigo-400 flex justify-center items-center gap-3">
                🤖 لوحة تحكم البوت الذكي
            </h1>
            <p class="text-gray-400 mt-2 text-sm">البوت يعمل بنجاح ومربوط بسيرفر الديسكورد الخاص بك</p>
        </header>

        <!-- المحتوى الرئيسي المحتوي على البطاقات الثلاث -->
        <main class="max-w-6xl mx-auto p-6 my-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <!-- 1. بطاقة الأسئلة والشات (AI Chat) -->
            <div class="bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl flex flex-col justify-between transform hover:scale-105 transition-all duration-300">
                <div>
                    <div class="text-4xl mb-4 text-center">💬</div>
                    <h2 class="text-xl font-bold text-center text-indigo-300 mb-3">نظام الأسئلة والمحادثة</h2>
                    <p class="text-gray-400 text-sm text-center leading-relaxed">
                        بطاقة مخصصة للرد الذكي والآلي على أسئلة الأعضاء، الاستفسارات، وتوليد النصوص والنقاشات الطويلة بناءً على نموذج Gemini-2.5.
                    </p>
                </div>
                <div class="mt-6 pt-4 border-t border-gray-700 text-xs text-center text-gray-500">
                    <span class="block font-semibold text-gray-400 mb-1">ID غرفة الشات الحالية:</span>
                    <code class="bg-gray-900 text-indigo-400 px-2 py-1 rounded select-all font-mono">${aiChannel}</code>
                </div>
            </div>

            <!-- 2. بطاقة الفنون والصور (Art & Image Generation) -->
            <div class="bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl flex flex-col justify-between transform hover:scale-105 transition-all duration-300">
                <div>
                    <div class="text-4xl mb-4 text-center">🎨</div>
                    <h2 class="text-xl font-bold text-center text-indigo-300 mb-3">إنشاء وتعديل الصور</h2>
                    <p class="text-gray-400 text-sm text-center leading-relaxed">
                        تتيح للأعضاء إنشاء صور إبداعية من النصوص بـ Imagen 3، إزالة خلفيات الصور تلقائياً بلمسة واحدة، وتحسين وتحليل الصور عبر الذكاء الاصطناعي.
                    </p>
                </div>
                <div class="mt-6 pt-4 border-t border-gray-700 text-xs text-center text-gray-500">
                    <span class="block font-semibold text-gray-400 mb-1">ID غرفة الصور الحالية:</span>
                    <code class="bg-gray-900 text-indigo-400 px-2 py-1 rounded select-all font-mono">${artChannel}</code>
                </div>
            </div>

            <!-- 3. بطاقة تحميل الفيديوهات (Video Downloader) -->
            <div class="bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl flex flex-col justify-between transform hover:scale-105 transition-all duration-300">
                <div>
                    <div class="text-4xl mb-4 text-center">📥</div>
                    <h2 class="text-xl font-bold text-center text-indigo-300 mb-3">جلب وتحميل الفيديوهات</h2>
                    <p class="text-gray-400 text-sm text-center leading-relaxed">
                        تسمح بسحب وتحميل الفيديوهات مباشرة من تطبيقات التواصل الاجتماعي (إنستغرام، تويتر/X، وتيك توك) بمجرد إرسال الرابط داخل الغرفة المخصصة.
                    </p>
                </div>
                <div class="mt-6 pt-4 border-t border-gray-700 text-xs text-center text-gray-500">
                    <span class="block font-semibold text-gray-400 mb-1">ID غرفة التحميل الحالية:</span>
                    <code class="bg-gray-900 text-indigo-400 px-2 py-1 rounded select-all font-mono">${downloadChannel}</code>
                </div>
            </div>

        </main>

        <!-- الفوتر أو التذييل -->
        <footer class="bg-gray-900 text-center py-4 text-xs text-gray-600 border-t border-gray-800">
            لوحة تحكم خاصة ببوت الديسكورد الفعال • جميع الحقوق محفوظة لكم
        </footer>

    </body>
    </html>
    `);
});

app.listen(process.env.PORT || 3000, () => {
    console.log("🌐 Server running on port", process.env.PORT || 3000);
});

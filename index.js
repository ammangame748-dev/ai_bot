const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const Jsoning = require('jsoning');

const app = express();
const db = new Jsoning('database.json'); // قاعدة بيانات ملف JSON المضمونة والمستقرة على Render
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------------
// لوحة التحكم (Dashboard)
// -------------------------------------------------------------
app.get('/', async (req, res) => {
    const downloadChannel = await db.get('download_channel') || '';
    const artChannel = await db.get('art_channel') || '';
    const aiChannel = await db.get('ai_channel') || '';

    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة تحكم بوت GEMZ الناري</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #1a1a1a; color: #fff; margin: 20px; text-align: center; }
            .container { max-width: 600px; margin: auto; background: #2a2a2a; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
            h1 { color: #ff4500; font-size: 24px; margin-bottom: 20px; }
            .card { background: #333; padding: 15px; margin-bottom: 15px; border-radius: 8px; border-left: 5px solid #ff4500; text-align: right; }
            .card h3 { margin-top: 0; color: #ffa500; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input[type="text"] { width: 95%; padding: 10px; border-radius: 5px; border: 1px solid #555; background: #444; color: #fff; text-align: center; font-size: 16px; }
            button { background: #ff4500; color: #fff; border: none; padding: 12px 30px; font-size: 18px; border-radius: 8px; cursor: pointer; transition: 0.3s; width: 100%; margin-top: 10px; }
            button:hover { background: #e03e00; }
            .footer { margin-top: 20px; font-size: 12px; color: #888; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔥 لوحة تحكم بوت GEMZ الخارق</h1>
            <p>قم بوضع معرف الروم (Channel ID) في البطاقة المناسبة ليشتغل البوت هناك تلقائياً!</p>
            
            <form action="/save" method="POST">
                <div class="card">
                    <h3>🎬 البطاقة الأولى: روم الميديا</h3>
                    <label>روم تحميل فيديوهات انستا، تيك توك، وتويتر:</label>
                    <input type="text" name="download_channel" value="${downloadChannel}" placeholder="أدخل Channel ID هنا">
                </div>

                <div class="card">
                    <h3>🎨 البطاقة الثانية: روم الصور</h3>
                    <label>روم إنشاء، تعديل، وإزالة خلفية الصور:</label>
                    <input type="text" name="art_channel" value="${artChannel}" placeholder="أدخل Channel ID هنا">
                </div>

                <div class="card">
                    <h3>🧠 البطاقة الثالثة: روم أسئلة الـ AI</h3>
                    <label>روم الدردشة والإجابة على أسئلة الذكاء الاصطناعي العامة:</label>
                    <input type="text" name="ai_channel" value="${aiChannel}" placeholder="أدخل Channel ID هنا">
                </div>

                <button type="submit">💾 حفظ الإعدادات النارية</button>
            </form>
            <div class="footer">GEMZ Bot v1.0 - Hosted on Render</div>
        </div>
    </body>
    </html>
    `);
});

app.post('/save', async (req, res) => {
    const { download_channel, art_channel, ai_channel } = req.body;
    
    await db.set('download_channel', download_channel.trim());
    await db.set('art_channel', art_channel.trim());
    await db.set('ai_channel', ai_channel.trim());

    res.send('<h2 style="text-align:center; color:green; font-family:sans-serif; margin-top:50px;">✅ تم حفظ الرومات بنجاح يا وحش! البوت جاهز للعمل الآن.</h2><script>setTimeout(() => { window.location.href = "/"; }, 2000);</script>');
});

app.listen(PORT, () => console.log(`🚀 الويب ولوحة التحكم تعمل بنجاح على منفذ: ${PORT}`));
// -------------------------------------------------------------
// كود وبوت الديسكورد الذكي والمربوط بالـ Dashboard
// -------------------------------------------------------------
// الاستدعاء الصحيح للنسخة المستقرة والنهائية لـ Gemini
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('ready', () => {
    console.log(`🔥 تم تشغيل البوت بنجاح ومربوط باللوحة: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const currentChannelId = message.channel.id;

    // جلب الرومات المحددة من لوحة التحكم قبل تنفيذ أي شيء
    const downloadChannel = await db.get('download_channel');
    const artChannel = await db.get('art_channel');
    const aiChannel = await db.get('ai_channel');

    // 1. تشغيل ميزة تحميل الفيديوهات (فقط إذا كانت الرسالة في الروم المحدد بالبطاقة الأولى)
    if (currentChannelId === downloadChannel) {
        if (content.includes('tiktok.com') || content.includes('instagram.com') || content.includes('twitter.com') || content.includes('x.com')) {
            await message.channel.sendTyping();
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matchedUrls = content.match(urlRegex);
            if (!matchedUrls) return;
            const targetUrl = matchedUrls[0];

            const waitingMessage = await message.reply('⏳ **جاري سحب الفيديو بجودة عالية وفصله عن الخلفية، انتظرني يا وحش...**');

            try {
                const response = await axios.post('https://cobalt.tools', {
                    url: targetUrl,
                    vQuality: '720',
                    filenamePattern: 'basic'
                }, {
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
                });

                if (response.data && response.data.url) {
                    const videoAttachment = new AttachmentBuilder(response.data.url, { name: 'GEMZ_Video.mp4' });
                    await message.channel.send({
                        content: `🎬 **تفضل الفيديو الخاص بك يا وحش:**`,
                        files: [videoAttachment]
                    });
                    await waitingMessage.delete().catch(() => null);
                } else {
                    throw new Error();
                }
            } catch (error) {
                await waitingMessage.edit('❌ **عذراً يا وحش! فشلت في سحب الفيديو، تأكد أن الحساب عام وليس خاصاً أو حاول مجدداً.**');
            }
        }
        return;
    }

    // 2. تشغيل ميزات الصور (فقط إذا كانت الرسالة في الروم المحدد بالبطاقة الثانية)
    if (currentChannelId === artChannel) {
        // أ) توليد ورسم الصور النصية من الصفر باستخدام نموذج Imagen الجديد
        if (content.startsWith('ارسم') || content.startsWith('صمم صوره') || content.startsWith('تخيل')) {
            await message.channel.sendTyping();
            const waitingMessage = await message.reply('🎨 **جاري تشغيل محرك الرسم وتوليد صورتك بدقة احترافية، انتظرني...**');

            const prompt = content.replace(/(ارسم|صمم صوره|تخيل)/, '').trim();
            if (!prompt) {
                return waitingMessage.edit('❌ **اكتب لي وصفاً للصورة يا وحش (مثال: ارسم رائد فضاء يركب خيل في الفضاء).**');
            }

            try {
                const response = await ai.models.generateImages({
                    model: 'imagen-3.0-generate-002',
                    prompt: prompt,
                    config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '1:1' },
                });

                const base64Image = response.generatedImages[0].image.imageBytes;
                const buffer = Buffer.from(base64Image, 'base64');
                const imageAttachment = new AttachmentBuilder(buffer, { name: 'GEMZ_Art.jpg' });

                await message.channel.send({ content: `🎨 **تفضل اللوحة الفنية التي طلبتها يا وحش:**`, files: [imageAttachment] });
                await waitingMessage.delete().catch(() => null);
            } catch (error) {
                console.error(error);
                await waitingMessage.edit('❌ **حدث خطأ أثناء توليد الصورة، حاول صياغة الوصف بشكل أوضح.**');
            }
            return;
        }

        // ب) معالجة الصور المرفوعة (إزالة خلفية أو تعديل)
        if (message.attachments.size > 0) {
            const attachedImage = message.attachments.first();
            
            // إزالة الخلفية عبر الـ API لـ remove.bg
            if (content.includes('شيل الخلفيه') || content.includes('مسح الخلفية') || content.includes('remove background')) {
                await message.channel.sendTyping();
                const waitingMessage = await message.reply('✂️ **جاري معالجة الصورة وإزالة الخلفية بدقة خارقة، ثواني...**');

                try {
                    const response = await axios.post('https://remove.bg', {
                        image_url: attachedImage.url,
                        size: 'auto'
                    }, {
                        headers: { 'X-API-Key': process.env.REMOVE_BG_KEY },
                        responseType: 'arraybuffer'
                    });

                    const imageAttachment = new AttachmentBuilder(Buffer.from(response.data), { name: 'GEMZ_NoBg.png' });
                    await message.channel.send({ content: `✂️ **تم قص الخلفية بنجاح وتفريغ الصورة يا وحش:**`, files: [imageAttachment] });
                    await waitingMessage.delete().catch(() => null);
                } catch (error) {
                    await waitingMessage.edit('❌ **حدث خطأ، تأكد من إضافة مفتاح REMOVE_BG_KEY في راندر.**');
                }
                return;
            }

            // تعديل وتحسين الصورة عبر الرؤية الذكية للـ Gemini
            if (content.includes('عدل') || content.includes('تعديل') || content.includes('احسن')) {
                await message.channel.sendTyping();
                const waitingMessage = await message.reply('🪄 **جاري تحليل صورتك وتعديلها وتحسين جودتها بالذكاء الاصطناعي...**');

                try {
                    const imageResponse = await axios.get(attachedImage.url, { responseType: 'arraybuffer' });
                    const base64Image = Buffer.from(imageResponse.data).toString('base64');

                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: [
                            { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
                            "قم بتحليل هذه الصورة وتحسين ألوانها وإعطاء نصائح لتعديلها لتصبح احترافية بأعلى جودة ممكنة."
                        ],
                    });

                    await message.reply(`🪄 **تحليل وتعديل الصورة الذكي:**\n\n${response.text}`);
                    await waitingMessage.delete().catch(() => null);
                } catch (error) {
                    await waitingMessage.edit('❌ **عذراً يا وحش، واجهت مشكلة أثناء محاولة تعديل وتحسين الصورة.**');
                }
                return;
            }
        }
        return;
    }

    // 3. تشغيل ميزة الأسئلة والدردشة العامة للـ AI (فقط إذا كانت الرسالة في الروم المحدد بالبطاقة الثالثة)
    if (currentChannelId === aiChannel) {
        if (content.length > 1) {
            await message.channel.sendTyping();
            try {
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: content,
                });
                await message.reply(response.text);
            } catch (error) {
                await message.reply('❌ **واجهت مشكلة في معالجة طلبك حالياً، حاول مجدداً لاحقاً.**');
            }
        }
        return;
    }
});

client.login(process.env.DISCORD_TOKEN);

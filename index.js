import { Client, GatewayIntentBits, AttachmentBuilder } from 'discord.js';
import { OpenAI } from 'openai';
import Groq from 'groq-sdk';
import axios from 'axios';
import FormData from 'form-data';
import Jsoning from 'jsoning';
import express from 'express';

// 1. إعداد سيرفر وقاعدة بيانات الـ JSON الخفيفة والبديلة لـ Render
const app = express();
const db = new Jsoning("database.json"); // ملف محلي بسيط لحفظ البيانات بدون مشاكل sqlite3
const PORT = process.env.PORT || 3000;


app.use(express.urlencoded({ extended: true }));

// واجهة الـ Dashboard (صفحة ويب متكاملة بـ 3 بطاقات للتحكم بالرومات)
app.get('/', async (req, res) => {
    // جلب الـ IDs الحالية المخزنة لعرضها بالبطاقات
    const imageCh = await db.get('dashboard_image_channel') || '';
    const chatCh = await db.get('dashboard_chat_channel') || '';
    const downloadCh = await db.get('dashboard_download_channel') || '';

    const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>لوحة تحكم بوت الذكاء الاصطناعي</title>
        <style>
            body { font-family: Arial, sans-serif; background-color: #121212; color: #fff; margin: 40px; }
            .container { max-width: 800px; margin: auto; }
            h1 { text-align: center; color: #5865F2; }
            .card { background: #1e1e1e; border: 1px solid #333; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .card h3 { margin-top: 0; color: #ffca28; }
            label { display: block; margin: 10px 0 5px; }
            input[type="text"] { width: 100%; padding: 10px; background: #2c2c2c; border: 1px solid #444; color: #fff; border-radius: 4px; box-sizing: border-box; }
            button { background: #5865F2; color: white; border: none; padding: 12px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; margin-top: 10px; width: 100%; }
            button:hover { background: #4752c4; }
            .success { color: #2ecc71; text-align: center; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎛️ لوحة تحكم إعدادات البطاقات</h1>
            <form action="/save" method="POST">
                
                <!-- البطاقة الأولى -->
                <div class="card">
                    <h3>🖼️ البطاقة 1: روم الصور والتعديل</h3>
                    <p>هذا الروم مخصص لإنشاء الصور (DALL-E 3) وإزالة الخلفيات.</p>
                    <label>ID قناة الصور:</label>
                    <input type="text" name="imageChannel" value="${imageCh}" placeholder="أدخل ID الروم هنا">
                </div>

                <!-- البطاقة الثانية -->
                <div class="card">
                    <h3>💬 البطاقة 2: روم الأسئلة والدردشة</h3>
                    <p>هذا الروم مخصص للدردشة المباشرة مع الذكاء الاصطناعي (Groq).</p>
                    <label>ID قناة الدردشة:</label>
                    <input type="text" name="chatChannel" value="${chatCh}" placeholder="أدخل ID الروم هنا">
                </div>

                <!-- 3 البطاقة الثالثة -->
                <div class="card">
                    <h3>📥 البطاقة 3: روم تحميل الروابط</h3>
                    <p>هذا الروم مخصص للتحميل التلقائي من روابط تيك توك، إنستا، وتويتر.</p>
                    <label>ID قناة تحميل الفيديوهات:</label>
                    <input type="text" name="downloadChannel" value="${downloadCh}" placeholder="أدخل ID الروم هنا">
                </div>

                <button type="submit">💾 حفظ إعدادات البطاقات وتفعيلها فوراً</button>
            </form>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

// استقبال وحفظ البيانات القادمة من الداش بورد
app.post('/save', async (req, res) => {
    const { imageChannel, chatChannel, downloadChannel } = req.body;
    await db.set('dashboard_image_channel', imageChannel.trim());
    await db.set('dashboard_chat_channel', chatChannel.trim());
    await db.set('dashboard_download_channel', downloadChannel.trim());
    res.send('<h2 style="font-family:Arial; text-align:center; margin-top:50px; color:#2ecc71;">✅ تم حفظ وإرسال البيانات للبوت بنجاح! يمكنك إغلاق الصفحة والعودة للديسكورد.</h2><script>setTimeout(() => { window.location.href = "/"; }, 2000);</script>');
});

app.listen(PORT, () => console.log(`🌐 الـ Dashboard شغال على الرابط المحلي أو خادم راندر عبر البورت: ${PORT}`));

// 2. إعداد ديسكورد والذكاء الاصطناعي
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const REMOVE_BG_KEY = process.env.REMOVE_BG_KEY;

client.once('ready', () => {
    console.log(`🔥 [البوت متصل]: تم تشغيل ${client.user.tag} وجاري مراقبة رومات البطاقات...`);
});
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // جلب الـ IDs الحية التي قام صاحب السيرفر بتحديدها من الداش بورد
    const imageChannelId = await db.get('dashboard_image_channel');
    const chatChannelId = await db.get('dashboard_chat_channel');
    const downloadChannelId = await db.get('dashboard_download_channel');

    // ----------------------------------------------------
    // 🗂️ تشغيل البطاقة 1: روم الصور والتعديل وازالة الخلفية
    // ----------------------------------------------------
    if (imageChannelId && message.channel.id === imageChannelId) {
        
        // أ) ميزة إنشاء الصور بالكامل
        if (message.content.startsWith('انشئ صوره:')) {
            const prompt = message.content.replace('انشئ صوره:', '').trim();
            if (!prompt) return message.reply('❌ اكتب وصف الصورة بعد النقطتين!');
            
            await message.channel.sendTyping();
            try {
                const response = await openai.images.generate({
                    model: "dall-e-3",
                    prompt: prompt,
                    n: 1,
                    size: "1024x1024",
                });
                return message.reply({ content: `🎨 تفضل صورتك بالذكاء الاصطناعي:\n${response.data.url}` });
            } catch (error) {
                return message.reply('❌ فشل إنشاء الصورة، تأكد من شحن حسابك في OpenAI.');
            }
        }

        // ب) ميزة إزالة الخلفية الاحترافية (ارفع صورة واكتب "ازاله خلفيه")
        if (message.content === 'ازالة خلفية' || message.content === 'ازاله خلفيه') {
            const img = message.attachments.first();
            if (!img) return message.reply('❌ يرجى رفع صورة مع كتابة النص!');

            await message.channel.sendTyping();
            try {
                const formData = new FormData();
                formData.append('size', 'auto');
                formData.append('image_url', img.url);

                const response = await axios({
                    method: 'post',
                    url: 'https://remove.bg',
                    data: formData,
                    headers: { ...formData.getHeaders(), 'X-Api-Key': REMOVE_BG_KEY },
                    responseType: 'arraybuffer'
                });

                const buffer = Buffer.from(response.data);
                const file = new AttachmentBuilder(buffer, { name: 'no-bg.png' });
                return message.reply({ content: '✨ تم مسح الخلفية بالكامل:', files: [file] });
            } catch (error) {
                return message.reply('❌ حدث خطأ، تأكد من صحة مفتاح REMOVE_BG_KEY في Render.');
            }
        }
    }

    // ----------------------------------------------------
    // 🗂️ تشغيل البطاقة 2: روم الأسئلة والدردشة (Groq)
    // ----------------------------------------------------
    if (chatChannelId && message.channel.id === chatChannelId) {
        await message.channel.sendTyping();
        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: message.content }],
                model: 'llama3-8b-8192',
            });
            return message.reply(completion.choices.message.content);
        } catch (error) {
            return message.reply('❌ خطأ في محرك الدردشة الذكي.');
        }
    }

    // ----------------------------------------------------
    // 🗂️ تشغيل البطاقة 3: روم الروابط وتحميل الفيديوهات (إنستا، تيك توك، تويتر)
    // ----------------------------------------------------
    if (downloadChannelId && message.channel.id === downloadChannelId) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const links = message.content.match(urlRegex);

        if (links) {
            const link = links;
            const checkDomain = ['tiktok.com', 'instagram.com', 'twitter.com', 'x.com'].some(d => link.includes(d));
            
            if (checkDomain) {
                await message.channel.sendTyping();
                try {
                    // سكرابر خارجي آمن ومستمر لتخطي جدران حماية المنصات الثلاثة دون توقف السيرفر
                    const res = await axios.get(`https://dandi.link{encodeURIComponent(link)}`, { timeout: 15000 });
                    
                    if (res.data && res.data.server_url) {
                        const videoUrl = res.data.server_url;
                        
                        // فحص حجم الفيديو لتجنب مشاكل ديسكورد وحظر الرفع
                        const sizeCheck = await axios.head(videoUrl).catch(() => null);
                        const size = sizeCheck ? parseInt(sizeCheck.headers['content-length'] || '0') : 0;
                        const limit = 25 * 1024 * 1024; // حد الرفع للديسكورد (25 ميجا)

                        if (size > limit) {
                            return message.reply({ content: `⚠️ حجم الفيديو كبير جداً للرفع المباشر (${(size / (1024*1024)).toFixed(1)}MB).\n📥 تفضل رابط المشاهدة والتحميل السريع:\n${videoUrl}` });
                        } else {
                            return message.reply({ content: `📥 تفضل تم تحميل الفيديو بنجاح:`, files: [videoUrl] });
                        }
                    } else {
                        return message.reply('❌ لم أستطع العثور على ملف ميديا صالح داخل الرابط.');
                    }
                } catch (e) {
                    return message.reply('❌ حدث خطأ أثناء الاتصال بخادم المعالجة الخارجي.');
                }
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

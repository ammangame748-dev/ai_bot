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
                if (!base64) throw new Error('No image returned');

                const buffer = Buffer.from(base64, 'base64');

                await message.channel.send({
                    files: [new AttachmentBuilder(buffer, { name: 'image.jpg' })]
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
            if (!content) return;

            const res = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: content
            });

            await message.reply(res.text);
        }

    } catch (err) {
        console.error('BOT ERROR:', err);
    }
});

// ---------------- LOGIN ----------------
client.login(process.env.DISCORD_TOKEN);

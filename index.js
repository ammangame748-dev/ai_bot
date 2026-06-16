
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
                const imageResponse = await openai.images.generate({
                    model: "gpt-image-1",
                    prompt,
                    n: 1,
                    size: "1024x1024",
                });

                return message.reply(imageResponse.data[0].url);

            } catch (error) {
                console.error(error);
                return message.reply("❌ فشل إنشاء الصورة");
            }
        }
    }

    // 🃏 [البطاقة الثانية]: الدردشة
if (CARDS_CONFIG.CHAT_CHANNEL_ID && channelId === CARDS_CONFIG.CHAT_CHANNEL_ID) {
    await message.channel.sendTyping();

    try {
        const result = await model.generateContent(message.content);
        const response = await result.response;
        const text = response.text();

        return message.reply(text);

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

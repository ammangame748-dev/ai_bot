const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

// إعدادات لوحة التحكم
const app = express();
const port = process.env.PORT || 3000;
app.use(express.urlencoded({ extended: true }));

let config = {
    chat_channel: '',
    image_gen_channel: '',
    bg_remove_channel: '',
    video_dl_channel: ''
};

app.get('/', (req, res) => {
    res.send(`
        <html dir="rtl">
        <body style="background: #2c2f33; color: white; font-family: sans-serif; padding: 50px;">
            <div style="max-width: 500px; margin: auto; background: #23272a; padding: 20px; border-radius: 10px;">
                <h1>إعدادات بوت الذكاء الاصطناعي (Replicate)</h1>
                <form action="/save" method="POST">
                    <label>ID قناة الدردشة (Llama 3):</label>  

                    <input type="text" name="chat_channel" value="${config.chat_channel}" style="width:100%; margin: 10px 0;">  

                    <label>ID قناة توليد الصور (SDXL):</label>  

                    <input type="text" name="image_gen_channel" value="${config.image_gen_channel}" style="width:100%; margin: 10px 0;">  

                    <label>ID قناة إزالة الخلفية:</label>  

                    <input type="text" name="bg_remove_channel" value="${config.bg_remove_channel}" style="width:100%; margin: 10px 0;">  

                    <label>ID قناة تنزيل الفيديوهات:</label>  

                    <input type="text" name="video_dl_channel" value="${config.video_dl_channel}" style="width:100%; margin: 10px 0;">  

                    <button type="submit" style="background: #7289da; color: white; border: none; padding: 10px 20px; cursor: pointer; border-radius: 5px;">حفظ الإعدادات</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/save', (req, res) => {
    config = { ...config, ...req.body };
    res.redirect('/');
});

app.listen(port, () => console.log(`Dashboard running on port ${port}`));

// إعدادات البوت
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

async function runReplicate(model, input) {
    const response = await axios.post(`https://api.replicate.com/v1/predictions`, {
        version: model,
        input: input
    }, {
        headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' }
    });

    let prediction = response.data;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const check = await axios.get(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
            headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` }
        });
        prediction = check.data;
    }
    return prediction.output;
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const channelId = message.channel.id;

    // 1. الدردشة (Llama 3)
    if (channelId === config.chat_channel) {
        message.channel.sendTyping();
        try {
            const output = await runReplicate("7119221d9b1a4369408092283e18f2f458e046a624f2165e3863d043f656221c", { prompt: message.content });
            message.reply(output.join(""));
        } catch (e) { message.reply("خطأ في الدردشة."); }
    }

    // 2. توليد الصور (SDXL)
    else if (channelId === config.image_gen_channel) {
        message.channel.sendTyping();
        try {
            const output = await runReplicate("7762fd0e230408d3c7903e98199d75bee3f7930563d3264025bcb1a7353e8a73", { prompt: message.content });
            message.reply(output[0]);
        } catch (e) { message.reply("خطأ في توليد الصورة."); }
    }

    // 3. إزالة الخلفية
    else if (channelId === config.bg_remove_channel) {
        if (message.attachments.size > 0) {
            message.channel.sendTyping();
            try {
                const output = await runReplicate("95fcc2a26d773517c1d770393985ae067a65239e48719875a6c118b9b392261d", { image: message.attachments.first().url });
                message.reply(output);
            } catch (e) { message.reply("خطأ في إزالة الخلفية."); }
        }
    }

    // 4. تنزيل الفيديوهات
    else if (channelId === config.video_dl_channel) {
        if (message.content.includes('http')) {
            message.channel.sendTyping();
            const filePath = path.join(__dirname, `video_${Date.now()}.mp4`);
            exec(`yt-dlp -o "${filePath}" "${message.content}"`, (err) => {
                if (err) return message.reply("فشل التنزيل.");
                message.reply({ files: [new AttachmentBuilder(filePath)] }).then(() => fs.unlinkSync(filePath));
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

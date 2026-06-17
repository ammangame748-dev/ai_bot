const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

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
                <h1 style="text-align: center;">لوحة تحكم بوت AI (Replicate)</h1>
                <form action="/save" method="POST">
                    <label>ID قناة الدردشة (Llama 3):</label><br>
                    <input type="text" name="chat_channel" value="${config.chat_channel}" style="width:100%; padding: 8px; margin: 10px 0;"><br>
                    <label>ID قناة الصور (SDXL):</label><br>
                    <input type="text" name="image_gen_channel" value="${config.image_gen_channel}" style="width:100%; padding: 8px; margin: 10px 0;"><br>
                    <label>ID قناة إزالة الخلفية:</label><br>
                    <input type="text" name="bg_remove_channel" value="${config.bg_remove_channel}" style="width:100%; padding: 8px; margin: 10px 0;"><br>
                    <label>ID قناة الفيديوهات:</label><br>
                    <input type="text" name="video_dl_channel" value="${config.video_dl_channel}" style="width:100%; padding: 8px; margin: 10px 0;"><br>
                    <button type="submit" style="width: 100%; background: #7289da; color: white; border: none; padding: 10px; cursor: pointer; border-radius: 5px;">حفظ</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/save', (req, res) => {
    config = { ...config, ...req.body };
    console.log("Config Updated:", config);
    res.redirect('/');
});

app.listen(port, () => console.log(`Dashboard active on port ${port}`));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

async function callReplicate(version, input) {
    try {
        const response = await axios.post('https://api.replicate.com/v1/predictions', 
            { version, input },
            { headers: { 'Authorization': `Token ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' } }
        );
        
        let prediction = response.data;
        while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
            await new Promise(r => setTimeout(r, 2000));
            const check = await axios.get(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
                headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` }
            });
            prediction = check.data;
        }
        
        if (prediction.status === 'failed') throw new Error(prediction.error);
        return prediction.output;
    } catch (error) {
        console.error("Replicate Error:", error.message);
        throw error;
    }
}

client.on('ready', () => console.log(`Bot Ready: ${client.user.tag}`));

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const channelId = message.channel.id;

    try {
        if (channelId === config.chat_channel) {
            await message.channel.sendTyping();
            const output = await callReplicate("7119221d9b1a4369408092283e18f2f458e046a624f2165e3863d043f656221c", { prompt: message.content });
            await message.reply(Array.isArray(output) ? output.join("") : output);
        }
        else if (channelId === config.image_gen_channel) {
            await message.channel.sendTyping();
            const output = await callReplicate("7762fd0e230408d3c7903e98199d75bee3f7930563d3264025bcb1a7353e8a73", { prompt: message.content });
            await message.reply(Array.isArray(output) ? output[0] : output);
        }
        else if (channelId === config.bg_remove_channel) {
            if (message.attachments.size > 0) {
                await message.channel.sendTyping();
                const output = await callReplicate("95fcc2a26d773517c1d770393985ae067a65239e48719875a6c118b9b392261d", { image: message.attachments.first().url });
                await message.reply(output);
            }
        }
        else if (channelId === config.video_dl_channel) {
            if (message.content.includes('http')) {
                await message.channel.sendTyping();
                const filePath = path.join(__dirname, `vid_${Date.now()}.mp4`);
                exec(`yt-dlp -o "${filePath}" "${message.content}"`, async (err) => {
                    if (err) return message.reply("فشل التنزيل.");
                    if (fs.existsSync(filePath)) {
                        await message.reply({ files: [new AttachmentBuilder(filePath)] });
                        fs.unlinkSync(filePath);
                    }
                });
            }
        }
    } catch (e) {
        message.reply(`حدث خطأ: ${e.message}`);
    }
});

client.login(process.env.DISCORD_TOKEN);

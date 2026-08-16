require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
const CALLBACK_URL = process.env.CALLBACK_URL || `${BASE_URL || `http://localhost:${PORT}`}/oauth/callback`;
const settingsFile = path.join(__dirname, 'settings.json');
const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
const saveSettings = () => fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

if (!process.env.DISCORD_TOKEN) console.warn('Missing DISCORD_TOKEN');
if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) console.warn('Missing Discord OAuth variables');
if (!process.env.GEMINI_API_KEY) console.warn('Missing GEMINI_API_KEY');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function layout(title, body, user) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Nebula AI</title><style>
  :root{--bg:#080b18;--card:#11172a;--card2:#171f38;--text:#f6f7fb;--muted:#9ba7c4;--primary:#8b5cf6;--cyan:#22d3ee;--line:#273252;--danger:#fb7185}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#1d1747 0,#080b18 42%);font-family:Tahoma,Arial,sans-serif;color:var(--text);min-height:100vh}.nav{height:72px;border-bottom:1px solid #1b2440;display:flex;align-items:center;justify-content:space-between;padding:0 6%;backdrop-filter:blur(12px);background:#080b18aa}.brand{font-weight:900;font-size:21px;letter-spacing:.3px}.brand span{color:var(--cyan)}.user{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:13px}.avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--cyan));display:grid;place-items:center;font-weight:bold;color:white}.logout{color:#cbd5e1;text-decoration:none;border:1px solid var(--line);padding:9px 13px;border-radius:10px}.wrap{max-width:1120px;margin:0 auto;padding:48px 22px}.hero{margin-bottom:30px}.eyebrow{color:var(--cyan);font-size:12px;font-weight:bold;letter-spacing:1px}.hero h1{font-size:36px;margin:10px 0}.hero p{color:var(--muted);line-height:1.8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.card{background:linear-gradient(145deg,#141b32e8,#0e1427e8);border:1px solid var(--line);border-radius:20px;padding:22px;box-shadow:0 18px 50px #0003}.card h2{font-size:18px;margin:0 0 8px}.card p,.hint{color:var(--muted);font-size:13px;line-height:1.7}.select,button{width:100%;border-radius:12px;padding:13px 14px;font:inherit;margin-top:14px}.select{background:#0b1020;color:var(--text);border:1px solid #354163}.button{background:linear-gradient(135deg,var(--primary),#6d5dfc);border:0;color:#fff;cursor:pointer;font-weight:bold}.button:hover{filter:brightness(1.12)}.status{display:inline-flex;align-items:center;gap:7px;color:#86efac;font-size:13px}.dot{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 10px #4ade80}.notice{background:#14233a;border:1px solid #245078;border-radius:12px;padding:13px;color:#bae6fd;margin-bottom:22px;font-size:13px}.login{min-height:100vh;display:grid;place-items:center;padding:24px}.loginbox{text-align:center;max-width:500px}.logo{width:78px;height:78px;margin:0 auto 22px;border-radius:24px;display:grid;place-items:center;font-size:35px;background:linear-gradient(135deg,var(--primary),var(--cyan));box-shadow:0 15px 45px #22d3ee33}.loginbox h1{font-size:38px;margin:0 0 12px}.loginbox p{color:var(--muted);line-height:1.9}.loginbtn{display:inline-block;margin-top:18px;padding:14px 25px;border-radius:13px;background:#5865f2;color:#fff;text-decoration:none;font-weight:bold}.footer{color:#687492;text-align:center;margin-top:35px;font-size:12px}.server-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;margin-top:18px}.server-card{border:1px solid var(--line);background:#0d1428;border-radius:16px;padding:16px;text-align:right;color:var(--text);cursor:pointer;transition:.2s;min-height:110px}.server-card:hover,.server-card.active{border-color:var(--cyan);background:#142044;transform:translateY(-2px)}.server-card .server-logo{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,var(--primary),var(--cyan));font-weight:bold;font-size:18px;float:right;margin-left:12px}.server-card strong{display:block;padding-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.server-card small{display:block;color:var(--muted);margin-top:8px}.empty{padding:20px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);text-align:center}@media(max-width:600px){.hero h1{font-size:28px}}
</style></head><body>${body}</body></html>`;
}

app.get('/healthz', (req, res) => res.json({ ok: true, bot: client.isReady(), uptime: Math.round(process.uptime()) }));

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  const redirect = CALLBACK_URL;
  const oauth = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(process.env.CLIENT_ID || '')}&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&scope=identify%20guilds`;
  res.send(layout('تسجيل الدخول', `<main class="login"><section class="loginbox"><div class="logo">✦</div><div class="eyebrow">NEBULA AI CONTROL CENTER</div><h1>لوحة تحكم ذكية</h1><p>سجّل دخولك بحساب Discord لإدارة روم الدردشة ومتابعة حالة البوت من مكان واحد.</p><a class="loginbtn" href="${oauth}">تسجيل الدخول عبر Discord</a><div class="footer">آمن، سريع، ومصمم لسيرفرك</div></section></main>`, null));
});

app.get(['/oauth/callback', '/auth/discord/callback'], async (req, res) => {
  try {
    const redirect = CALLBACK_URL;
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({ client_id:process.env.CLIENT_ID, client_secret:process.env.CLIENT_SECRET, grant_type:'authorization_code', code:req.query.code, redirect_uri:redirect }) });
    const token = await tokenResponse.json();
    if (!token.access_token) throw new Error('OAuth token failed');
    const userResponse = await fetch('https://discord.com/api/users/@me', { headers:{ Authorization:`Bearer ${token.access_token}` } });
    const user = await userResponse.json();
    const guildResponse = await fetch('https://discord.com/api/users/@me/guilds', { headers:{ Authorization:`Bearer ${token.access_token}` } });
    req.session.user = user;
    req.session.guilds = await guildResponse.json();
    res.redirect('/');
  } catch (e) { console.error(e); res.status(500).send('فشل تسجيل الدخول. تأكد من إعداد Redirect URI والمتغيرات.'); }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/', requireLogin, (req, res) => {
  const manageable = (req.session.guilds || []).filter(g => (BigInt(g.permissions || 0) & BigInt(PermissionsBitField.Flags.ManageGuild)) !== 0n);
  const selectedGuild = manageable.find(g => settings[g.id])?.id || '';
  const guildOptions = manageable.length ? manageable.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('') : '<option>لا توجد سيرفرات قابلة للإدارة</option>';
  const guildCards = manageable.length ? manageable.map(g => `<button type="button" class="server-card ${selectedGuild === g.id ? 'active' : ''}" data-guild="${esc(g.id)}"><span class="server-logo">${esc((g.name || 'S')[0].toUpperCase())}</span><strong>${esc(g.name)}</strong><small>${selectedGuild === g.id ? 'محدد حاليًا' : 'اضغط لاختيار هذا السيرفر'}</small></button>`).join('') : '<div class="empty">لا توجد سيرفرات تملك صلاحية إدارتها أو لم يتم تثبيت البوت فيها.</div>';
  const body = `<nav class="nav"><div class="brand">Nebula <span>AI</span></div><div class="user"><div class="avatar">${esc((req.session.user.username || 'U')[0].toUpperCase())}</div><span>${esc(req.session.user.username)}</span><a class="logout" href="/logout">خروج</a></div></nav><main class="wrap"><section class="hero"><div class="eyebrow">DISCORD AI ASSISTANT</div><h1>مرحبًا بك، ${esc(req.session.user.global_name || req.session.user.username)}</h1><p>تحكم بمكان الدردشة، ودع البوت يجيب بذكاء مع معلومات من الويب عند الحاجة.</p></section><div class="notice"><span class="status"><i class="dot"></i> ${client.isReady() ? 'البوت متصل ويعمل' : 'البوت يتصل الآن'}</span> — لا تضع مفاتيحك السرية داخل الكود، استخدم Environment Variables في Render.</div><section class="card"><h2>اختر السيرفر</h2><p>بعد تسجيل الدخول، اختر السيرفر الذي تريد تشغيل بوت الدردشة فيه. ستظهر فقط السيرفرات التي تملك صلاحية إدارتها.</p><div class="server-grid">${guildCards}</div><form method="post" action="/settings" id="channelForm"><input type="hidden" name="guildId" id="guildId" value=""><select class="select" name="channelId" id="channelId" required disabled><option value="">اختر السيرفر أولًا</option></select><button class="button" id="saveBtn" disabled>حفظ روم الدردشة</button></form></section><section class="grid"><article class="card"><h2>حالة النظام</h2><p>يستمع البوت للرسائل في الروم المحدد فقط، ولا يرد على نفسه أو على الرومات الأخرى.</p><div class="hint">البحث بالويب: ${process.env.WEB_SEARCH_ENABLED === 'false' ? 'متوقف' : 'مفعّل'}<br>نموذج الذكاء: ${esc(process.env.GEMINI_MODEL || 'Gemini Flash')}<br>الاستضافة: Render</div></article></section><div class="footer">Nebula AI · لوحة تحكم Discord</div></main><script>const cards=[...document.querySelectorAll('.server-card')],guildInput=document.querySelector('#guildId'),channel=document.querySelector('#channelId'),save=document.querySelector('#saveBtn');async function choose(card){cards.forEach(x=>x.classList.remove('active'));card.classList.add('active');guildInput.value=card.dataset.guild;channel.disabled=true;save.disabled=true;channel.innerHTML='<option>جار تحميل الرومات...</option>';try{const r=await fetch('/api/channels/'+card.dataset.guild);const d=await r.json();channel.innerHTML=d.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join('')||'<option value="">لا يوجد روم نصي متاح</option>';channel.disabled=!d.length;save.disabled=!d.length}catch(e){channel.innerHTML='<option value="">تعذر تحميل الرومات</option>'}}cards.forEach(card=>card.addEventListener('click',()=>choose(card)));</script>`;
  res.send(layout('لوحة التحكم', body, req.session.user));
});

app.get('/api/channels/:guildId', requireLogin, async (req, res) => {
  try { const guild = await client.guilds.fetch(req.params.guildId); const channels = await guild.channels.fetch(); res.json(channels.filter(c => c && c.isTextBased() && c.guild && c.viewable).map(c => ({ id:c.id, name:'# '+c.name })).sort((a,b)=>a.name.localeCompare(b.name))); } catch { res.status(403).json([]); }
});

app.post('/settings', requireLogin, (req, res) => {
  const { guildId, channelId } = req.body;
  const allowed = (req.session.guilds || []).some(g => g.id === guildId && (BigInt(g.permissions || 0) & BigInt(PermissionsBitField.Flags.ManageGuild)) !== 0n);
  if (!allowed) return res.status(403).send('ليس لديك صلاحية إدارة هذا السيرفر.');
  settings[guildId] = channelId; saveSettings(); res.redirect('/');
});

async function webSearch(query) {
  if (process.env.WEB_SEARCH_ENABLED === 'false') return '';
  try { const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers:{'User-Agent':'Mozilla/5.0'} }); const html = await r.text(); return [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/g)].slice(0,5).map(m=>`- ${m[2].replace(/<[^>]+>/g,'')} (${m[1]})`).join('\n'); } catch { return ''; }
}

async function askAI(prompt, context) {
  if (!process.env.GEMINI_API_KEY) return 'البوت متصل، لكن الدردشة الذكية تحتاج إضافة GEMINI_API_KEY في Render.';
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ contents:[{ role:'user', parts:[{ text:`أنت مساعد Discord عربي ذكي ومحدث. أجب بشكل واضح ومفيد، واستخدم نتائج البحث المرفقة عند الحاجة. لا تخترع معلومات، واذكر الروابط المهمة في نهاية الإجابة.\n\nالسؤال:\n${prompt}\n\nنتائج الويب الحديثة:\n${context || 'لم تظهر نتائج إضافية.'}` }] }], generationConfig:{ temperature:.35, maxOutputTokens:1800 } }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Gemini API error');
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || 'لم أستطع توليد إجابة الآن.';
}

client.on('ready', () => console.log(`Logged in as ${client.user.tag}`));
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (settings[message.guild.id] !== message.channel.id) return;
  if (!message.content.trim()) return;
  await message.channel.sendTyping();
  try { const context = await webSearch(message.content); const answer = await askAI(message.content, context); for (const part of answer.match(/.{1,1900}/gs) || ['تعذر تقسيم الإجابة']) await message.reply(part); } catch (e) { console.error(e); message.reply('حدث خطأ مؤقت. حاول مرة ثانية بعد قليل.'); }
});

app.listen(PORT, () => console.log(`Dashboard listening on port ${PORT}`));
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('Discord login failed:', err.message));

const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// Render Web Service साठी HTTP Port Binding (Server Live राहण्यासाठी)
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('TOURNAX Bot is active and running 24/7!\n');
}).listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// Firebase Admin Setup
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Telegram Bot Setup (Polling mode)
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// 1. /start Command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Player';

  const welcomeText = `🎮 *TOURNAX Assistant मध्ये आपले स्वागत आहे, ${firstName}!* \n\n` +
    `येथे तुम्हाला Free Fire चे सर्व आगामी सामने, निकाल आणि महत्त्वाच्या अपडेट्स मिळतील.\n\n` +
    `खालील बटणे वापरा किंवा मेनू मधील कमांड्स निवडा:`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏆 चालू सामने (Tournaments)', callback_data: 'cmd_tournaments' }],
        [{ text: '📢 अधिकृत चॅनेल (Updates)', callback_data: 'cmd_updates' }],
        [{ text: '❓ मदत (Help)', callback_data: 'cmd_help' }]
      ]
    },
    parse_mode: 'Markdown'
  };

  bot.sendMessage(chatId, welcomeText, keyboard);
});

// 2. /tournaments Command
bot.onText(/\/tournaments/, async (msg) => {
  const chatId = msg.chat.id;
  await sendUpcomingTournaments(chatId);
});

// 3. /matches Command
bot.onText(/\/matches/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const snapshot = await db.collection('tournaments')
      .where('status', '==', 'LIVE')
      .limit(5)
      .get();

    if (snapshot.empty) {
      bot.sendMessage(chatId, "⚠️ सध्या कोणताही सामना थेट (LIVE) सुरू नाही.");
      return;
    }

    let reply = `🔴 *चालू असलेले सामने (LIVE Matches):*\n\n`;
    snapshot.forEach(doc => {
      const data = doc.data();
      reply += `📌 *${data.name || 'Tournament'}*\n` +
               `🎮 Mode: ${data.mode || 'SOLO'} | Map: ${data.map || 'Bermuda'}\n\n`;
    });
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, "डेटा मिळवण्यात अडचण आली. कृपया नंतर पुन्हा प्रयत्न करा.");
  }
});

// 4. /results Command
bot.onText(/\/results/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const snapshot = await db.collection('tournaments')
      .where('status', '==', 'COMPLETED')
      .limit(5)
      .get();

    if (snapshot.empty) {
      bot.sendMessage(chatId, "⚠️ सध्या कोणतेही अंतिम निकाल उपलब्ध नाहीत.");
      return;
    }

    let reply = `🏆 *अंतिम निकाल (Recent Results):*\n\n`;
    snapshot.forEach(doc => {
      const data = doc.data();
      reply += `✅ *${data.name || 'Tournament'}*\n` +
               `🎮 Mode: ${data.mode || 'SOLO'} | Status: Completed\n\n`;
    });
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, "निकाल मिळवण्यात अडचण आली.");
  }
});

// 5. /updates Command
bot.onText(/\/updates/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const doc = await db.collection('system_settings').doc('community').get();
    const url = doc.exists && doc.data().telegramUrl ? doc.data().telegramUrl : 'https://t.me/TournaxAssistantBot';
    bot.sendMessage(chatId, `📢 *TOURNAX Official Updates*\n\nसर्व नवीन अपडेट्ससाठी आमचे अधिकृत चॅनेल जॉइन करा:\n👉 [TOURNAX OFFICIAL](${url})`, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    });
  } catch (e) {
    bot.sendMessage(chatId, "चॅनेल माहिती लोड करता आली नाही.");
  }
});

// 6. /help Command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = `ℹ️ *उपलब्ध कमांड्स:* \n\n` +
    `/tournaments - आगामी टूर्नामेंट्स पाहण्यासाठी\n` +
    `/matches - सध्या सुरू असलेले सामने पाहण्यासाठी\n` +
    `/results - पूर्ण झालेल्या सामन्यांचे निकाल\n` +
    `/updates - अधिकृत चॅनेलची लिंक\n` +
    `/help - कमांड्सची माहिती`;
  bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// Inline Buttons Handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  if (query.data === 'cmd_tournaments') {
    await sendUpcomingTournaments(chatId);
  } else if (query.data === 'cmd_updates') {
    bot.sendMessage(chatId, `📢 सर्व अपडेट्ससाठी चॅनेल जॉइन करा:\n👉 https://t.me/TournaxAssistantBot`);
  } else if (query.data === 'cmd_help') {
    bot.sendMessage(chatId, `कमांड्स मेनू वापरण्यासाठी खालील कमांड्स टाईप करा:\n/tournaments\n/matches\n/results\n/updates`);
  }
  bot.answerCallbackQuery(query.id);
});

// Helper Function for Tournaments
async function sendUpcomingTournaments(chatId) {
  try {
    const snapshot = await db.collection('tournaments')
      .where('status', '==', 'UPCOMING')
      .limit(5)
      .get();

    if (snapshot.empty) {
      bot.sendMessage(chatId, "⚠️ सध्या कोणतीही आगामी (Upcoming) टूर्नामेंट उपलब्ध नाही.");
      return;
    }

    let reply = `🔥 *आगामी सामने (Upcoming Tournaments):*\n\n`;
    snapshot.forEach(doc => {
      const t = doc.data();
      reply += `🏆 *${t.name || 'Tournament'}*\n` +
               `🎮 Mode: ${t.mode || 'SOLO'} | Map: ${t.map || 'Bermuda'}\n` +
               `📅 Time: ${t.scheduledAt || 'TBA'}\n` +
               `👥 Slots: ${t.joinedPlayers || 0}/${t.totalSlots || 48}\n\n`;
    });
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, "टूर्नामेंट्स लोड करताना त्रुटी आली.");
  }
           }
        

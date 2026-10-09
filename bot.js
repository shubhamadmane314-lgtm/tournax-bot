const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// 1. Render Web Server
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('TOURNAX Bot Running\n');
}).listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// 2. Firebase Setup
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase connected');
} catch (e) {
  console.error('Firebase Error:', e.message);
}
const db = admin.firestore();

// 3. Telegram Setup
const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (err) => {
  console.error('Polling Error:', err.message);
});

// 4. Start Command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Player';

  const welcomeText = `🎮 *TOURNAX Assistant मध्ये स्वागत आहे, ${firstName}!*\n\nखालील बटणे वापरा किंवा कमांड्स निवडा:`;

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

  bot.sendMessage(chatId, welcomeText, keyboard).catch(console.error);
});

// 5. Button Clicks Handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch (err) {}

  if (action === 'cmd_tournaments') {
    await sendTournaments(chatId);
  } else if (action === 'cmd_updates') {
    sendUpdates(chatId);
  } else if (action === 'cmd_help') {
    sendHelp(chatId);
  }
});

// 6. Direct Commands
bot.onText(/\/tournaments/, async (msg) => {
  await sendTournaments(msg.chat.id);
});

bot.onText(/\/matches/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const snapshot = await db.collection('tournaments').where('status', '==', 'LIVE').limit(5).get();
    if (snapshot.empty) {
      bot.sendMessage(chatId, "⚠️ सध्या कोणताही सामना थेट (LIVE) सुरू नाही.");
      return;
    }
    let reply = `🔴 *चालू असलेले सामने (LIVE Matches):*\n\n`;
    snapshot.forEach(doc => {
      const data = doc.data();
      reply += `📌 *${data.name || 'Tournament'}*\n🎮 Mode: ${data.mode || 'SOLO'} | Map: ${data.map || 'Bermuda'}\n\n`;
    });
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, "डेटा लोड करताना अडचण आली.");
  }
});

bot.onText(/\/updates/, (msg) => {
  sendUpdates(msg.chat.id);
});

bot.onText(/\/help/, (msg) => {
  sendHelp(msg.chat.id);
});

// Helper Functions
async function sendTournaments(chatId) {
  try {
    const snapshot = await db.collection('tournaments').limit(5).get();
    if (snapshot.empty) {
      bot.sendMessage(chatId, "⚠️ कोणतीही टूर्नामेंट सापडली नाही.");
      return;
    }
    let reply = `🏆 *टूर्नामेंट्स यादी:*\n\n`;
    snapshot.forEach(doc => {
      const t = doc.data();
      reply += `📌 *${t.name || 'Tournament'}*\n🎮 Mode: ${t.mode || 'SOLO'} | Map: ${t.map || 'Bermuda'}\n\n`;
    });
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, "डेटाबेस लोड करताना त्रुटी आली.");
  }
}

function sendUpdates(chatId) {
  bot.sendMessage(chatId, "📢 *TOURNAX Official Updates*\n\nसर्व अपडेट्ससाठी ग्रुप जॉइन करा:\n👉 [TOURNAX Updates](https://t.me/TournaxAssistantBot)", { parse_mode: 'Markdown' });
}

function sendHelp(chatId) {
  bot.sendMessage(chatId, "ℹ️ *कमांड्स:*\n/tournaments - सर्व टूर्नामेंट्स\n/matches - लाईव्ह सामने\n/updates - चॅनेल लिंक\n/help - माहिती");
}

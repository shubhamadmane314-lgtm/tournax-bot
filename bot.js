const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// 1. Render Port Binding
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('TOURNAX Bot is active and running 24/7!\n');
}).listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// 2. Firebase Admin Setup
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin initialized successfully');
} catch (err) {
  console.error('Firebase Init Error:', err.message);
}
const db = admin.firestore();

// 3. Telegram Bot Setup
const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
console.log('Starting Telegram Bot with token ending in:', token.slice(-5));

const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => {
  console.error('Telegram Polling Error:', error.code, error.message);
});

// 4. Any incoming message logger
bot.on('message', (msg) => {
  console.log(`Received message "${msg.text}" from chatId: ${msg.chat.id}`);
});

// 5. /start Command
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

  bot.sendMessage(chatId, welcomeText, keyboard).catch(err => {
    console.error('Send Error:', err.message);
  });
});

// 6. /tournaments Command
bot.onText(/\/tournaments/, async (msg) => {
  const chatId = msg.chat.id;
  await sendUpcomingTournaments(chatId);
});

// 7. /help Command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "कमांड्स: /tournaments, /matches, /results, /updates");
});

// Helper Function
async function sendUpcomingTournaments(chatId) {
  try {
    const snapshot = await db.collection('tournaments').limit(5).get();
    if (snapshot.empty) {
      bot.sendMessage(chatId, "⚠️ सध्या कोणतीही टूर्नामेंट उपलब्ध नाही.");
      return;
    }
    let reply = `🔥 *Tournaments:*\n\n`;
    snapshot.forEach(doc => {
      const t = doc.data();
      reply += `🏆 *${t.name || 'Tournament'}* (${t.mode || 'SOLO'})\n`;
    });
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Firestore Error:', error.message);
    bot.sendMessage(chatId, "टूर्नामेंट्स लोड करताना त्रुटी आली.");
  }
}

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
} catch (e) {
  console.error('Firebase Admin Error:', e.message);
}
const db = admin.firestore();

// 3. Telegram Bot Setup
const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => {
  console.error('Telegram Polling Error:', error.message);
});

// Helper: Main Menu Keyboard
function getMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏆 चालू सामने (Tournaments)', callback_data: 'cmd_tournaments' }],
        [{ text: '📢 अधिकृत चॅनेल (Updates)', callback_data: 'cmd_updates' }],
        [{ text: '❓ मदत (Help)', callback_data: 'cmd_help' }]
      ]
    },
    parse_mode: 'Markdown'
  };
}

// 4. /start Command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Player';

  const welcomeText = `🎮 *TOURNAX Assistant मध्ये आपले स्वागत आहे, ${firstName}!* \n\n` +
    `येथे तुम्हाला Free Fire चे सर्व आगामी सामने, निकाल आणि महत्त्वाच्या अपडेट्स मिळतील.\n\n` +
    `खालील बटणे वापरा किंवा मेनू मधील कमांड्स निवडा:`;

  bot.sendMessage(chatId, welcomeText, getMainMenu()).catch(err => {
    console.error('Start Message Error:', err.message);
  });
});

// 5. Button Clicks (Callback Query Handler)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error('Callback Answer Error:', err.message);
  }

  if (action === 'cmd_tournaments') {
    await sendUpcomingTournaments(chatId);
  } else if (action === 'cmd_updates') {
    await sendChannelUpdates(chatId);
  } else if (action === 'cmd_help') {
    sendHelpMessage(chatId);
  }
});

// 6. Direct Commands
bot.onText(/\/tournaments/, async (msg) => {
  await sendUpcomingTournaments(msg.chat.id);
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
    bot.sendMessage(chatId, "डेटा मिळवण्यात अडचण आली.");
  }
});

bot.onText(/\/updates/, async (msg) => {
  await sendChannelUpdates(msg.chat.id);
});

bot.onText(/\/help/, (msg) => {
  sendHelpMessage(msg.chat.id);
});

// Helper Functions
async function sendUpcomingTournaments(chatId) {
  try {
    const snapshot = await db.collection('tournaments').where('status', '==', 'UPCOMING').limit(5).get();
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
    console.error('Tournaments Load Error:', error.message);
    bot.sendMessage(chatId, "टूर्नामेंट्स लोड करताना त्रुटी आली.");
  }
}

async function sendChannelUpdates(chatId) {
  try {
    const doc = await db.collection('system_settings').doc('community').get();
    const url = doc.exists && doc.data().telegramUrl ? doc.data().telegramUrl : 'https://t.me/TournaxAssistantBot';
    bot.sendMessage(chatId, `📢 *TOURNAX Official Updates*\n\nसर्व नवीन अपडेट्ससाठी अधिकृत ग्रुप/चॅनेल जॉइन करा:\n👉 [TOURNAX OFFICIAL](${url})`, {
      parse_mode: 'Markdown'
    });
  } catch (e) {
    bot.sendMessage(chatId, "📢 अधिकृत चॅनेल लिंक लोड करता आली नाही.");
  }
}

function sendHelpMessage(chatId) {
  const helpText = `ℹ️ *उपलब्ध कमांड्स:* \n\n` +
    `/tournaments - आगामी टूर्नामेंट्स पाहण्यासाठी\n` +
    `/matches - सध्या सुरू असलेले सामने पाहण्यासाठी\n` +
    `/updates - अधिकृत चॅनेलची लिंक\n` +
    `/help - कमांड्सची माहिती`;
  bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
}
 parse_mode: 'Markdown' });
}

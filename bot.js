const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// 1. Render Keep-Alive Server
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('TOURNAX Automated Engine Running 24/7\n');
}).listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// 2. Firebase Admin Initialization
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase connected successfully');
} catch (e) {
  console.error('Firebase Error:', e.message);
}
const db = admin.firestore();

// 3. Telegram Bot Initialization
const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (err) => {
  console.error('Polling Error:', err.message);
});

// Helper: Main Menu Keyboard (English)
function getMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🏆 Tournaments', callback_data: 'cmd_tournaments' },
          { text: '🎮 My Matches', callback_data: 'cmd_my_matches' }
        ],
        [
          { text: '🔑 Room Details', callback_data: 'cmd_rooms' },
          { text: '👤 Link Account', callback_data: 'cmd_link' }
        ],
        [
          { text: '📢 Official Channel', callback_data: 'cmd_updates' },
          { text: '❓ Help & Guide', callback_data: 'cmd_help' }
        ]
      ]
    },
    parse_mode: 'Markdown'
  };
}

// 4. /start Command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Player';

  const welcomeText = `🎮 *Welcome to TOURNAX Assistant, ${firstName}!* \n\n` +
    `Your competitive Free Fire hub. View matches, receive automated Room IDs, link your game profile, and track stats.\n\n` +
    `Tap the menu buttons below to get started:`;

  bot.sendMessage(chatId, welcomeText, getMainMenu()).catch(console.error);
});

// 5. Callback Query Handler (Button Clicks)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch (err) {}

  if (action === 'cmd_tournaments') {
    await sendTournaments(chatId);
  } else if (action === 'cmd_my_matches') {
    await sendMyMatches(chatId);
  } else if (action === 'cmd_rooms') {
    await sendRoomDetails(chatId);
  } else if (action === 'cmd_link') {
    sendLinkInstructions(chatId);
  } else if (action === 'cmd_updates') {
    sendUpdates(chatId);
  } else if (action === 'cmd_help') {
    sendHelp(chatId);
  }
});

// 6. Direct Commands

// Feature 2: Link App Account with Telegram (/link <APP_UID>)
bot.onText(/\/link(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const appUid = match[1] ? match[1].trim() : null;

  if (!appUid) {
    return bot.sendMessage(
      chatId,
      `⚠️ *Please specify your App User ID.*\n\n*Usage:* \`/link YOUR_APP_USER_ID\`\n(You can find your User ID in the TOURNAX App Profile tab)`,
      { parse_mode: 'Markdown' }
    );
  }

  try {
    await db.collection('telegram_users').doc(String(chatId)).set({
      chatId: chatId,
      appUid: appUid,
      username: msg.from.username || '',
      firstName: msg.from.first_name || '',
      linkedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    bot.sendMessage(
      chatId,
      `✅ *Account Linked Successfully!*\n\n• *App User ID:* \`${appUid}\`\n• *Telegram Chat ID:* \`${chatId}\`\n\nYou will now receive automated Room ID & Password alerts directly here before your matches!`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    bot.sendMessage(chatId, `❌ Failed to link account: ${e.message}`);
  }
});

bot.onText(/\/tournaments/, async (msg) => {
  await sendTournaments(msg.chat.id);
});

bot.onText(/\/my_matches/, async (msg) => {
  await sendMyMatches(msg.chat.id);
});

// Feature 1: Check Current Room ID & Password
bot.onText(/\/room/, async (msg) => {
  await sendRoomDetails(msg.chat.id);
});

bot.onText(/\/updates/, (msg) => {
  sendUpdates(msg.chat.id);
});

bot.onText(/\/help/, (msg) => {
  sendHelp(msg.chat.id);
});

// 7. Helper Business Logic

async function sendTournaments(chatId) {
  try {
    const snapshot = await db.collection('tournaments').limit(6).get();
    if (snapshot.empty) {
      return bot.sendMessage(chatId, "⚠️ *No tournaments available right now.*", { parse_mode: 'Markdown' });
    }

    let reply = `🏆 *Available Tournaments:*\n\n`;
    snapshot.forEach(doc => {
      const t = doc.data();
      reply += `📌 *${t.name || 'Tournament'}*\n` +
               `🎮 Mode: ${t.mode \vert{}\vert{} 'SOLO'} \vert{} Map:${t.map || 'Bermuda'}\n` +
               `💰 Entry: ${t.entryFee ? '₹' + t.entryFee : 'Free'} \vert{} Prize: ₹${t.prizePool || '0'}\n` +
               `📅 Status: *${t.status || 'UPCOMING'}*\n\n`;
    });
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, "❌ Error retrieving tournaments list.");
  }
}

async function sendMyMatches(chatId) {
  try {
    const userDoc = await db.collection('telegram_users').doc(String(chatId)).get();
    if (!userDoc.exists || !userDoc.data().appUid) {
      return bot.sendMessage(
        chatId,
        `⚠️ *Account not linked yet!*\n\nPlease link your app account first using:\n\`/link YOUR_APP_USER_ID\``,
        { parse_mode: 'Markdown' }
      );
    }

    const appUid = userDoc.data().appUid;
    const snap = await db.collection('registrations').where('userId', '==', appUid).limit(5).get();

    if (snap.empty) {
      return bot.sendMessage(chatId, `ℹ️ No registered matches found for User ID: \`${appUid}\`.`, { parse_mode: 'Markdown' });
    }

    let reply = `🎮 *Your Registered Matches:*\n\n`;
    snap.forEach(doc => {
      const reg = doc.data();
      reply += `📌 *${reg.tournamentName || 'Tournament'}*\n` +
               `📅 Slot: ${reg.slotNumber || 'Confirmed'}\n` +
               `🔥 Status: ${reg.status || 'Ready'}\n\n`;
    });
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, "❌ Failed to load your registered matches.");
  }
}

async function sendRoomDetails(chatId) {
  try {
    const userDoc = await db.collection('telegram_users').doc(String(chatId)).get();
    if (!userDoc.exists || !userDoc.data().appUid) {
      return bot.sendMessage(
        chatId,
        `🔒 *Access Restricted*\n\nPlease link your app account using \`/link <USER_ID>\` to view your active Room ID and Password.`,
        { parse_mode: 'Markdown' }
      );
    }

    // Checking for live tournaments with active credentials
    const snap = await db.collection('tournaments').where('status', 'in', ['LIVE', 'STARTING', 'UPCOMING']).limit(5).get();
    let found = false;
    let reply = `🔑 *Active Room Credentials:*\n\n`;

    snap.forEach(doc => {
      const t = doc.data();
      if (t.roomId && t.roomPassword) {
        found = true;
        reply += `🏆 *${t.name}*\n` +
                 `🆔 Room ID: \`${t.roomId}\`\n` +
                 `🔑 Password: \`${t.roomPassword}\`\n\n` +
                 `_Please do not share these details with non-registered players._\n\n`;
      }
    });

    if (!found) {
      return bot.sendMessage(chatId, "⚠️ *No Room credentials have been released yet.* Details are published 15 minutes before match start.", { parse_mode: 'Markdown' });
    }

    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, "❌ Unable to fetch room credentials at this time.");
  }
}

function sendLinkInstructions(chatId) {
  const text = `🔗 *How to Link Your Account:*\n\n` +
    `1. Open the *TOURNAX App*\n` +
    `2. Go to your *Profile* tab and copy your *User ID*\n` +
    `3. Send the command here:\n\n` +
    `\`/link YOUR_USER_ID\`\n\n` +
    `_Once linked, your Room IDs and match notifications will be delivered here automatically!_`;
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

function sendUpdates(chatId) {
  bot.sendMessage(
    chatId,
    `📢 *TOURNAX Official Announcements*\n\nStay ahead with daily schedules, updates, and giveaways:\n👉 [Join Official Updates Channel](https://t.me/TournaxAssistantBot)`,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
}

function sendHelp(chatId) {
  const helpText = `ℹ️ *TOURNAX Bot Commands Guide:*\n\n` +
    `• /start - Refresh and show main menu\n` +
    `• /tournaments - View upcoming tournaments\n` +
    `• /my_matches - View matches you registered for\n` +
    `• /room - Check match Room ID & Password\n` +
    `• /link <USER_ID> - Link your TOURNAX app account\n` +
    `• /updates - Official channel links\n` +
    `• /help - Command list & support`;
  bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
}

// 8. Automated Background Match Notifier (Checks Firestore every 60s)
setInterval(async () => {
  try {
    const notifySnap = await db.collection('notifications_queue').where('sent', '==', false).limit(10).get();
    if (notifySnap.empty) return;

    for (const doc of notifySnap.docs) {
      const item = doc.data();
      if (item.chatId && item.message) {
        await bot.sendMessage(item.chatId, item.message, { parse_mode: 'Markdown' }).catch(console.error);
        await doc.ref.update({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
  } catch (e) {
    // Silent catch for background worker
  }
}, 60000);

const http=require('http'),TelegramBot=require('node-telegram-bot-api'),admin=require('firebase-admin');
const port=process.env.PORT||10000;
http.createServer((q,s)=>{s.writeHead(200,{'Content-Type':'text/plain'});s.end('TOURNAX Engine Active 24/7\n');}).listen(port,()=>console.log(`Port ${port}`));

try{
  admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
  console.log('Firebase connected');
}catch(e){console.error('Firebase Error:',e.message);}
const db=admin.firestore();

const bot=new TelegramBot((process.env.TELEGRAM_BOT_TOKEN||'').trim(),{polling:true});
bot.on('polling_error',e=>console.error('Polling Error:',e.message));

const getMenu=()=>({reply_markup:{inline_keyboard:[
  [{text:'🏆 Tournaments',callback_data:'cmd_tournaments'},{text:'🎮 My Matches',callback_data:'cmd_my_matches'}],
  [{text:'🔑 Room Details',callback_data:'cmd_rooms'},{text:'👤 Link Account',callback_data:'cmd_link'}],
  [{text:'📢 Official Channel',callback_data:'cmd_updates'},{text:'❓ Help & Guide',callback_data:'cmd_help'}]
]},parse_mode:'Markdown'});

bot.onText(/\/start/,m=>{
  bot.sendMessage(m.chat.id,`🎮 *Welcome to TOURNAX Assistant, ${m.from.first_name||'Player'}!*\n\nGet real-time matches, live room IDs, and account alerts here. Choose an option:`,getMenu()).catch(()=>{});
});

bot.on('callback_query',async q=>{
  const c=q.message.chat.id,a=q.data;
  try{await bot.answerCallbackQuery(q.id);}catch(e){}
  if(a==='cmd_tournaments')await sendTournaments(c);
  else if(a==='cmd_my_matches')await sendMyMatches(c);
  else if(a==='cmd_rooms')await sendRoomDetails(c);
  else if(a==='cmd_link')sendLinkInfo(c);
  else if(a==='cmd_updates')sendUpdates(c);
  else if(a==='cmd_help')sendHelp(c);
});

bot.onText(/\/link(.*)/,async(m,k)=>{
  const c=m.chat.id,id=k[1]?k[1].trim().toUpperCase():'';
  if(!id)return bot.sendMessage(c,'⚠️ *Please provide User ID.*\n\n*Usage:* `/link TXINYNCG`',{parse_mode:'Markdown'});
  try{
    let u=await db.collection('users').where('referralCode','==',id).limit(1).get();
    if(u.empty)u=await db.collection('users').where('customId','==',id).limit(1).get();
    const uid=!u.empty?u.docs[0].id:null;
    const name=!u.empty?(u.docs[0].data().name||u.docs[0].data().username||'Player'):(m.from.first_name||'Player');
    await db.collection('telegram_users').doc(String(c)).set({chatId:c,customId:id,authUid:uid,telegramUsername:m.from.username||'',firstName:m.from.first_name||'',linkedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    bot.sendMessage(c,`✅ *Account Linked Successfully!*\n\n• *User ID:* \`${id}\`\n• *Player Name:* *${name}*\n• *Telegram ID:* \`${c}\`\n\nRoom IDs will be sent here automatically!`,{parse_mode:'Markdown'});
  }catch(e){bot.sendMessage(c,`❌ Link error: ${e.message}`);}
});

bot.onText(/\/tournaments/,m=>sendTournaments(m.chat.id));
bot.onText(/\/matches/,m=>sendLiveMatches(m.chat.id));
bot.onText(/\/my_matches/,m=>sendMyMatches(m.chat.id));
bot.onText(/\/room/,m=>sendRoomDetails(m.chat.id));
bot.onText(/\/results/,m=>sendResults(m.chat.id));
bot.onText(/\/updates/,m=>sendUpdates(m.chat.id));
bot.onText(/\/help/,m=>sendHelp(m.chat.id));

async function sendTournaments(c){
  try{
    const s=await db.collection('tournaments').limit(6).get();
    if(s.empty)return bot.sendMessage(c,'⚠️ *No tournaments available.*',{parse_mode:'Markdown'});
    let r='🏆 *Available Tournaments:*\n\n';
    s.forEach(d=>{const t=d.data();r+=`📌 *${t.name||'Match'}*\n🎮 Mode: ${t.mode||'SOLO'} - Map: ${t.map||'Bermuda'}\n💰 Entry: ${t.entryFee?'₹'+t.entryFee:'Free'} - Prize: ₹${t.prizePool||'0'}\n📅 Status: *${(t.status||'UPCOMING').toUpperCase()}*\n\n`;});
    bot.sendMessage(c,r,{parse_mode:'Markdown'});
  }catch(e){bot.sendMessage(c,'❌ Error loading tournaments.');}
}

async function sendLiveMatches(c){
  try{
    const s=await db.collection('tournaments').where('status','in',['LIVE','LIVE NOW','live','starting']).limit(5).get();
    if(s.empty)return bot.sendMessage(c,'⚠️ *No live matches currently running.*',{parse_mode:'Markdown'});
    let r='🔴 *LIVE Matches:*\n\n';
    s.forEach(d=>{const t=d.data();r+=`📌 *${t.name||'Match'}*\n🎮 Mode: ${t.mode||'SOLO'} - Map: ${t.map||'Bermuda'}\n⚡ Status: *LIVE NOW*\n\n`;});
    bot.sendMessage(c,r,{parse_mode:'Markdown'});
  }catch(e){bot.sendMessage(c,'❌ Error loading live matches.');}
}

async function sendRoomDetails(c){
  try{
    const u=await db.collection('telegram_users').doc(String(c)).get();
    if(!u.exists)return bot.sendMessage(c,'🔒 *Access Restricted*\n\nPlease link your app account using `/link <USER_ID>`.',{parse_mode:'Markdown'});
    const s=await db.collection('tournaments').limit(10).get();
    let r='🔑 *Active Room Credentials:*\n\n',f=false;
    s.forEach(d=>{
      const t=d.data(),rid=t.roomId||t.room_id||t.roomID,pass=t.roomPassword||t.password||t.room_pass;
      if(rid){f=true;r+=`🏆 *${t.name||'Match'}*\n🆔 Room ID: \`${rid}\`\n🔑 Password: \`${pass||'None'}\`\n\n`;}
    });
    if(!f)return bot.sendMessage(c,'⚠️ *No active room credentials found yet.* Details appear 15m before match.',{parse_mode:'Markdown'});
    bot.sendMessage(c,r+'_Please join quickly!_',{parse_mode:'Markdown'});
  }catch(e){bot.sendMessage(c,'❌ Failed to fetch room details.');}
}

async function sendMyMatches(c){
  try{
    const u=await db.collection('telegram_users').doc(String(c)).get();
    if(!u.exists)return bot.sendMessage(c,'⚠️ *Account not linked!*\nUse: `/link YOUR_USER_ID`',{parse_mode:'Markdown'});
    const {customId,authUid}=u.data();
    let s=authUid?await db.collection('registrations').where('userId','==',authUid).limit(5).get():null;
    if((!s||s.empty)&&customId)s=await db.collection('registrations').where('customId','==',customId).limit(5).get();
    if(!s||s.empty)return bot.sendMessage(c,`ℹ️ No matches joined for User ID: \`${customId||authUid}\`.`,{parse_mode:'Markdown'});
    let r='🎮 *Your Registered Matches:*\n\n';
    s.forEach(d=>{const g=d.data();r+=`📌 *${g.tournamentName||'Match'}*\n📅 Slot: ${g.slotNumber||'Confirmed'}\n🔥 Status: ${g.status||'Ready'}\n\n`;});
    bot.sendMessage(c,r,{parse_mode:'Markdown'});
  }catch(e){bot.sendMessage(c,'❌ Failed to load joined matches.');}
}

async function sendResults(c){
  try{
    const s=await db.collection('tournaments').where('status','in',['COMPLETED','completed','DONE','done']).limit(4).get();
    if(s.empty)return bot.sendMessage(c,'ℹ️ *No completed match results yet.*',{parse_mode:'Markdown'});
    let r='🏁 *Recent Match Results:*\n\n';
    s.forEach(d=>{const t=d.data();r+=`🏆 *${t.name||'Match'}*\n👑 Winner: *${t.winnerName||'App Notice'}*\n💰 Prize: ₹${t.prizePool||'0'}\n\n`;});
    bot.sendMessage(c,r,{parse_mode:'Markdown'});
  }catch(e){bot.sendMessage(c,'❌ Failed to load results.');}
}

function sendLinkInfo(c){bot.sendMessage(c,'🔗 *Link Your Account:*\n\n1. Open *TOURNAX App* > *Profile*\n2. Copy your *User ID* (e.g. `TXINYNCG`)\n3. Send:\n`/link YOUR_USER_ID`',{parse_mode:'Markdown'});}
function sendUpdates(c){bot.sendMessage(c,'📢 *TOURNAX Official Announcements*\n\nJoin for daily schedules and updates:\n👉 [Join Updates Channel](https://t.me/TournaxAssistantBot)',{parse_mode:'Markdown',disable_web_page_preview:true});}
function sendHelp(c){bot.sendMessage(c,'ℹ️ *Commands:*\n/tournaments - View tournaments\n/matches - Live matches\n/room - Room ID & Password\n/my_matches - Joined matches\n/results - Winners\n/link <USER_ID> - Link ID\n/updates - News\n/help - Guide',{parse_mode:'Markdown'});}

setInterval(async()=>{
  try{
    const q=await db.collection('notifications_queue').where('sent','==',false).limit(10).get();
    if(q.empty)return;
    for(const doc of q.docs){
      const i=doc.data();
      if(i.chatId&&i.message){
        await bot.sendMessage(i.chatId,i.message,{parse_mode:'Markdown'}).catch(()=>{});
        await doc.ref.update({sent:true,sentAt:admin.firestore.FieldValue.serverTimestamp()});
      }
    }
  }catch(e){}
},60000);

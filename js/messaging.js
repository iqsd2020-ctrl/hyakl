// نظام المراسلة
import {
  collection, doc, setDoc, getDoc, updateDoc, addDoc,
  query, orderBy, limit, onSnapshot, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

let _inited = false;
let _convUnsub = null;
let _msgsUnsub = null;
let _isOpen = false;
let _uid = null;
let _db = null;
let _getUsername = null;
let _toast = null;

function el(id){ return document.getElementById(id); }

function safeText(s){
  return (s ?? '').toString().replace(/\s+/g,' ').trim();
}

function formatTime(ts){
  try{
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
    if(!d) return '';
    return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  }catch(_){ return ''; }
}

function showBubble(show, hasBadge){
  const b = el('chat-float-bubble');
  const badge = el('chat-float-badge');
  if(!b) return;
  if(show) b.classList.remove('hidden'); else b.classList.add('hidden');
  if(badge){
    if(hasBadge) badge.classList.remove('hidden'); else badge.classList.add('hidden');
  }
}

async function ensureConversationDoc(){
  const convRef = doc(_db, 'conversations', _uid);
  const snap = await getDoc(convRef);
  if(!snap.exists()){
    await setDoc(convRef, {
      userId: _uid,
      username: _getUsername ? (_getUsername() || 'مستخدم') : 'مستخدم',
      createdAt: serverTimestamp(),
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      unreadByUser: false,
      unreadByDeveloper: false
    }, { merge: true });
  } else {
    // تحديث الاسم إن تغير
    const uname = _getUsername ? (_getUsername() || 'مستخدم') : 'مستخدم';
    const data = snap.data() || {};
    if(uname && uname !== data.username){
      await updateDoc(convRef, { username: uname }).catch(()=>{});
    }
  }
}

function renderMessageRow(msg){
  const wrap = document.createElement('div');
  const isMe = msg.sender === 'user';
  wrap.className = `w-full flex ${isMe ? 'justify-end' : 'justify-start'}`;

  const bubble = document.createElement('div');
  bubble.className = [
    'max-w-[82%] rounded-2xl px-3 py-2 border text-sm leading-relaxed',
    isMe ? 'bg-emerald-500/15 border-emerald-500/25 text-slate-100' : 'bg-slate-800/70 border-slate-700 text-slate-100'
  ].join(' ');

  const txt = document.createElement('div');
  txt.className = 'whitespace-pre-wrap break-words';
  txt.textContent = msg.text || '';
  bubble.appendChild(txt);

  const meta = document.createElement('div');
  meta.className = `mt-1 text-[10px] opacity-70 flex items-center gap-1 ${isMe ? 'justify-start text-left' : 'justify-end text-right'}`;

  const t = document.createElement('span');
  t.textContent = formatTime(msg.createdAt);
  meta.appendChild(t);

  // علامات القراءة ✓✓ للرسائل المُرسلة فقط
  if(isMe){
    const ticks = document.createElement('span');
    const read = !!(msg.readByDeveloper);
    ticks.textContent = read ? '✓✓' : '✓';
    ticks.className = 'opacity-80';
    meta.appendChild(ticks);
  }

  bubble.appendChild(meta);

  wrap.appendChild(bubble);
  return wrap;
}

function scrollMessagesToBottom(){
  const box = el('chat-messages');
  if(!box) return;
  box.scrollTop = box.scrollHeight + 9999;
}

async function markUserRead(){
  if(!_db || !_uid) return;
  const convRef = doc(_db, 'conversations', _uid);
  await updateDoc(convRef, { unreadByUser: false }).catch(()=>{});
}

// تعليم رسائل المطور كمقروءة على مستوى الرسائل (لأجل ✓✓)
async function markIncomingMessagesReadByUser(snap){
  if(!_db || !_uid) return;
  let changed = 0;
  const batch = writeBatch(_db);

  snap.forEach(docu=>{
    const m = docu.data() || {};
    if(m.sender === 'developer' && !m.readByUser){
      batch.update(docu.ref, { readByUser: true, readAtUser: serverTimestamp() });
      changed++;
    }
  });

  if(changed){
    // كذلك نطفئ فقاعة "غير مقروء" للمستخدم
    batch.update(doc(_db,'conversations',_uid), { unreadByUser: false });
    await batch.commit().catch(()=>{});
  }
}

function openChatPage(){
  const page = el('chat-page');
  if(!page) return;

  _isOpen = true;
  page.classList.remove('hidden');
  // عند فتح صفحة المراسلة نعتبر الرسائل مقروءة وتختفي الفقاعة
  markUserRead();
  showBubble(false, false);

  // بدء الاستماع للرسائل فقط عندما تكون الصفحة مفتوحة
  startMessagesListener();

  // تحديث العنوان (اسم المستخدم/المطور)
  const headerUser = el('chat-header-user');
  if(headerUser){
    headerUser.textContent = 'المطور';
  }

  // فوكس على الإدخال
  setTimeout(()=> el('chat-input')?.focus(), 50);
}

function closeChatPage(){
  const page = el('chat-page');
  if(!page) return;
  _isOpen = false;
  page.classList.add('hidden');
  stopMessagesListener();
}

function stopMessagesListener(){
  if(_msgsUnsub){
    try{ _msgsUnsub(); }catch(_){}
    _msgsUnsub = null;
  }
}

function startMessagesListener(){
  stopMessagesListener();
  const box = el('chat-messages');
  if(box) box.innerHTML = '';

  const msgsRef = collection(_db, 'conversations', _uid, 'messages');
  const q = query(msgsRef, orderBy('createdAt', 'asc'), limit(300));

  _msgsUnsub = onSnapshot(q, (snap)=>{
    const box = el('chat-messages');
    if(!box) return;
    box.innerHTML = '';
    snap.forEach(docu=>{
      const m = docu.data() || {};
      box.appendChild(renderMessageRow(m));
    });

    // أثناء فتح صفحة المراسلة نُعلّم رسائل المطور كمقروءة (لإظهار ✓✓ لديه)
    if(_isOpen){
      markIncomingMessagesReadByUser(snap);
    }

    scrollMessagesToBottom();
  }, (err)=>{
    console.error('messages snapshot error', err);
  });
}

async function sendMessage(){
  const input = el('chat-input');
  if(!input) return;
  const text = input.value || '';
  const clean = text.replace(/\r/g,'').trim();
  if(!clean) return;

  input.value = '';
  const sendBtn = el('chat-send');
  if(sendBtn) sendBtn.disabled = true;

  try{
    const convRef = doc(_db, 'conversations', _uid);
    const msgsRef = collection(_db, 'conversations', _uid, 'messages');

    await addDoc(msgsRef, {
      sender: 'user',
      text: clean,
      createdAt: serverTimestamp(),
      // Read receipts
      readByUser: true,
      readByDeveloper: false
    });

    await setDoc(convRef, {
      userId: _uid,
      username: _getUsername ? (_getUsername() || 'مستخدم') : 'مستخدم',
      lastMessage: clean,
      lastMessageAt: serverTimestamp(),
      unreadByDeveloper: true,
      unreadByUser: false
    }, { merge: true });

    scrollMessagesToBottom();
  } catch(e){
    console.error(e);
    if(_toast) _toast('تعذر إرسال الرسالة', 'error');
  } finally {
    if(sendBtn) sendBtn.disabled = false;
  }
}

function wireUI(){
  // زر الفقاعة
  el('chat-float-bubble')?.addEventListener('click', (e)=>{
    e.preventDefault();
    openChatPage();
  });

  // رجوع من صفحة المراسلة
  el('chat-back')?.addEventListener('click', (e)=>{
    e.preventDefault();
    closeChatPage();
  });

  // إرسال
  el('chat-send')?.addEventListener('click', (e)=>{
    e.preventDefault();
    sendMessage();
  });

  el('chat-input')?.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      sendMessage();
    }
  });

  // اعتراض عنصر القائمة "راسل المطور" لمنع فتح المودال القديم
  const nav = el('nav-contact');
  if(nav){
    nav.addEventListener('click', (e)=>{
      // نمنع أي مستمع سابق في main.js (الذي يفتح modal قديم)
      e.preventDefault();
      e.stopImmediatePropagation();
      // إغلاق القائمة الجانبية إن كانت مفتوحة
      document.getElementById('side-menu')?.classList.remove('open');
      document.getElementById('side-menu-overlay')?.classList.remove('open');
      openChatPage();
    }, true); // capture
  }
}

function startConversationListener(){
  if(_convUnsub){
    try{ _convUnsub(); }catch(_){}
    _convUnsub = null;
  }

  const convRef = doc(_db, 'conversations', _uid);
  let lastUnread = false;
  _convUnsub = onSnapshot(convRef, (snap)=>{
    if(!snap.exists()){
      showBubble(false, false);
      lastUnread = false;
      return;
    }
    const data = snap.data() || {};
    const unread = !!data.unreadByUser;
    // الفقاعة تظهر فقط عندما الصفحة ليست مفتوحة
    if(!_isOpen && unread){
      showBubble(true, true);

      // ✅ صوت رسالة المطور (مرة واحدة عند ظهورها)
      if(!lastUnread && window.playSound){
        try{ window.playSound('dev_message'); }catch(_){ }
      }
    } else {
      showBubble(false, false);
    }

    lastUnread = unread;
  }, (err)=>{
    console.error('conversation snapshot error', err);
  });
}

export async function initMessaging({ db, uid, getUsername, toast }){
  if(_inited) return;
  _inited = true;

  _db = db;
  _uid = uid;
  _getUsername = getUsername;
  _toast = toast;

  // إذا لم تكن عناصر الواجهة موجودة نتوقف بأمان
  if(!el('chat-page') || !el('chat-float-bubble')) return;

  wireUI();
  await ensureConversationDoc();
  startConversationListener();
}

export function openMessagingPage(){
  openChatPage();
}

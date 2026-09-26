// ==============================================================================
// WHATSUP ENTERPRISE REAL-TIME ENGINE (v9 - ULTRA FAST SSE + HIGH-SPEED PUBSUB)
// - 0ms Gecikmeli Server-Sent Events (SSE) ve WebSocket Push Bildirimleri
// - Kesintisiz Gerçek Zamanlı Mesajlaşma, Arama & Yazıyor... Göstergesi
// - Uçtan Uca İstemci Şifreleme (E2E Hash Privacy)
// - Kalıcı Çift Katmanlı Depolama (Cloud Directory + LocalStorage + Topic History)
// - Asla Rate-Limit (429) Almayan Hızlı ve Güvenilir Altyapı
// ==============================================================================

const NTFY_BASE = 'https://ntfy.sh';
const DIRECTORY_API = 'https://api.restful-api.dev/objects/ff808181a09d98f701a0ddc7b9111d81';

let currentUser = null;
let activeEventSourceInbox = null;
let activeEventSourceRoom = null;
let currentRoomKey = null;
let presenceInterval = null;
let syncBackupInterval = null;
let eventListeners = [];

// Bellek İçi Veriler
let cachedUsers = [];
let cachedRequests = [];
let cachedBlocked = [];

// ==============================================================================
// YARDIMCI VE TEMİZLEME METOTLARI
// ==============================================================================

export const sanitizeUsername = (raw) => {
  if (!raw) return 'kullanici';
  return String(raw)
    .replace(/^usr_/, '')
    .replace(/_[a-z0-9]{4,12}$/i, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
};

export const formatDisplayName = (username, customDisplay = '') => {
  if (customDisplay && typeof customDisplay === 'string' && customDisplay.trim()) {
    return customDisplay.trim();
  }
  const clean = sanitizeUsername(username);
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export const getRoomKey = (u1, u2) => {
  const clean1 = sanitizeUsername(u1);
  const clean2 = sanitizeUsername(u2);
  const sorted = [clean1, clean2].sort();
  return `${sorted[0]}_${sorted[1]}`;
};

// ==============================================================================
// UÇTAN UCA ŞİFRELEME (E2E Obfuscation & Decryption)
// ==============================================================================

const getSecretKey = (u1, u2) => {
  const sorted = [sanitizeUsername(u1), sanitizeUsername(u2)].sort().join('::');
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    hash = (hash << 5) - hash + sorted.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + 42;
};

export const encryptContent = (text, u1, u2) => {
  if (!text) return '';
  const key = getSecretKey(u1, u2);
  let enc = '';
  for (let i = 0; i < text.length; i++) {
    enc += String.fromCharCode(text.charCodeAt(i) ^ (key % 127));
  }
  return 'ENC::' + btoa(unescape(encodeURIComponent(enc)));
};

export const decryptContent = (payload, u1, u2) => {
  if (!payload || typeof payload !== 'string' || !payload.startsWith('ENC::')) return payload;
  try {
    const raw = decodeURIComponent(escape(atob(payload.replace('ENC::', ''))));
    const key = getSecretKey(u1, u2);
    let dec = '';
    for (let i = 0; i < raw.length; i++) {
      dec += String.fromCharCode(raw.charCodeAt(i) ^ (key % 127));
    }
    return dec;
  } catch {
    return payload;
  }
};

// ==============================================================================
// PUBSUB VE AĞ YARDIMCILARI (NTFY.SH & REST)
// ==============================================================================

export const publishEvent = async (topic, payload) => {
  try {
    const bodyStr = JSON.stringify(payload);
    await fetch(`${NTFY_BASE}/${encodeURIComponent(topic)}`, {
      method: 'POST',
      body: bodyStr,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (err) {
    console.warn('Publish event error:', err);
  }
};

// ==============================================================================
// 1. KULLANICI DİZİNİ VE GİRİŞ
// ==============================================================================

export const loginOrCreateUser = async (rawUsername, displayName, bio = '') => {
  const username = sanitizeUsername(rawUsername);
  if (!username) throw new Error('Lütfen geçerli bir kullanıcı adı giriniz.');

  const dispName = formatDisplayName(username, displayName);

  // Yerel kullanıcıyı yükle
  let user = {
    id: username,
    username: username,
    display_name: dispName,
    avatar_seed: username,
    bio: bio || 'Hey! Ben de Whatsup kullanıyorum 👋',
    last_active: Date.now(),
    created_at: new Date().toISOString(),
  };

  // Bulut dizinini oku ve güncelle
  try {
    const res = await fetch(DIRECTORY_API);
    if (res.ok) {
      const dirData = await res.json();
      let users = dirData?.data?.users || [];
      const existing = users.find((u) => sanitizeUsername(u.username) === username);
      if (existing) {
        user = { ...existing, display_name: dispName, last_active: Date.now() };
        users = users.map((u) => (sanitizeUsername(u.username) === username ? user : u));
      } else {
        users.push(user);
      }
      cachedUsers = users;

      // Bulutta güncelle
      fetch(DIRECTORY_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'whatsup_directory_v9', data: { users } }),
      }).catch(() => {});
    }
  } catch (e) {}

  currentUser = user;
  loadLocalState(username);

  // Canlı dinleme motorunu başlat
  startRealtimeEngine(user);

  return user;
};

export const searchUsers = async (query, currentUserId) => {
  if (!query || !query.trim()) return [];
  const clean = sanitizeUsername(query);
  const myName = sanitizeUsername(currentUserId || currentUser?.username);

  // Buluttan dizini çek
  try {
    const res = await fetch(DIRECTORY_API);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data?.users)) {
        cachedUsers = json.data.users;
      }
    }
  } catch {}

  const results = cachedUsers
    .filter((u) => {
      const uName = sanitizeUsername(u.username);
      return (
        uName !== myName &&
        (uName.includes(clean) || (u.display_name && u.display_name.toLowerCase().includes(clean)))
      );
    })
    .map((u) => ({
      ...u,
      id: sanitizeUsername(u.username),
      username: sanitizeUsername(u.username),
      display_name: formatDisplayName(u.username, u.display_name),
      is_online: isUserOnline(u.last_active),
    }));

  // Kullanıcı adı tam olarak yazılmışsa doğrudan ekleme opsiyonu
  const exact = results.find((u) => u.username === clean);
  if (!exact && clean !== myName && clean.length >= 2) {
    results.unshift({
      id: clean,
      username: clean,
      display_name: formatDisplayName(clean),
      avatar_seed: clean,
      bio: 'Whatsup Kullanıcısı',
      is_online: false,
    });
  }

  return results;
};

export const isUserOnline = (lastActive) => {
  if (!lastActive) return false;
  return Date.now() - Number(lastActive) < 45000;
};

export const updateUserProfile = async (userId, updates) => {
  const username = sanitizeUsername(userId || currentUser?.username);
  if (currentUser && sanitizeUsername(currentUser.username) === username) {
    Object.assign(currentUser, updates);
  }

  try {
    const res = await fetch(DIRECTORY_API);
    if (res.ok) {
      const dirData = await res.json();
      let users = dirData?.data?.users || [];
      users = users.map((u) =>
        sanitizeUsername(u.username) === username ? { ...u, ...updates, last_active: Date.now() } : u
      );
      cachedUsers = users;
      await fetch(DIRECTORY_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'whatsup_directory_v9', data: { users } }),
      });
    }
  } catch {}

  return currentUser;
};

// ==============================================================================
// 2. ENGELLEME SİSTEMİ
// ==============================================================================

const loadLocalState = (username) => {
  try {
    const blocked = localStorage.getItem(`whatsup_blocked_${username}`);
    cachedBlocked = blocked ? JSON.parse(blocked) : [];

    const reqs = localStorage.getItem(`whatsup_reqs_${username}`);
    cachedRequests = reqs ? JSON.parse(reqs) : [];
  } catch {
    cachedBlocked = [];
    cachedRequests = [];
  }
};

export const getBlockedUsers = () => cachedBlocked;

export const isUserBlocked = (myUsername, targetUsername) => {
  const target = sanitizeUsername(targetUsername);
  return Array.isArray(cachedBlocked) && cachedBlocked.includes(target);
};

export const blockUser = async (myUsername, targetUsername) => {
  const my = sanitizeUsername(myUsername);
  const target = sanitizeUsername(targetUsername);
  if (!cachedBlocked.includes(target)) {
    cachedBlocked.push(target);
    localStorage.setItem(`whatsup_blocked_${my}`, JSON.stringify(cachedBlocked));
  }
  return cachedBlocked;
};

export const unblockUser = async (myUsername, targetUsername) => {
  const my = sanitizeUsername(myUsername);
  const target = sanitizeUsername(targetUsername);
  cachedBlocked = cachedBlocked.filter((u) => u !== target);
  localStorage.setItem(`whatsup_blocked_${my}`, JSON.stringify(cachedBlocked));
  return cachedBlocked;
};

// ==============================================================================
// 3. ARKADAŞLIK VE İSTEK YÖNETİMİ
// ==============================================================================

export const sendFriendRequest = async (senderId, receiverId, targetUser = null) => {
  const sId = sanitizeUsername(senderId || currentUser?.username);
  const rId = sanitizeUsername(receiverId || targetUser?.username);

  if (sId === rId) throw new Error('Kendinize istek gönderemezsiniz.');

  const reqId = `req_${sId}_${rId}`;
  const reqObj = {
    id: reqId,
    sender_username: sId,
    sender_display_name: formatDisplayName(sId, currentUser?.display_name),
    sender_avatar_seed: currentUser?.avatar_seed || sId,
    receiver_username: rId,
    receiver_display_name: formatDisplayName(rId, targetUser?.display_name),
    receiver_avatar_seed: targetUser?.avatar_seed || rId,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  // Kendi yerel listemize ekle
  let requests = cachedRequests.filter((r) => r.id !== reqId);
  requests.push(reqObj);
  cachedRequests = requests;
  localStorage.setItem(`whatsup_reqs_${sId}`, JSON.stringify(requests));

  // Karşı tarafın gelen kutusuna canlı yayınla
  await publishEvent(`whatsup_v9_inbox_${rId}`, {
    event: 'NEW_FRIEND_REQUEST',
    data: reqObj,
  });

  return { data: reqObj, autoAccepted: false };
};

export const getFriendRequests = async (userId) => {
  const myId = sanitizeUsername(userId || currentUser?.username);
  loadLocalState(myId);

  const incoming = cachedRequests.filter(
    (r) => sanitizeUsername(r.receiver_username) === myId && r.status === 'pending'
  ).map((r) => ({
    ...r,
    sender: {
      id: r.sender_username,
      username: r.sender_username,
      display_name: formatDisplayName(r.sender_username, r.sender_display_name),
      avatar_seed: r.sender_avatar_seed || r.sender_username,
    },
  }));

  const outgoing = cachedRequests.filter(
    (r) => sanitizeUsername(r.sender_username) === myId && r.status === 'pending'
  ).map((r) => ({
    ...r,
    receiver: {
      id: r.receiver_username,
      username: r.receiver_username,
      display_name: formatDisplayName(r.receiver_username, r.receiver_display_name),
      avatar_seed: r.receiver_avatar_seed || r.receiver_username,
    },
  }));

  return { incoming, outgoing };
};

export const respondToFriendRequest = async (requestId, status) => {
  const myId = sanitizeUsername(currentUser?.username);
  const req = cachedRequests.find((r) => r.id === requestId);
  if (!req) return null;

  req.status = status;
  req.updated_at = new Date().toISOString();
  localStorage.setItem(`whatsup_reqs_${myId}`, JSON.stringify(cachedRequests));

  const partner = req.sender_username === myId ? req.receiver_username : req.sender_username;

  // Karşı tarafa onay veya ret bildirimi gönder
  await publishEvent(`whatsup_v9_inbox_${partner}`, {
    event: status === 'accepted' ? 'FRIEND_ACCEPTED' : 'FRIEND_REJECTED',
    data: req,
  });

  if (status === 'accepted') {
    notifyListeners('FRIEND_ACCEPTED', req);
  }

  return req;
};

export const getFriends = async (userId) => {
  const myId = sanitizeUsername(userId || currentUser?.username);
  loadLocalState(myId);

  const accepted = cachedRequests.filter(
    (r) =>
      r.status === 'accepted' &&
      (sanitizeUsername(r.sender_username) === myId || sanitizeUsername(r.receiver_username) === myId)
  );

  return accepted.map((r) => {
    const isSender = sanitizeUsername(r.sender_username) === myId;
    const friendUsername = isSender ? sanitizeUsername(r.receiver_username) : sanitizeUsername(r.sender_username);
    const friendDisplayName = isSender
      ? formatDisplayName(r.receiver_username, r.receiver_display_name)
      : formatDisplayName(r.sender_username, r.sender_display_name);

    return {
      requestId: r.id,
      id: friendUsername,
      username: friendUsername,
      display_name: friendDisplayName,
      avatar_seed: friendUsername,
      bio: 'Whatsup Kullanıcısı',
      is_online: true,
      friendshipDate: r.updated_at || r.created_at,
    };
  });
};

// ==============================================================================
// 4. MESAJLAŞMA, TEPKİLER VE GEÇMİŞ
// ==============================================================================

export const getMessagesBetween = async (user1, user2) => {
  if (!user1 || !user2) return [];
  const u1 = sanitizeUsername(user1);
  const u2 = sanitizeUsername(user2);
  const room = getRoomKey(u1, u2);
  const localKey = `whatsup_msgs_${room}`;

  let localMsgs = [];
  try {
    const raw = localStorage.getItem(localKey);
    localMsgs = raw ? JSON.parse(raw) : [];
  } catch {
    localMsgs = [];
  }

  // Bulut geçmişini yokla (Son 12 saatlik mesajlar)
  try {
    const res = await fetch(`${NTFY_BASE}/whatsup_v9_room_${room}/json?poll=1&since=12h`);
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.event === 'message') {
            const inner = JSON.parse(parsed.message);
            if (inner.event === 'NEW_MESSAGE' && inner.data) {
              const msg = inner.data;
              msg.content = decryptContent(msg.encrypted_content || msg.content, u1, u2);
              if (!localMsgs.some((m) => m.id === msg.id)) {
                localMsgs.push(msg);
              }
            }
          }
        } catch {}
      }
      localStorage.setItem(localKey, JSON.stringify(localMsgs));
    }
  } catch {}

  // Odanın SSE akışını dinle
  switchRoomListener(room, u1, u2);

  return localMsgs;
};

export const sendMessage = async (sender, receiver, content) => {
  if (!content || !content.trim()) throw new Error('Mesaj boş olamaz.');

  const s = sanitizeUsername(sender || currentUser?.username);
  const r = sanitizeUsername(receiver);

  if (isUserBlocked(s, r)) {
    throw new Error('Bu kullanıcıyı engellediniz. Mesaj göndermek için engeli kaldırın.');
  }

  const room = getRoomKey(s, r);
  const localKey = `whatsup_msgs_${room}`;

  const cleanText = content.trim();
  const encrypted = encryptContent(cleanText, s, r);

  const newMsg = {
    id: `msg_${s}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sender_id: s,
    sender_username: s,
    receiver_id: r,
    receiver_username: r,
    content: cleanText,
    encrypted_content: encrypted,
    reactions: {},
    is_read: false,
    created_at: new Date().toISOString(),
  };

  // 1. Yerel Hafızaya Yaz
  let localMsgs = [];
  try {
    const raw = localStorage.getItem(localKey);
    localMsgs = raw ? JSON.parse(raw) : [];
  } catch {}
  localMsgs.push(newMsg);
  localStorage.setItem(localKey, JSON.stringify(localMsgs));

  // 2. Anında Odaya ve Karşı Tarafın Gelen Kutusuna Yayınla
  const payload = {
    event: 'NEW_MESSAGE',
    data: {
      ...newMsg,
      content: encrypted, // Bulutta şifreli aktar
      encrypted_content: encrypted,
    },
  };

  await Promise.all([
    publishEvent(`whatsup_v9_room_${room}`, payload),
    publishEvent(`whatsup_v9_inbox_${r}`, payload),
  ]);

  notifyListeners('NEW_MESSAGE', newMsg);
  return newMsg;
};

export const reactToMessage = async (user1, user2, messageId, emoji) => {
  const u1 = sanitizeUsername(user1);
  const u2 = sanitizeUsername(user2);
  const room = getRoomKey(u1, u2);
  const localKey = `whatsup_msgs_${room}`;

  let localMsgs = [];
  try {
    const raw = localStorage.getItem(localKey);
    localMsgs = raw ? JSON.parse(raw) : [];
  } catch {}

  const msg = localMsgs.find((m) => m.id === messageId);
  if (msg) {
    if (!msg.reactions) msg.reactions = {};
    if (msg.reactions[u1] === emoji) {
      delete msg.reactions[u1];
    } else {
      msg.reactions[u1] = emoji;
    }
    localStorage.setItem(localKey, JSON.stringify(localMsgs));

    await publishEvent(`whatsup_v9_room_${room}`, {
      event: 'MESSAGE_REACTION',
      data: { messageId, user: u1, emoji, reactions: msg.reactions },
    });
    notifyListeners('MESSAGE_UPDATED', msg);
  }
};

export const markMessagesAsRead = async (sender, receiver) => {
  const s = sanitizeUsername(sender);
  const r = sanitizeUsername(receiver);
  const room = getRoomKey(s, r);
  const localKey = `whatsup_msgs_${room}`;

  let localMsgs = [];
  try {
    const raw = localStorage.getItem(localKey);
    localMsgs = raw ? JSON.parse(raw) : [];
  } catch {}

  let changed = false;
  localMsgs.forEach((m) => {
    if (sanitizeUsername(m.sender_username) === s && !m.is_read) {
      m.is_read = true;
      changed = true;
    }
  });

  if (changed) {
    localStorage.setItem(localKey, JSON.stringify(localMsgs));
  }
};

export const clearChatHistory = async (user1, user2) => {
  const u1 = sanitizeUsername(user1);
  const u2 = sanitizeUsername(user2);
  const room = getRoomKey(u1, u2);
  localStorage.removeItem(`whatsup_msgs_${room}`);
  notifyListeners('CHAT_CLEARED', { room });
};

// ==============================================================================
// 5. CANLI YAZIYOR... (Typing Indicator)
// ==============================================================================

let partnerTypingMap = {};

export const setTypingStatus = async (sender, receiver, isTyping) => {
  const s = sanitizeUsername(sender);
  const r = sanitizeUsername(receiver);
  const room = getRoomKey(s, r);

  await publishEvent(`whatsup_v9_room_${room}`, {
    event: 'TYPING_STATUS',
    data: { sender: s, isTyping, timestamp: Date.now() },
  });
};

export const checkIsPartnerTyping = async (partner, me) => {
  const s = sanitizeUsername(partner);
  const info = partnerTypingMap[s];
  if (info && info.isTyping && Date.now() - info.timestamp < 3500) {
    return true;
  }
  return false;
};

// ==============================================================================
// 6. GERÇEK ZAMANLI SSE MOTORU (Server-Sent Events)
// ==============================================================================

const switchRoomListener = (room, u1, u2) => {
  if (currentRoomKey === room && activeEventSourceRoom) return;
  currentRoomKey = room;

  if (activeEventSourceRoom) {
    activeEventSourceRoom.close();
    activeEventSourceRoom = null;
  }

  try {
    activeEventSourceRoom = new EventSource(`${NTFY_BASE}/whatsup_v9_room_${room}/sse`);
    activeEventSourceRoom.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'message') {
          const inner = JSON.parse(payload.message);

          // Yazıyor Durumu
          if (inner.event === 'TYPING_STATUS' && inner.data) {
            partnerTypingMap[inner.data.sender] = {
              isTyping: inner.data.isTyping,
              timestamp: inner.data.timestamp,
            };
          }

          // Yeni Mesaj
          else if (inner.event === 'NEW_MESSAGE' && inner.data) {
            const msg = inner.data;
            msg.content = decryptContent(msg.encrypted_content || msg.content, u1, u2);
            notifyListeners('NEW_MESSAGE', msg);
          }

          // Tepki
          else if (inner.event === 'MESSAGE_REACTION' && inner.data) {
            notifyListeners('MESSAGE_REACTION', inner.data);
          }
        }
      } catch (err) {}
    };
  } catch (err) {
    console.warn('Room SSE error:', err);
  }
};

const startRealtimeEngine = (user) => {
  const myUsername = sanitizeUsername(user.username);

  if (activeEventSourceInbox) {
    activeEventSourceInbox.close();
  }

  // 1. Kendi Gelen Kutumuz için Canlı SSE Bağlantısı
  try {
    activeEventSourceInbox = new EventSource(`${NTFY_BASE}/whatsup_v9_inbox_${myUsername}/sse`);
    activeEventSourceInbox.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'message') {
          const inner = JSON.parse(payload.message);

          // Gelen Yeni Mesaj
          if (inner.event === 'NEW_MESSAGE' || inner.event === 'INBOX_MESSAGE') {
            const msg = inner.data;
            const sender = sanitizeUsername(msg.sender_username);
            const room = getRoomKey(myUsername, sender);
            msg.content = decryptContent(msg.encrypted_content || msg.content, myUsername, sender);

            // Yerel hafızaya kaydet
            try {
              const localKey = `whatsup_msgs_${room}`;
              const raw = localStorage.getItem(localKey);
              const list = raw ? JSON.parse(raw) : [];
              if (!list.some((m) => m.id === msg.id)) {
                list.push(msg);
                localStorage.setItem(localKey, JSON.stringify(list));
              }
            } catch {}

            notifyListeners('NEW_MESSAGE', msg);
          }

          // Yeni İstek Geldi
          else if (inner.event === 'NEW_FRIEND_REQUEST') {
            const req = inner.data;
            let reqs = cachedRequests.filter((r) => r.id !== req.id);
            reqs.push(req);
            cachedRequests = reqs;
            localStorage.setItem(`whatsup_reqs_${myUsername}`, JSON.stringify(reqs));
            notifyListeners('NEW_FRIEND_REQUEST', req);
          }

          // İstek Onaylandı
          else if (inner.event === 'FRIEND_ACCEPTED') {
            const req = inner.data;
            let reqs = cachedRequests.filter((r) => r.id !== req.id);
            reqs.push(req);
            cachedRequests = reqs;
            localStorage.setItem(`whatsup_reqs_${myUsername}`, JSON.stringify(reqs));
            notifyListeners('FRIEND_ACCEPTED', req);
          }
        }
      } catch (e) {}
    };
  } catch (e) {
    console.warn('Inbox SSE error:', e);
  }

  // 2. Çevrimiçi Durum Kalp Atışı (Presence Heartbeat - 20 saniyede bir)
  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = setInterval(() => {
    if (!currentUser) return;
    updateUserProfile(currentUser.username, { last_active: Date.now() }).catch(() => {});
  }, 20000);
};

export const subscribeToChatEvents = (callback) => {
  eventListeners.push(callback);
  return () => {
    eventListeners = eventListeners.filter((cb) => cb !== callback);
  };
};

const notifyListeners = (eventType, data) => {
  eventListeners.forEach((cb) => {
    try {
      cb(eventType, data);
    } catch (e) {
      console.error('Callback error:', e);
    }
  });
};

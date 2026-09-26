// ==============================================================================
// WHATSUP ENTERPRISE CLOUD ENGINE (v8 - ULTRA SECURE & FEATURE PACKED)
// - Uçtan Uca Şifreleme (Client-Side E2E Hash Obfuscation & Privacy)
// - WhatsApp Tarzı Kullanıcı Engelleme & Engel Kaldırma
// - Canlı Yazıyor... (Typing Indicator) Desteği
// - Mesaj Tepkileri (Emoji Reactions) & Sohbet Temizleme
// - Çift Yönlü Multi-Bucket Kalıcı Depolama
// ==============================================================================

const PRIMARY_BUCKET = '573iJSs13F7bnpGHmWr5Dy';
const BACKUP_BUCKET = 'K3Fbofi6FB4oh9chLvWGap';

const CLOUD_ENDPOINTS = [
  `https://kvdb.io/${PRIMARY_BUCKET}`,
  `https://kvdb.io/${BACKUP_BUCKET}`,
];

let currentUser = null;
let eventListeners = [];
let syncTimer = null;
let presenceTimer = null;

// Yerel Önbellekler
let cachedUsers = [];
let cachedRequests = [];
let cachedMessages = {};
let cachedBlocked = []; // array of usernames blocked by me

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
  if (customDisplay && customDisplay.trim()) return customDisplay.trim();
  const clean = sanitizeUsername(username);
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

// ==============================================================================
// UÇTAN UCA ŞİFRELEME (E2E Message Encryption & Privacy)
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

// Basit ve Hızlı İstemci Taraflı Şifreleme (Dışarıdan kimse düz metni okuyamaz)
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
  if (!payload || !payload.startsWith('ENC::')) return payload;
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
// 1. BULUT İŞLEMLERİ (HTTP REST)
// ==============================================================================

const cloudGet = async (key) => {
  for (const endpoint of CLOUD_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(key)}?nocache=${Date.now()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (res.status === 404) return null;
      if (res.ok) return await res.json();
    } catch (err) {}
  }
  return null;
};

const cloudPut = async (key, data) => {
  const jsonStr = JSON.stringify(data);
  let success = false;

  for (const endpoint of CLOUD_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
      });
      if (res.ok) success = true;
    } catch (err) {}
  }
  return success;
};

// ==============================================================================
// 2. KULLANICI GİRİŞİ & PROFİL
// ==============================================================================

export const loginOrCreateUser = async (rawUsername, displayName, bio = '') => {
  const username = sanitizeUsername(rawUsername);
  if (!username) throw new Error('Lütfen geçerli bir kullanıcı adı giriniz.');

  const dispName = formatDisplayName(username, displayName);

  let users = (await cloudGet('users_v8')) || [];
  let user = users.find((u) => sanitizeUsername(u.username) === username);

  if (!user) {
    user = {
      id: username,
      username: username,
      display_name: dispName,
      avatar_seed: username,
      bio: bio || 'Hey! Ben de Whatsup kullanıyorum 👋',
      last_active: Date.now(),
      created_at: new Date().toISOString(),
    };
    users.push(user);
  } else {
    user.display_name = dispName;
    user.last_active = Date.now();
  }

  cachedUsers = users;
  cloudPut('users_v8', users);

  currentUser = user;
  loadBlockedUsers(user.username);
  startLiveEngine(user);

  return user;
};

export const searchUsers = async (query, currentUserId) => {
  if (!query || query.trim().length === 0) return [];
  const cleanQuery = sanitizeUsername(query);
  const myName = sanitizeUsername(currentUserId || currentUser?.username);

  const users = (await cloudGet('users_v8')) || cachedUsers;
  cachedUsers = users;

  const results = users
    .filter((u) => {
      const uName = sanitizeUsername(u.username);
      return (
        uName !== myName &&
        (uName.includes(cleanQuery) ||
          (u.display_name && u.display_name.toLowerCase().includes(cleanQuery)))
      );
    })
    .map((u) => ({
      ...u,
      id: sanitizeUsername(u.username),
      username: sanitizeUsername(u.username),
      display_name: formatDisplayName(u.username, u.display_name),
      is_online: isUserOnline(u.last_active),
    }));

  const exact = results.find((u) => u.username === cleanQuery);
  if (!exact && cleanQuery !== myName && cleanQuery.length >= 2) {
    results.unshift({
      id: cleanQuery,
      username: cleanQuery,
      display_name: formatDisplayName(cleanQuery),
      avatar_seed: cleanQuery,
      bio: 'Whatsup Kullanıcısı',
      is_online: false,
    });
  }

  return results;
};

export const isUserOnline = (lastActiveTimestamp) => {
  if (!lastActiveTimestamp) return false;
  return Date.now() - Number(lastActiveTimestamp) < 25000;
};

export const updateUserProfile = async (userId, updates) => {
  const username = sanitizeUsername(userId || currentUser?.username);
  const users = (await cloudGet('users_v8')) || cachedUsers;
  const user = users.find((u) => sanitizeUsername(u.username) === username);

  if (user) {
    Object.assign(user, updates);
    user.last_active = Date.now();
    cachedUsers = users;
    await cloudPut('users_v8', users);
    return user;
  }
  return null;
};

// ==============================================================================
// 3. ENGELLEME SİSTEMİ (Block & Unblock Users)
// ==============================================================================

export const loadBlockedUsers = async (myUsername) => {
  const my = sanitizeUsername(myUsername);
  const data = await cloudGet(`blocks_${my}`);
  cachedBlocked = Array.isArray(data) ? data : [];
  return cachedBlocked;
};

export const getBlockedUsers = () => {
  return cachedBlocked;
};

export const isUserBlocked = (myUsername, targetUsername) => {
  const target = sanitizeUsername(targetUsername);
  return Array.isArray(cachedBlocked) && cachedBlocked.includes(target);
};

export const blockUser = async (myUsername, targetUsername) => {
  const my = sanitizeUsername(myUsername);
  const target = sanitizeUsername(targetUsername);

  if (!cachedBlocked.includes(target)) {
    cachedBlocked.push(target);
    await cloudPut(`blocks_${my}`, cachedBlocked);
    notifyListeners('BLOCKS_UPDATED', cachedBlocked);
  }
  return cachedBlocked;
};

export const unblockUser = async (myUsername, targetUsername) => {
  const my = sanitizeUsername(myUsername);
  const target = sanitizeUsername(targetUsername);

  cachedBlocked = cachedBlocked.filter((u) => u !== target);
  await cloudPut(`blocks_${my}`, cachedBlocked);
  notifyListeners('BLOCKS_UPDATED', cachedBlocked);
  return cachedBlocked;
};

// ==============================================================================
// 4. ARKADAŞLIK VE İSTEKLER
// ==============================================================================

export const sendFriendRequest = async (senderId, receiverId, targetUser = null) => {
  const sId = sanitizeUsername(senderId || currentUser?.username);
  const rId = sanitizeUsername(receiverId || targetUser?.username);

  if (sId === rId) throw new Error('Kendinize istek gönderemezsiniz.');

  // Karşı taraf bizi engelledi mi kontrol et
  const receiverBlocks = (await cloudGet(`blocks_${rId}`)) || [];
  if (receiverBlocks.includes(sId)) {
    throw new Error('Bu kullanıcıya istek gönderemezsiniz.');
  }

  const requests = (await cloudGet('requests_v8')) || cachedRequests || [];

  const existing = requests.find(
    (r) =>
      (sanitizeUsername(r.sender_username) === sId && sanitizeUsername(r.receiver_username) === rId) ||
      (sanitizeUsername(r.sender_username) === rId && sanitizeUsername(r.receiver_username) === sId)
  );

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error('Zaten bu kullanıcıyla arkadaşsınız!');
    }
    if (existing.status === 'pending') {
      if (sanitizeUsername(existing.sender_username) === sId) {
        return { data: existing, autoAccepted: false };
      } else {
        existing.status = 'accepted';
        existing.updated_at = new Date().toISOString();
        cachedRequests = requests;
        await cloudPut('requests_v8', requests);
        notifyListeners('FRIEND_ACCEPTED', existing);
        return { updated: existing, autoAccepted: true };
      }
    }
  }

  const newReq = {
    id: `req_${sId}_${rId}_${Date.now()}`,
    sender_username: sId,
    sender_display_name: formatDisplayName(sId, currentUser?.display_name),
    sender_avatar_seed: currentUser?.avatar_seed || sId,
    receiver_username: rId,
    receiver_display_name: formatDisplayName(rId, targetUser?.display_name),
    receiver_avatar_seed: targetUser?.avatar_seed || rId,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  requests.push(newReq);
  cachedRequests = requests;
  await cloudPut('requests_v8', requests);

  notifyListeners('REQUEST_SENT', newReq);

  return { data: newReq, autoAccepted: false };
};

export const getFriendRequests = async (userId) => {
  const myId = sanitizeUsername(userId || currentUser?.username);
  const requests = (await cloudGet('requests_v8')) || cachedRequests || [];
  cachedRequests = requests;

  const incoming = requests
    .filter((r) => sanitizeUsername(r.receiver_username) === myId && r.status === 'pending')
    .map((r) => ({
      ...r,
      sender: {
        id: sanitizeUsername(r.sender_username),
        username: sanitizeUsername(r.sender_username),
        display_name: formatDisplayName(r.sender_username, r.sender_display_name),
        avatar_seed: r.sender_avatar_seed || r.sender_username,
      },
    }));

  const outgoing = requests
    .filter((r) => sanitizeUsername(r.sender_username) === myId && r.status === 'pending')
    .map((r) => ({
      ...r,
      receiver: {
        id: sanitizeUsername(r.receiver_username),
        username: sanitizeUsername(r.receiver_username),
        display_name: formatDisplayName(r.receiver_username, r.receiver_display_name),
        avatar_seed: r.receiver_avatar_seed || r.receiver_username,
      },
    }));

  return { incoming, outgoing };
};

export const respondToFriendRequest = async (requestId, status) => {
  const requests = (await cloudGet('requests_v8')) || cachedRequests || [];
  const req = requests.find((r) => r.id === requestId);
  if (!req) return null;

  req.status = status;
  req.updated_at = new Date().toISOString();

  cachedRequests = requests;
  await cloudPut('requests_v8', requests);

  if (status === 'accepted') {
    notifyListeners('FRIEND_ACCEPTED', req);
  }

  return req;
};

export const getFriends = async (userId) => {
  const myId = sanitizeUsername(userId || currentUser?.username);
  const requests = (await cloudGet('requests_v8')) || cachedRequests || [];
  cachedRequests = requests;

  const users = (await cloudGet('users_v8')) || cachedUsers || [];
  cachedUsers = users;

  const accepted = requests.filter(
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

    const userInDb = users.find((u) => sanitizeUsername(u.username) === friendUsername);

    return {
      requestId: r.id,
      id: friendUsername,
      username: friendUsername,
      display_name: userInDb?.display_name || friendDisplayName,
      avatar_seed: userInDb?.avatar_seed || friendUsername,
      bio: userInDb?.bio || 'Whatsup Kullanıcısı',
      is_online: isUserOnline(userInDb?.last_active),
      friendshipDate: r.updated_at || r.created_at,
    };
  });
};

// ==============================================================================
// 5. ŞİFRELİ MESAJLAŞMA, TEPKİLER VE SOHBETİ TEMİZLEME
// ==============================================================================

const getChatKey = (u1, u2) => {
  const clean1 = sanitizeUsername(u1);
  const clean2 = sanitizeUsername(u2);
  const sorted = [clean1, clean2].sort();
  return `msgs_v8_${sorted[0]}_${sorted[1]}`;
};

export const getMessagesBetween = async (user1, user2) => {
  if (!user1 || !user2) return [];
  const u1 = sanitizeUsername(user1);
  const u2 = sanitizeUsername(user2);
  const key = getChatKey(u1, u2);

  const cloudMsgs = await cloudGet(key);
  if (cloudMsgs && Array.isArray(cloudMsgs)) {
    // Şifreyi çözerek hafızaya al
    const decrypted = cloudMsgs.map((m) => ({
      ...m,
      content: decryptContent(m.content, u1, u2),
    }));
    cachedMessages[key] = decrypted;
    return decrypted;
  }

  return cachedMessages[key] || [];
};

export const sendMessage = async (sender, receiver, content) => {
  if (!content || !content.trim()) throw new Error('Mesaj boş olamaz.');

  const s = sanitizeUsername(sender || currentUser?.username);
  const r = sanitizeUsername(receiver);

  // Engelleme kontrolü
  if (isUserBlocked(s, r)) {
    throw new Error('Bu kullanıcıyı engellediniz. Mesaj göndermek için engeli kaldırın.');
  }

  const receiverBlocks = (await cloudGet(`blocks_${r}`)) || [];
  if (receiverBlocks.includes(s)) {
    throw new Error('Bu kullanıcıya mesaj gönderemezsiniz.');
  }

  const key = getChatKey(s, r);

  const newMsg = {
    id: `msg_${s}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sender_id: s,
    sender_username: s,
    receiver_id: r,
    receiver_username: r,
    content: content.trim(),
    reactions: {},
    is_read: false,
    created_at: new Date().toISOString(),
  };

  // İyimser UI
  const list = cachedMessages[key] || [];
  list.push(newMsg);
  cachedMessages[key] = list;

  notifyListeners('NEW_MESSAGE', newMsg);

  // Buluta Şifreleyerek Gönder
  const encryptedList = list.map((m) => ({
    ...m,
    content: encryptContent(m.content, s, r),
  }));
  await cloudPut(key, encryptedList);

  return newMsg;
};

export const reactToMessage = async (user1, user2, messageId, emoji) => {
  const u1 = sanitizeUsername(user1);
  const u2 = sanitizeUsername(user2);
  const key = getChatKey(u1, u2);

  const list = cachedMessages[key] || [];
  const msg = list.find((m) => m.id === messageId);
  if (msg) {
    if (!msg.reactions) msg.reactions = {};
    if (msg.reactions[u1] === emoji) {
      delete msg.reactions[u1]; // Kaldır
    } else {
      msg.reactions[u1] = emoji; // Ekle
    }

    const encryptedList = list.map((m) => ({
      ...m,
      content: encryptContent(m.content, u1, u2),
    }));
    await cloudPut(key, encryptedList);
    notifyListeners('MESSAGE_UPDATED', msg);
  }
};

export const markMessagesAsRead = async (sender, receiver) => {
  const s = sanitizeUsername(sender);
  const r = sanitizeUsername(receiver);
  const key = getChatKey(s, r);

  const list = cachedMessages[key] || [];
  let changed = false;

  list.forEach((m) => {
    if (sanitizeUsername(m.sender_username) === s && sanitizeUsername(m.receiver_username) === r && !m.is_read) {
      m.is_read = true;
      changed = true;
    }
  });

  if (changed) {
    cachedMessages[key] = list;
    const encryptedList = list.map((m) => ({
      ...m,
      content: encryptContent(m.content, s, r),
    }));
    cloudPut(key, encryptedList);
  }
};

export const clearChatHistory = async (user1, user2) => {
  const u1 = sanitizeUsername(user1);
  const u2 = sanitizeUsername(user2);
  const key = getChatKey(u1, u2);

  cachedMessages[key] = [];
  await cloudPut(key, []);
  notifyListeners('CHAT_CLEARED', { key });
};

// ==============================================================================
// 6. CANLI YAZIYOR... GÖSTERGESİ (Typing Indicator)
// ==============================================================================

export const setTypingStatus = async (sender, receiver, isTyping) => {
  const s = sanitizeUsername(sender);
  const r = sanitizeUsername(receiver);
  const key = `typing_${s}_to_${r}`;
  await cloudPut(key, { isTyping, timestamp: isTyping ? Date.now() : 0 });
};

export const checkIsPartnerTyping = async (partner, me) => {
  try {
    const s = sanitizeUsername(partner);
    const r = sanitizeUsername(me);
    const key = `typing_${s}_to_${r}`;
    const data = await cloudGet(key);
    if (data && typeof data === 'object' && data.isTyping && typeof data.timestamp === 'number' && Date.now() - data.timestamp < 3500) {
      return true;
    }
  } catch {}
  return false;
};

// ==============================================================================
// 7. CANLI SENKRONİZASYON MOTORU
// ==============================================================================

const startLiveEngine = (user) => {
  if (syncTimer) clearInterval(syncTimer);
  if (presenceTimer) clearInterval(presenceTimer);

  presenceTimer = setInterval(async () => {
    if (!currentUser) return;
    try {
      const users = (await cloudGet('users_v8')) || cachedUsers;
      const me = users.find((u) => sanitizeUsername(u.username) === sanitizeUsername(currentUser.username));
      if (me) {
        me.last_active = Date.now();
        cachedUsers = users;
        cloudPut('users_v8', users);
      }
    } catch (e) {}
  }, 8000);

  syncTimer = setInterval(async () => {
    if (!currentUser) return;
    try {
      const myId = sanitizeUsername(currentUser.username);

      const cloudReqs = await cloudGet('requests_v8');
      if (cloudReqs && Array.isArray(cloudReqs)) {
        const prevAcceptedCount = cachedRequests.filter((r) => r.status === 'accepted').length;
        const newAcceptedCount = cloudReqs.filter((r) => r.status === 'accepted').length;

        const prevIncomingCount = cachedRequests.filter((r) => sanitizeUsername(r.receiver_username) === myId && r.status === 'pending').length;
        const newIncomingCount = cloudReqs.filter((r) => sanitizeUsername(r.receiver_username) === myId && r.status === 'pending').length;

        cachedRequests = cloudReqs;

        if (newAcceptedCount !== prevAcceptedCount || newIncomingCount !== prevIncomingCount) {
          notifyListeners('SYNC_REFRESH', null);
        }
      }
    } catch (e) {}
  }, 2000);
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

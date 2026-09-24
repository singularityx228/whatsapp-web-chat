// ==============================================================================
// WHATSUP CLOUD & REALTIME ENGINE (v6 - ROCK SOLID)
// - Temiz Kullanıcı İsimleri (Asla çirkin 'usr_...' veya placeholder görünmez)
// - Gerçek Zamanlı Bulut Tabanlı Çevrimiçi Durumu (Son 25 saniye aktifliği)
// - Kesintisiz İstek ve Mesajlaşma Senkronizasyonu
// - Çoklu Yedekli Bulut Depolama (Multi-Bucket Cloud Sync)
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

// Yerel Önbellek
let cachedUsers = [];
let cachedRequests = [];
let cachedMessages = {}; // conversationKey -> array

// İsim Temizleme Yardımcısı (Çirkin id/önekleri temizler)
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
// 1. BULUT İŞLEMLERİ (HTTP REST KV)
// ==============================================================================

const cloudGet = async (key) => {
  for (const endpoint of CLOUD_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(key)}?nocache=${Date.now()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (res.status === 404) return null;
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      // Yedek uç noktaya geçer
    }
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
    } catch (err) {
      // Yedek uç noktaya geçer
    }
  }
  return success;
};

// ==============================================================================
// 2. KULLANICI GİRİŞİ VE PROFİL
// ==============================================================================

export const loginOrCreateUser = async (rawUsername, displayName, bio = '') => {
  const username = sanitizeUsername(rawUsername);
  if (!username) throw new Error('Lütfen geçerli bir kullanıcı adı giriniz.');

  const dispName = formatDisplayName(username, displayName);

  // Buluttan kullanıcıları çek
  let users = (await cloudGet('users_v6')) || [];
  let user = users.find((u) => sanitizeUsername(u.username) === username);

  if (!user) {
    user = {
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
  cloudPut('users_v6', users);

  currentUser = user;
  startLiveEngine(user);

  return user;
};

export const searchUsers = async (query, currentUserId) => {
  if (!query || query.trim().length === 0) return [];
  const cleanQuery = sanitizeUsername(query);
  const myName = sanitizeUsername(currentUserId || currentUser?.username);

  // Buluttan güncel listeyi al
  const users = (await cloudGet('users_v6')) || cachedUsers;
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
      username: sanitizeUsername(u.username),
      display_name: formatDisplayName(u.username, u.display_name),
      is_online: isUserOnline(u.last_active),
    }));

  // Eğer aranan isim listede yoksa, doğrudan istek atılabilecek aday kartı üret
  const exact = results.find((u) => u.username === cleanQuery);
  if (!exact && cleanQuery !== myName && cleanQuery.length >= 2) {
    results.unshift({
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
  return Date.now() - Number(lastActiveTimestamp) < 30000; // Son 30 saniye içinde aktifse çevrimiçi
};

export const updateUserProfile = async (userId, updates) => {
  const username = sanitizeUsername(userId || currentUser?.username);
  const users = (await cloudGet('users_v6')) || cachedUsers;
  const user = users.find((u) => sanitizeUsername(u.username) === username);

  if (user) {
    Object.assign(user, updates);
    user.last_active = Date.now();
    cachedUsers = users;
    await cloudPut('users_v6', users);
    return user;
  }
  return null;
};

// ==============================================================================
// 3. ARKADAŞLIK VE İSTEK SİSTEMİ
// ==============================================================================

export const sendFriendRequest = async (senderId, receiverId, targetUser = null) => {
  const sId = sanitizeUsername(senderId || currentUser?.username);
  const rId = sanitizeUsername(receiverId || targetUser?.username);

  if (sId === rId) throw new Error('Kendinize istek gönderemezsiniz.');

  const requests = (await cloudGet('requests_v6')) || cachedRequests || [];

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
        // Karşı taraf bize istek atmış, doğrudan kabul et
        existing.status = 'accepted';
        existing.updated_at = new Date().toISOString();
        cachedRequests = requests;
        await cloudPut('requests_v6', requests);
        notifyListeners('FRIEND_ACCEPTED', existing);
        return { updated: existing, autoAccepted: true };
      }
    }
  }

  // Yeni istek
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
  await cloudPut('requests_v6', requests);

  notifyListeners('REQUEST_SENT', newReq);

  return { data: newReq, autoAccepted: false };
};

export const getFriendRequests = async (userId) => {
  const myId = sanitizeUsername(userId || currentUser?.username);
  const requests = (await cloudGet('requests_v6')) || cachedRequests || [];
  cachedRequests = requests;

  const incoming = requests
    .filter((r) => sanitizeUsername(r.receiver_username) === myId && r.status === 'pending')
    .map((r) => ({
      ...r,
      id: r.id,
      sender: {
        username: sanitizeUsername(r.sender_username),
        display_name: formatDisplayName(r.sender_username, r.sender_display_name),
        avatar_seed: r.sender_avatar_seed || r.sender_username,
      },
    }));

  const outgoing = requests
    .filter((r) => sanitizeUsername(r.sender_username) === myId && r.status === 'pending')
    .map((r) => ({
      ...r,
      id: r.id,
      receiver: {
        username: sanitizeUsername(r.receiver_username),
        display_name: formatDisplayName(r.receiver_username, r.receiver_display_name),
        avatar_seed: r.receiver_avatar_seed || r.receiver_username,
      },
    }));

  return { incoming, outgoing };
};

export const respondToFriendRequest = async (requestId, status) => {
  const requests = (await cloudGet('requests_v6')) || cachedRequests || [];
  const req = requests.find((r) => r.id === requestId);
  if (!req) return null;

  req.status = status;
  req.updated_at = new Date().toISOString();

  cachedRequests = requests;
  await cloudPut('requests_v6', requests);

  if (status === 'accepted') {
    notifyListeners('FRIEND_ACCEPTED', req);
  }

  return req;
};

export const getFriends = async (userId) => {
  const myId = sanitizeUsername(userId || currentUser?.username);
  const requests = (await cloudGet('requests_v6')) || cachedRequests || [];
  cachedRequests = requests;

  const users = (await cloudGet('users_v6')) || cachedUsers || [];
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
// 4. MESAJLAŞMA & KOPYALAMA
// ==============================================================================

const getChatKey = (u1, u2) => {
  const clean1 = sanitizeUsername(u1);
  const clean2 = sanitizeUsername(u2);
  const sorted = [clean1, clean2].sort();
  return `msgs_v6_${sorted[0]}_${sorted[1]}`;
};

export const getMessagesBetween = async (user1, user2) => {
  const key = getChatKey(user1, user2);
  const cloudMsgs = await cloudGet(key);

  if (cloudMsgs && Array.isArray(cloudMsgs)) {
    cachedMessages[key] = cloudMsgs;
    return cloudMsgs;
  }

  return cachedMessages[key] || [];
};

export const sendMessage = async (sender, receiver, content) => {
  if (!content || !content.trim()) throw new Error('Mesaj boş olamaz.');

  const s = sanitizeUsername(sender || currentUser?.username);
  const r = sanitizeUsername(receiver);
  const key = getChatKey(s, r);

  const newMsg = {
    id: `msg_${s}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sender_id: s,
    sender_username: s,
    receiver_id: r,
    receiver_username: r,
    content: content.trim(),
    is_read: false,
    created_at: new Date().toISOString(),
  };

  // İyimser olarak ekle ve UI'a anında bildir
  const list = cachedMessages[key] || [];
  list.push(newMsg);
  cachedMessages[key] = list;

  notifyListeners('NEW_MESSAGE', newMsg);

  // Buluta kaydet
  cloudPut(key, list);

  return newMsg;
};

export const markMessagesAsRead = async (sender, receiver) => {
  const s = sanitizeUsername(sender);
  const r = sanitizeUsername(receiver);
  const key = getChatKey(s, r);

  const list = cachedMessages[key] || [];
  let changed = false;

  list.forEach((m) => {
    if (m.sender_username === s && m.receiver_username === r && !m.is_read) {
      m.is_read = true;
      changed = true;
    }
  });

  if (changed) {
    cachedMessages[key] = list;
    cloudPut(key, list);
  }
};

// ==============================================================================
// 5. CANLI DÖNGÜ VE SENKRONİZASYON (Her 2.5 Saniyede Bir Bulut Yoklama)
// ==============================================================================

const startLiveEngine = (user) => {
  if (syncTimer) clearInterval(syncTimer);
  if (presenceTimer) clearInterval(presenceTimer);

  // 1. Canlı Varlık Kalp Atışı (Her 10 saniyede last_active güncelle)
  presenceTimer = setInterval(async () => {
    if (!currentUser) return;
    try {
      const users = (await cloudGet('users_v6')) || cachedUsers;
      const me = users.find((u) => sanitizeUsername(u.username) === sanitizeUsername(currentUser.username));
      if (me) {
        me.last_active = Date.now();
        cachedUsers = users;
        cloudPut('users_v6', users);
      }
    } catch (e) {}
  }, 10000);

  // 2. Canlı Senkronizasyon (Her 2.5 saniyede bir yeni istek & kabul kontrolü)
  syncTimer = setInterval(async () => {
    if (!currentUser) return;
    try {
      const myId = sanitizeUsername(currentUser.username);

      // İstekleri kontrol et
      const cloudReqs = await cloudGet('requests_v6');
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
  }, 2500);
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

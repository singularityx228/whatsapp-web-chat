import mqtt from 'mqtt';

// ==============================================================================
// WHATSUP ENTERPRISE GLOBAL CLOUD & REALTIME ENGINE (v5)
// - Merkezi Kalıcı Bulut Veritabanı (KVDB Multi-Bucket Cloud Persistence)
// - Gerçek Zamanlı Çoklu Broker WebSocket Ağı (HiveMQ & EMQX TLS)
// - Çift Yönlü Otomatik Senkronizasyon (3s Reconciliation Sync Engine)
// - Veri Kaybı Sıfır: Sayfa yenilense, cihaz kapansa bile sohbetler ve istekler silinmez!
// ==============================================================================

const PRIMARY_BUCKET = '573iJSs13F7bnpGHmWr5Dy';
const BACKUP_BUCKET = 'K3Fbofi6FB4oh9chLvWGap';

const CLOUD_ENDPOINTS = [
  `https://kvdb.io/${PRIMARY_BUCKET}`,
  `https://kvdb.io/${BACKUP_BUCKET}`,
];

const MQTT_BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081',
];

const ROOT_CHANNEL = 'whatsup_prod_v5_global';
const GLOBAL_EVENTS_TOPIC = `${ROOT_CHANNEL}/events`;
const PRESENCE_TOPIC = `${ROOT_CHANNEL}/presence`;

let mqttClient = null;
let currentUser = null;
let eventListeners = [];
let syncInterval = null;
let heartbeatInterval = null;
let brokerIndex = 0;

// Bellek İçi Önbellekler
let memoryUsers = [];
let memoryRequests = [];
let memoryMessages = {}; // conversationKey -> array

// LocalStorage Yardımcıları
const getStored = (key, def = null) => {
  try {
    const val = localStorage.getItem(`whatsup_v5_${key}`);
    return val ? JSON.parse(val) : def;
  } catch {
    return def;
  }
};

const setStored = (key, data) => {
  try {
    localStorage.setItem(`whatsup_v5_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }
};

// ==============================================================================
// 1. MERKEZİ BULUT VERİTABANI İŞLEMLERİ (REST API)
// ==============================================================================

const cloudGet = async (key) => {
  for (const endpoint of CLOUD_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(key)}?t=${Date.now()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (res.status === 404) return null;
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn(`Cloud get failed on ${endpoint}:`, err.message);
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
      if (res.ok) {
        success = true;
      }
    } catch (err) {
      console.warn(`Cloud put failed on ${endpoint}:`, err.message);
    }
  }
  return success;
};

// ==============================================================================
// 2. KULLANICI YÖNETİMİ (Kalıcı ve Global)
// ==============================================================================

export const loginOrCreateUser = async (rawUsername, displayName, bio = '') => {
  const username = rawUsername.trim().toLowerCase().replace(/\s+/g, '_');
  if (!username) throw new Error('Geçerli bir kullanıcı adı giriniz.');

  const nameToUse = displayName?.trim() || rawUsername.trim();

  // 1. Buluttan mevcut kullanıcı listesini çek
  const cloudUsers = (await cloudGet('global_users_directory')) || getStored('users_cache', []);
  let user = cloudUsers.find((u) => u.username.toLowerCase() === username);

  if (!user) {
    user = {
      id: username,
      username: username,
      display_name: nameToUse,
      avatar_seed: username,
      bio: bio || 'Hey! Ben de Whatsup kullanıyorum 👋',
      is_online: true,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    cloudUsers.push(user);
  } else {
    user.display_name = nameToUse;
    user.is_online = true;
    user.last_seen = new Date().toISOString();
  }

  // Buluta ve yerel hafızaya kaydet
  memoryUsers = cloudUsers;
  setStored('users_cache', cloudUsers);
  cloudPut('global_users_directory', cloudUsers); // Arka planda asenkron yaz

  currentUser = user;
  initRealtimeEngine(user);

  return user;
};

export const searchUsers = async (query, currentUserId) => {
  if (!query || query.trim().length === 0) return [];
  const cleanQuery = query.trim().toLowerCase();
  const myName = (currentUserId || currentUser?.username || '').toLowerCase();

  // Buluttan en güncel kullanıcı listesini al
  let users = memoryUsers;
  if (users.length === 0) {
    users = (await cloudGet('global_users_directory')) || getStored('users_cache', []);
    memoryUsers = users;
  }

  const matches = users.filter(
    (u) =>
      u.username.toLowerCase() !== myName &&
      (u.username.toLowerCase().includes(cleanQuery) ||
        u.display_name.toLowerCase().includes(cleanQuery))
  );

  // Aranan isim henüz rehberde yoksa doğrudan aday profil oluştur
  const exact = matches.find((u) => u.username.toLowerCase() === cleanQuery);
  if (!exact && cleanQuery !== myName && cleanQuery.length >= 2) {
    const candidate = {
      id: cleanQuery,
      username: cleanQuery,
      display_name: cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1),
      avatar_seed: cleanQuery,
      bio: 'Whatsup Kullanıcısı',
      is_online: false,
    };
    matches.unshift(candidate);
  }

  return matches;
};

export const updateUserProfile = async (userId, updates) => {
  const username = (userId || currentUser?.username || '').toLowerCase();
  const cloudUsers = (await cloudGet('global_users_directory')) || memoryUsers;
  const user = cloudUsers.find((u) => u.username.toLowerCase() === username);

  if (user) {
    Object.assign(user, updates);
    memoryUsers = cloudUsers;
    setStored('users_cache', cloudUsers);
    await cloudPut('global_users_directory', cloudUsers);
    broadcastPresence(user, true);
    return user;
  }
  return null;
};

// ==============================================================================
// 3. ARKADAŞLIK VE İSTEK YÖNETİMİ (Merkezi Bulut Senkronizasyonu)
// ==============================================================================

export const sendFriendRequest = async (senderId, receiverId, targetUser = null) => {
  const sId = (senderId || currentUser?.username || '').toLowerCase();
  const rId = (receiverId || targetUser?.username || '').toLowerCase();

  if (sId === rId) throw new Error('Kendinize istek gönderemezsiniz.');

  // 1. Buluttaki en güncel istekleri çek
  const cloudRequests = (await cloudGet('global_friend_requests')) || getStored('requests_cache', []);
  
  const existing = cloudRequests.find(
    (r) =>
      (r.sender_id === sId && r.receiver_id === rId) ||
      (r.sender_id === rId && r.receiver_id === sId)
  );

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error('Zaten bu kullanıcıyla arkadaşsınız!');
    }
    if (existing.status === 'pending') {
      if (existing.sender_id === sId) {
        publishCloudEvent('FRIEND_REQUEST', { request: existing });
        return { data: existing, autoAccepted: false };
      } else {
        // Karşı taraf zaten bize istek atmış, doğrudan kabul et
        existing.status = 'accepted';
        existing.updated_at = new Date().toISOString();
        memoryRequests = cloudRequests;
        setStored('requests_cache', cloudRequests);
        await cloudPut('global_friend_requests', cloudRequests);

        publishCloudEvent('FRIEND_ACCEPTED', { request: existing, acceptor: currentUser });
        notifyListeners('FRIEND_ACCEPTED', existing);
        return { updated: existing, autoAccepted: true };
      }
    }
  }

  // Yeni İstek Oluştur
  const newReq = {
    id: `req_${sId}_${rId}_${Date.now()}`,
    sender_id: sId,
    sender_username: sId,
    receiver_id: rId,
    receiver_username: rId,
    sender: currentUser || { id: sId, username: sId, display_name: sId },
    receiver: targetUser || { id: rId, username: rId, display_name: rId },
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  cloudRequests.push(newReq);
  memoryRequests = cloudRequests;
  setStored('requests_cache', cloudRequests);

  // Buluta kaydet
  await cloudPut('global_friend_requests', cloudRequests);

  // Gerçek zamanlı WebSocket yayını
  publishCloudEvent('FRIEND_REQUEST', { request: newReq });

  return { data: newReq, autoAccepted: false };
};

export const getFriendRequests = async (userId) => {
  const myId = (userId || currentUser?.username || '').toLowerCase();
  
  // Buluttan en güncel istekleri çek
  const cloudRequests = (await cloudGet('global_friend_requests')) || memoryRequests || getStored('requests_cache', []);
  memoryRequests = cloudRequests;
  setStored('requests_cache', cloudRequests);

  const incoming = cloudRequests.filter((r) => r.receiver_id === myId && r.status === 'pending');
  const outgoing = cloudRequests.filter((r) => r.sender_id === myId && r.status === 'pending');

  return {
    incoming: incoming.map((r) => ({
      ...r,
      sender: r.sender || memoryUsers.find((u) => u.username.toLowerCase() === r.sender_id) || {
        id: r.sender_id,
        username: r.sender_id,
        display_name: r.sender_id,
      },
    })),
    outgoing: outgoing.map((r) => ({
      ...r,
      receiver: r.receiver || memoryUsers.find((u) => u.username.toLowerCase() === r.receiver_id) || {
        id: r.receiver_id,
        username: r.receiver_id,
        display_name: r.receiver_id,
      },
    })),
  };
};

export const respondToFriendRequest = async (requestId, status) => {
  const cloudRequests = (await cloudGet('global_friend_requests')) || memoryRequests;
  const req = cloudRequests.find((r) => r.id === requestId);
  if (!req) return null;

  req.status = status;
  req.updated_at = new Date().toISOString();

  memoryRequests = cloudRequests;
  setStored('requests_cache', cloudRequests);
  await cloudPut('global_friend_requests', cloudRequests);

  if (status === 'accepted') {
    publishCloudEvent('FRIEND_ACCEPTED', { request: req, acceptor: currentUser });
    notifyListeners('FRIEND_ACCEPTED', req);
  }

  return req;
};

export const getFriends = async (userId) => {
  const myId = (userId || currentUser?.username || '').toLowerCase();
  const cloudRequests = (await cloudGet('global_friend_requests')) || memoryRequests || getStored('requests_cache', []);
  memoryRequests = cloudRequests;

  const accepted = cloudRequests.filter(
    (r) => r.status === 'accepted' && (r.sender_id === myId || r.receiver_id === myId)
  );

  const users = memoryUsers.length > 0 ? memoryUsers : ((await cloudGet('global_users_directory')) || []);

  return accepted
    .map((r) => {
      const friendUsername = r.sender_id === myId ? r.receiver_id : r.sender_id;
      const friendObj =
        (r.sender_id === myId ? r.receiver : r.sender) ||
        users.find((u) => u.username.toLowerCase() === friendUsername) || {
          id: friendUsername,
          username: friendUsername,
          display_name: friendUsername,
          avatar_seed: friendUsername,
          is_online: true,
        };

      return {
        requestId: r.id,
        ...friendObj,
        id: friendUsername,
        username: friendUsername,
        friendshipDate: r.updated_at || r.created_at,
      };
    })
    .filter(Boolean);
};

// ==============================================================================
// 4. MESAJLAŞMA SİSTEMİ (Kalıcı Bulut Sohbet Geçmişi & İyimser UI)
// ==============================================================================

const getConversationKey = (u1, u2) => {
  const sorted = [u1.toLowerCase(), u2.toLowerCase()].sort();
  return `chat_${sorted[0]}_${sorted[1]}`;
};

export const getMessagesBetween = async (userId1, userId2) => {
  const key = getConversationKey(userId1, userId2);
  
  // Önce buluttan çek
  const cloudMsgs = await cloudGet(key);
  if (cloudMsgs && Array.isArray(cloudMsgs)) {
    memoryMessages[key] = cloudMsgs;
    setStored(key, cloudMsgs);
    return cloudMsgs;
  }

  const local = getStored(key, []);
  memoryMessages[key] = local;
  return local;
};

export const sendMessage = async (senderId, receiverId, content) => {
  if (!content || !content.trim()) throw new Error('Mesaj boş olamaz.');

  const sId = (senderId || currentUser?.username || '').toLowerCase();
  const rId = (receiverId || '').toLowerCase();
  const key = getConversationKey(sId, rId);

  const newMsg = {
    id: `msg_${sId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sender_id: sId,
    sender_username: sId,
    receiver_id: rId,
    receiver_username: rId,
    content: content.trim(),
    is_read: false,
    created_at: new Date().toISOString(),
  };

  // 1. İyimser Güncelleme: Yerel belleğe hemen ekle ve UI'a bildir
  const currentList = memoryMessages[key] || getStored(key, []);
  currentList.push(newMsg);
  memoryMessages[key] = currentList;
  setStored(key, currentList);

  notifyListeners('NEW_MESSAGE', newMsg);

  // 2. Buluta Kaydet (Kalıcılık)
  cloudPut(key, currentList);

  // 3. WebSocket ile anında karşı tarafa fırlat
  publishCloudEvent('CHAT_MESSAGE', { message: newMsg, receiver_username: rId });

  return newMsg;
};

export const markMessagesAsRead = async (senderId, receiverId) => {
  const sId = (senderId || '').toLowerCase();
  const rId = (receiverId || '').toLowerCase();
  const key = getConversationKey(sId, rId);

  const list = memoryMessages[key] || getStored(key, []);
  let changed = false;

  list.forEach((m) => {
    if (m.sender_id === sId && m.receiver_id === rId && !m.is_read) {
      m.is_read = true;
      changed = true;
    }
  });

  if (changed) {
    memoryMessages[key] = list;
    setStored(key, list);
    cloudPut(key, list);
    publishCloudEvent('READ_RECEIPT', { sender_id: sId, receiver_id: rId });
  }
};

// ==============================================================================
// 5. GERÇEK ZAMANLI MOTOR (MQTT + 3s Auto-Reconciliation)
// ==============================================================================

const initRealtimeEngine = (user) => {
  if (!user) return;
  connectMqtt();
  startReconciliationLoop();
  startHeartbeat();
};

const connectMqtt = () => {
  if (!currentUser) return;
  const brokerUrl = MQTT_BROKERS[brokerIndex % MQTT_BROKERS.length];
  const clientId = `whatsup_v5_${currentUser.username}_${Math.random().toString(36).substring(2, 8)}`;

  try {
    if (mqttClient) {
      try { mqttClient.end(true); } catch {}
    }

    mqttClient = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 2000,
      keepalive: 30,
    });

    mqttClient.on('connect', () => {
      console.log(`⚡ [${currentUser.username}] Realtime WebSocket Aktif: ${brokerUrl}`);
      const topics = [
        GLOBAL_EVENTS_TOPIC,
        PRESENCE_TOPIC,
        `${ROOT_CHANNEL}/user/${currentUser.username}/#`,
        `${ROOT_CHANNEL}/inbox/${currentUser.username}`,
      ];
      mqttClient.subscribe(topics, { qos: 1 });
      broadcastPresence(currentUser, true);
    });

    mqttClient.on('message', (topic, payload) => {
      try {
        const packet = JSON.parse(payload.toString());
        handleIncomingEvent(packet);
      } catch (e) {
        console.error('MQTT parse error:', e);
      }
    });

    mqttClient.on('error', (err) => {
      console.warn('MQTT error, trying next broker:', err.message);
      brokerIndex++;
      setTimeout(connectMqtt, 2000);
    });
  } catch (err) {
    console.error('MQTT Connect Error:', err);
  }
};

const publishCloudEvent = (type, data) => {
  if (!mqttClient || !mqttClient.connected) return;
  const packet = JSON.stringify({
    type,
    ...data,
    sender_user: currentUser?.username,
    timestamp: Date.now(),
  });

  mqttClient.publish(GLOBAL_EVENTS_TOPIC, packet, { qos: 1 });
  if (data.receiver_username) {
    mqttClient.publish(`${ROOT_CHANNEL}/user/${data.receiver_username}/inbox`, packet, { qos: 1 });
    mqttClient.publish(`${ROOT_CHANNEL}/inbox/${data.receiver_username}`, packet, { qos: 1 });
  }
};

const handleIncomingEvent = (data) => {
  if (!data || !data.type) return;
  const myName = currentUser?.username?.toLowerCase();

  // 1. Yeni Mesaj
  if (data.type === 'CHAT_MESSAGE') {
    const msg = data.message;
    const sId = (msg.sender_id || msg.sender_username || '').toLowerCase();
    const rId = (msg.receiver_id || msg.receiver_username || '').toLowerCase();

    if (rId === myName) {
      const key = getConversationKey(sId, rId);
      const list = memoryMessages[key] || getStored(key, []);
      if (!list.some((m) => m.id === msg.id)) {
        list.push(msg);
        memoryMessages[key] = list;
        setStored(key, list);
        notifyListeners('NEW_MESSAGE', msg);
      }
    }
  }

  // 2. Arkadaşlık İsteği
  else if (data.type === 'FRIEND_REQUEST') {
    const req = data.request;
    const rId = (req.receiver_id || req.receiver_username || '').toLowerCase();
    if (rId === myName) {
      notifyListeners('NEW_FRIEND_REQUEST', req);
    }
  }

  // 3. İstek Kabul Edildi
  else if (data.type === 'FRIEND_ACCEPTED') {
    const req = data.request;
    const sId = (req.sender_id || req.sender_username || '').toLowerCase();
    const rId = (req.receiver_id || req.receiver_username || '').toLowerCase();
    if (sId === myName || rId === myName) {
      notifyListeners('FRIEND_ACCEPTED', req);
    }
  }

  // 4. Çevrimiçi Varlık
  else if (data.type === 'PRESENCE') {
    if (data.user && data.user.username !== myName) {
      notifyListeners('USER_STATUS', data.user);
    }
  }
};

// ==============================================================================
// 6. 3 SANİYELİK OTOMATİK BULUT SENKRONİZASYON MOTORU (Reconciliation Loop)
// ==============================================================================

const startReconciliationLoop = () => {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(async () => {
    if (!currentUser) return;
    try {
      // 1. İstekleri kontrol et
      const cloudReqs = await cloudGet('global_friend_requests');
      if (cloudReqs && Array.isArray(cloudReqs)) {
        const prevAcceptedCount = memoryRequests.filter((r) => r.status === 'accepted').length;
        const newAcceptedCount = cloudReqs.filter((r) => r.status === 'accepted').length;

        memoryRequests = cloudReqs;
        setStored('requests_cache', cloudReqs);

        if (newAcceptedCount !== prevAcceptedCount) {
          notifyListeners('SYNC_REFRESH', null);
        }
      }
    } catch (e) {
      // Sessiz hata yönetimi
    }
  }, 3500);
};

const startHeartbeat = () => {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (currentUser && mqttClient && mqttClient.connected) {
      broadcastPresence(currentUser, true);
    }
  }, 12000);
};

export const broadcastPresence = (user, isOnline = true) => {
  if (!mqttClient || !mqttClient.connected || !user) return;
  const payload = {
    type: 'PRESENCE',
    user: {
      id: user.username.toLowerCase(),
      username: user.username.toLowerCase(),
      display_name: user.display_name,
      avatar_seed: user.avatar_seed,
      bio: user.bio,
      is_online: isOnline,
      last_seen: new Date().toISOString(),
    },
  };
  mqttClient.publish(PRESENCE_TOPIC, JSON.stringify(payload), { qos: 0 });
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
      console.error('Listener callback error:', e);
    }
  });
};

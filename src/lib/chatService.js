import mqtt from 'mqtt';

// ==============================================================================
// WHATSUP GLOBAL MULTI-CHANNEL CLOUD REALTIME ENGINE (v3)
// - Sabit & Deterministik Kullanıcı Kimliği (username tabanlı)
// - Çift Hatlı İletim: Hem Özel Inbox Hem Global Broadcast
// - Çoklu Broker Desteği & Otomatik Yeniden Bağlanma
// - Anlık Çevrimiçi Varlık (Presence) & Kalp Atışı (Heartbeat)
// ==============================================================================

const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081',
];

const ROOT_CHANNEL = 'whatsup_cloud_v3_network';
const GLOBAL_EVENTS_TOPIC = `${ROOT_CHANNEL}/global/events`;
const PRESENCE_TOPIC = `${ROOT_CHANNEL}/presence/heartbeat`;

let mqttClient = null;
let currentUser = null;
let eventListeners = [];
let heartbeatInterval = null;
let currentBrokerIndex = 0;

// LocalStorage Yardımcıları
const getStored = (key, def = null) => {
  try {
    const val = localStorage.getItem(`whatsup_v3_${key}`);
    return val ? JSON.parse(val) : def;
  } catch {
    return def;
  }
};

const setStored = (key, data) => {
  try {
    localStorage.setItem(`whatsup_v3_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn('Storage quota exceeded', e);
  }
};

// Global Kullanıcı Havuzu
let knownUsers = getStored('known_users', []);

const saveUserToDirectory = (user) => {
  if (!user || !user.username) return;
  const username = user.username.toLowerCase();
  const idx = knownUsers.findIndex((u) => u.username.toLowerCase() === username);
  const normalizedUser = {
    id: username,
    username: username,
    display_name: user.display_name || username,
    avatar_seed: user.avatar_seed || username,
    bio: user.bio || 'Hey! Ben de buradayım 👋',
    is_online: user.is_online ?? true,
    last_seen: user.last_seen || new Date().toISOString(),
  };

  if (idx >= 0) {
    knownUsers[idx] = { ...knownUsers[idx], ...normalizedUser };
  } else {
    knownUsers.push(normalizedUser);
  }
  setStored('known_users', knownUsers);
  return normalizedUser;
};

// ==========================================
// BULUT BAĞLANTISI (MQTT)
// ==========================================

export const initRealtimeCloud = (user) => {
  if (!user || !user.username) return;
  const username = user.username.toLowerCase();
  currentUser = { ...user, id: username, username };
  saveUserToDirectory(currentUser);

  if (mqttClient && mqttClient.connected) {
    setupSubscriptions(currentUser);
    broadcastPresence(currentUser, true);
    return;
  }

  connectToBroker();
};

const connectToBroker = () => {
  if (!currentUser) return;
  const brokerUrl = BROKERS[currentBrokerIndex % BROKERS.length];
  const clientId = `whatsup_${currentUser.username}_${Math.random().toString(36).substring(2, 9)}`;

  try {
    console.log(`📡 Bulut ağına bağlanılıyor (${brokerUrl})...`);
    mqttClient = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2500,
      keepalive: 30,
    });

    mqttClient.on('connect', () => {
      console.log('⚡ Whatsup Bulut Ağına Başarıyla Bağlanıldı!');
      setupSubscriptions(currentUser);
      broadcastPresence(currentUser, true);
      startHeartbeat();
    });

    mqttClient.on('message', (topic, payload) => {
      try {
        const raw = payload.toString();
        const packet = JSON.parse(raw);
        handleIncomingPacket(topic, packet);
      } catch (err) {
        console.error('MQTT paket parse hatası:', err);
      }
    });

    mqttClient.on('error', (err) => {
      console.warn('MQTT Bağlantı uyarısı:', err.message);
      tryNextBroker();
    });

    mqttClient.on('offline', () => {
      console.log('Bulut ağı çevrimdışı, yeniden bağlanılıyor...');
    });
  } catch (err) {
    console.error('MQTT Init Hatası:', err);
    tryNextBroker();
  }
};

const tryNextBroker = () => {
  if (currentBrokerIndex < BROKERS.length - 1) {
    currentBrokerIndex++;
    if (mqttClient) {
      try { mqttClient.end(true); } catch {}
    }
    setTimeout(connectToBroker, 1500);
  }
};

const setupSubscriptions = (user) => {
  if (!mqttClient || !user) return;
  const username = user.username.toLowerCase();

  const topics = [
    GLOBAL_EVENTS_TOPIC,
    PRESENCE_TOPIC,
    `${ROOT_CHANNEL}/user/${username}/#`,
    `${ROOT_CHANNEL}/inbox/${username}`,
  ];

  mqttClient.subscribe(topics, { qos: 1 }, (err) => {
    if (err) console.error('Subscription error:', err);
    else console.log(`✅ [${username}] kanallara abone olundu:`, topics);
  });
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
    type: 'PRESENCE_HEARTBEAT',
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

// ==========================================
// GELEN BULUT PAKETLERİNİ İŞLEME
// ==========================================

const handleIncomingPacket = (topic, data) => {
  if (!data || !data.type) return;
  const myName = currentUser?.username?.toLowerCase();

  // 1. Çevrimiçi Kalp Atışı (Presence)
  if (data.type === 'PRESENCE_HEARTBEAT') {
    const remoteUser = data.user;
    if (remoteUser && remoteUser.username !== myName) {
      saveUserToDirectory(remoteUser);
      notifyListeners('USER_STATUS_CHANGE', remoteUser);
    }
  }

  // 2. Arkadaşlık / Sohbet İsteği (Direct Inbox & Broadcast)
  if (data.type === 'FRIEND_REQUEST') {
    const req = data.request;
    const targetUsername = (req.receiver_id || req.receiver_username || '').toLowerCase();
    
    // Eğer istek BİZE geldiyse
    if (targetUsername === myName) {
      saveLocalRequest(req);
      if (req.sender) saveUserToDirectory(req.sender);
      notifyListeners('NEW_FRIEND_REQUEST', req);
    }
  }

  // 3. Arkadaşlık İsteği Kabul Edildi
  if (data.type === 'FRIEND_ACCEPT') {
    const req = data.request;
    const sender = (req.sender_id || req.sender_username || '').toLowerCase();
    const receiver = (req.receiver_id || req.receiver_username || '').toLowerCase();

    if (sender === myName || receiver === myName) {
      updateLocalRequestStatus(req.id, 'accepted');
      if (data.acceptor) saveUserToDirectory(data.acceptor);
      notifyListeners('FRIEND_ACCEPTED', req);
    }
  }

  // 4. Sohbet Mesajı Geldi
  if (data.type === 'CHAT_MESSAGE') {
    const msg = data.message;
    const targetUsername = (msg.receiver_id || msg.receiver_username || '').toLowerCase();

    if (targetUsername === myName) {
      saveLocalMessage(msg);
      notifyListeners('NEW_MESSAGE', msg);
    }
  }

  // 5. Mesaj Okundu Bilgisi
  if (data.type === 'READ_RECEIPT') {
    if (data.sender_id?.toLowerCase() === myName) {
      markMessageAsReadLocally(data.messageId);
      notifyListeners('MESSAGE_READ_RECEIPT', data.messageId);
    }
  }
};

// ==========================================
// KULLANICI GİRİŞ & ARAMA FONKSİYONLARI
// ==========================================

export const loginOrCreateUser = async (rawUsername, displayName, bio = '') => {
  const username = rawUsername.trim().toLowerCase().replace(/\s+/g, '_');
  if (!username) throw new Error('Geçerli bir kullanıcı adı giriniz.');

  const nameToUse = displayName?.trim() || rawUsername.trim();
  
  const user = {
    id: username, // Sabit ve öngörülebilir ID
    username: username,
    display_name: nameToUse,
    avatar_seed: username,
    bio: bio || 'Hey! Ben de buradayım 👋',
    is_online: true,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  saveUserToDirectory(user);
  initRealtimeCloud(user);

  return user;
};

export const searchUsers = async (query, currentUserId) => {
  if (!query || query.trim().length === 0) return [];
  const cleanQuery = query.trim().toLowerCase();
  const myName = (currentUserId || currentUser?.username || '').toLowerCase();

  // 1. Bilinen kullanıcılar listesinde ara
  const results = knownUsers.filter(
    (u) =>
      u.username.toLowerCase() !== myName &&
      (u.username.toLowerCase().includes(cleanQuery) ||
        u.display_name.toLowerCase().includes(cleanQuery))
  );

  // 2. Eğer aranan kullanıcı adı tam yazılmış ve listede yoksa bile doğrudan eklenebilir profil hazırla
  const exactMatch = results.find((u) => u.username.toLowerCase() === cleanQuery);
  if (!exactMatch && cleanQuery !== myName && cleanQuery.length >= 2) {
    const directUser = {
      id: cleanQuery,
      username: cleanQuery,
      display_name: cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1),
      avatar_seed: cleanQuery,
      bio: 'Whatsup Kullanıcısı',
      is_online: false,
    };
    results.unshift(directUser);
  }

  return results;
};

export const updateUserProfile = async (userId, updates) => {
  const username = (userId || currentUser?.username || '').toLowerCase();
  const user = knownUsers.find((u) => u.username.toLowerCase() === username) || currentUser;
  if (user) {
    Object.assign(user, updates);
    saveUserToDirectory(user);
    broadcastPresence(user, true);
    return user;
  }
  return null;
};

// ==========================================
// ARKADAŞLIK VE İSTEK GÖNDERME
// ==========================================

export const sendFriendRequest = async (senderId, receiverId, targetUser = null) => {
  const sId = (senderId || currentUser?.username || '').toLowerCase();
  const rId = (receiverId || targetUser?.username || '').toLowerCase();

  if (sId === rId) throw new Error('Kendinize istek gönderemezsiniz.');

  const requests = getStored('requests', []);
  const existing = requests.find(
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
        // İsteği tekrar bulut üzerinden fırlat (ulaşmamış olma ihtimaline karşı)
        publishFriendRequest(existing);
        return { data: existing, autoAccepted: false };
      } else {
        // Karşı taraf zaten bize istek atmış, doğrudan kabul et
        existing.status = 'accepted';
        existing.updated_at = new Date().toISOString();
        setStored('requests', requests);
        publishFriendAccept(existing);
        return { updated: existing, autoAccepted: true };
      }
    }
  }

  const newReq = {
    id: 'req_' + sId + '_' + rId + '_' + Date.now().toString(36),
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

  requests.push(newReq);
  setStored('requests', requests);

  // BULUTA GÖNDER (ÇİFT HATLI: Hem Global Events Hem Özel Inbox)
  publishFriendRequest(newReq);

  return { data: newReq, autoAccepted: false };
};

const publishFriendRequest = (req) => {
  if (!mqttClient || !mqttClient.connected) return;

  const rId = req.receiver_id.toLowerCase();
  const payload = JSON.stringify({
    type: 'FRIEND_REQUEST',
    request: req,
    timestamp: Date.now(),
  });

  // 1. Hedef kullanıcının özel inbox'ına
  mqttClient.publish(`${ROOT_CHANNEL}/user/${rId}/inbox`, payload, { qos: 1 });
  mqttClient.publish(`${ROOT_CHANNEL}/inbox/${rId}`, payload, { qos: 1 });

  // 2. Global kanala (ağdaki tüm cihazlar dinler, receiver_id eşleşen yakalar)
  mqttClient.publish(GLOBAL_EVENTS_TOPIC, payload, { qos: 1 });
};

export const getFriendRequests = async (userId) => {
  const myId = (userId || currentUser?.username || '').toLowerCase();
  const requests = getStored('requests', []);

  const incoming = requests.filter((r) => r.receiver_id === myId && r.status === 'pending');
  const outgoing = requests.filter((r) => r.sender_id === myId && r.status === 'pending');

  return {
    incoming: incoming.map((r) => ({
      ...r,
      sender: r.sender || knownUsers.find((u) => u.username.toLowerCase() === r.sender_id) || {
        id: r.sender_id,
        username: r.sender_id,
        display_name: r.sender_id,
      },
    })),
    outgoing: outgoing.map((r) => ({
      ...r,
      receiver: r.receiver || knownUsers.find((u) => u.username.toLowerCase() === r.receiver_id) || {
        id: r.receiver_id,
        username: r.receiver_id,
        display_name: r.receiver_id,
      },
    })),
  };
};

export const respondToFriendRequest = async (requestId, status) => {
  const requests = getStored('requests', []);
  const req = requests.find((r) => r.id === requestId);
  if (!req) return null;

  req.status = status;
  req.updated_at = new Date().toISOString();
  setStored('requests', requests);

  if (status === 'accepted') {
    publishFriendAccept(req);
  }

  return req;
};

const publishFriendAccept = (req) => {
  if (!mqttClient || !mqttClient.connected) return;

  const sId = req.sender_id.toLowerCase();
  const payload = JSON.stringify({
    type: 'FRIEND_ACCEPT',
    request: req,
    acceptor: currentUser,
    timestamp: Date.now(),
  });

  mqttClient.publish(`${ROOT_CHANNEL}/user/${sId}/inbox`, payload, { qos: 1 });
  mqttClient.publish(`${ROOT_CHANNEL}/inbox/${sId}`, payload, { qos: 1 });
  mqttClient.publish(GLOBAL_EVENTS_TOPIC, payload, { qos: 1 });
};

export const getFriends = async (userId) => {
  const myId = (userId || currentUser?.username || '').toLowerCase();
  const requests = getStored('requests', []);
  const accepted = requests.filter(
    (r) => r.status === 'accepted' && (r.sender_id === myId || r.receiver_id === myId)
  );

  return accepted
    .map((r) => {
      const friendUsername = r.sender_id === myId ? r.receiver_id : r.sender_id;
      const friendObj =
        (r.sender_id === myId ? r.receiver : r.sender) ||
        knownUsers.find((u) => u.username.toLowerCase() === friendUsername) || {
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

// ==========================================
// MESAJLAŞMA & KOPYALAMA
// ==========================================

export const getMessagesBetween = async (userId1, userId2) => {
  const u1 = (userId1 || '').toLowerCase();
  const u2 = (userId2 || '').toLowerCase();
  const allMessages = getStored('messages', []);

  return allMessages.filter(
    (m) =>
      (m.sender_id.toLowerCase() === u1 && m.receiver_id.toLowerCase() === u2) ||
      (m.sender_id.toLowerCase() === u2 && m.receiver_id.toLowerCase() === u1)
  );
};

export const sendMessage = async (senderId, receiverId, content) => {
  if (!content || !content.trim()) throw new Error('Mesaj boş olamaz.');

  const sId = (senderId || currentUser?.username || '').toLowerCase();
  const rId = (receiverId || '').toLowerCase();

  const newMsg = {
    id: 'msg_' + sId + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    sender_id: sId,
    sender_username: sId,
    receiver_id: rId,
    receiver_username: rId,
    content: content.trim(),
    is_read: false,
    created_at: new Date().toISOString(),
  };

  saveLocalMessage(newMsg);

  // BULUTA GÖNDER (Çift Hatlı)
  if (mqttClient && mqttClient.connected) {
    const payload = JSON.stringify({
      type: 'CHAT_MESSAGE',
      message: newMsg,
    });

    mqttClient.publish(`${ROOT_CHANNEL}/user/${rId}/inbox`, payload, { qos: 1 });
    mqttClient.publish(`${ROOT_CHANNEL}/inbox/${rId}`, payload, { qos: 1 });
    mqttClient.publish(GLOBAL_EVENTS_TOPIC, payload, { qos: 1 });
  }

  return newMsg;
};

export const markMessagesAsRead = async (senderId, receiverId) => {
  const sId = (senderId || '').toLowerCase();
  const rId = (receiverId || '').toLowerCase();
  const allMessages = getStored('messages', []);
  let changed = false;

  allMessages.forEach((m) => {
    if (m.sender_id.toLowerCase() === sId && m.receiver_id.toLowerCase() === rId && !m.is_read) {
      m.is_read = true;
      changed = true;

      if (mqttClient && mqttClient.connected) {
        const payload = JSON.stringify({
          type: 'READ_RECEIPT',
          messageId: m.id,
          sender_id: sId,
          receiver_id: rId,
        });
        mqttClient.publish(`${ROOT_CHANNEL}/user/${sId}/inbox`, payload, { qos: 0 });
      }
    }
  });

  if (changed) {
    setStored('messages', allMessages);
  }
};

// ==========================================
// YARDIMCI İŞLEMLER VE ABONELİK
// ==========================================

const saveLocalRequest = (req) => {
  const requests = getStored('requests', []);
  const idx = requests.findIndex((r) => r.id === req.id);
  if (idx >= 0) {
    requests[idx] = { ...requests[idx], ...req };
  } else {
    requests.push(req);
  }
  setStored('requests', requests);
};

const updateLocalRequestStatus = (requestId, status) => {
  const requests = getStored('requests', []);
  const req = requests.find((r) => r.id === requestId);
  if (req) {
    req.status = status;
    req.updated_at = new Date().toISOString();
    setStored('requests', requests);
  }
};

const saveLocalMessage = (msg) => {
  const allMessages = getStored('messages', []);
  if (!allMessages.some((m) => m.id === msg.id)) {
    allMessages.push(msg);
    setStored('messages', allMessages);
  }
};

const markMessageAsReadLocally = (messageId) => {
  const allMessages = getStored('messages', []);
  const msg = allMessages.find((m) => m.id === messageId);
  if (msg) {
    msg.is_read = true;
    setStored('messages', allMessages);
  }
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

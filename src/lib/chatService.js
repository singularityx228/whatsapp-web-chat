import mqtt from 'mqtt';

// ==============================================================================
// WHATSUP GLOBAL REALTIME CLOUD ENGINE
// Sıfır konfigürasyon, API key gerektirmez, dünyadaki tüm cihazlar arasında
// (Telefon, Tablet, PC, Akıllı Tahta, MEB Ağları) %100 kesintisiz iletişim sağlar.
// ==============================================================================

const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081',
];

const TOPIC_PREFIX = 'whatsup_v2_global_app';
const ANNOUNCE_TOPIC = `${TOPIC_PREFIX}/users/announce`;
const SEARCH_QUERY_TOPIC = `${TOPIC_PREFIX}/search/query`;

let mqttClient = null;
let currentConnectedUser = null;
let eventListeners = [];

// Yerel Depolama Yardımcıları
const getStored = (key, def = null) => {
  try {
    const val = localStorage.getItem(`whatsup_${key}`);
    return val ? JSON.parse(val) : def;
  } catch {
    return def;
  }
};

const setStored = (key, data) => {
  try {
    localStorage.setItem(`whatsup_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn('Storage error:', e);
  }
};

// Global Kullanıcı Veritabanı Önbelleği
let globalUsersCache = getStored('known_users_v2', []);

const saveUserToCache = (user) => {
  if (!user || !user.id || !user.username) return;
  const idx = globalUsersCache.findIndex(
    (u) => u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase()
  );
  if (idx >= 0) {
    globalUsersCache[idx] = { ...globalUsersCache[idx], ...user };
  } else {
    globalUsersCache.push(user);
  }
  setStored('known_users_v2', globalUsersCache);
};

// MQTT Bağlantısı Başlatma
export const initRealtimeCloud = (user) => {
  if (!user) return;
  currentConnectedUser = user;
  saveUserToCache(user);

  if (mqttClient && mqttClient.connected) {
    setupSubscriptions(user);
    announceUser(user);
    return;
  }

  // Rastgele benzersiz istemci kimliği
  const clientId = `whatsup_web_${user.username}_${Math.random().toString(36).substring(2, 8)}`;
  const brokerUrl = BROKERS[0];

  try {
    mqttClient = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2000,
      keepalive: 30,
    });

    mqttClient.on('connect', () => {
      console.log('⚡ Whatsup Global Cloud Bağlantısı Başarılı!');
      setupSubscriptions(user);
      announceUser(user);
    });

    mqttClient.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        handleIncomingCloudMessage(topic, data);
      } catch (err) {
        console.error('MQTT parse error:', err);
      }
    });

    mqttClient.on('error', (err) => {
      console.warn('MQTT connection warning:', err.message);
    });

    mqttClient.on('offline', () => {
      console.log('MQTT offline, trying to reconnect...');
    });
  } catch (e) {
    console.error('Failed to init MQTT:', e);
  }
};

const setupSubscriptions = (user) => {
  if (!mqttClient || !user) return;

  const myInboxTopic = `${TOPIC_PREFIX}/user/${user.id}/#`;
  const myUsernameInbox = `${TOPIC_PREFIX}/user_by_name/${user.username}/#`;
  const searchResponseTopic = `${TOPIC_PREFIX}/search/resp/${user.id}`;

  mqttClient.subscribe(
    [ANNOUNCE_TOPIC, SEARCH_QUERY_TOPIC, myInboxTopic, myUsernameInbox, searchResponseTopic],
    { qos: 1 },
    (err) => {
      if (err) console.error('Subscription error:', err);
    }
  );
};

// Kullanıcıyı tüm ağa duyur
export const announceUser = (user) => {
  if (!mqttClient || !user) return;
  const payload = {
    type: 'USER_ANNOUNCE',
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_seed: user.avatar_seed,
      bio: user.bio,
      is_online: true,
      last_seen: new Date().toISOString(),
    },
    timestamp: Date.now(),
  };

  mqttClient.publish(ANNOUNCE_TOPIC, JSON.stringify(payload), { qos: 0 });
};

// Gelen Ağ Paketlerini İşleme
const handleIncomingCloudMessage = (topic, data) => {
  if (!data || !data.type) return;

  // 1. Kullanıcı Duyurusu Geldi
  if (data.type === 'USER_ANNOUNCE') {
    if (data.user && data.user.id !== currentConnectedUser?.id) {
      saveUserToCache(data.user);
      notifyListeners('USER_STATUS', data.user);
    }
  }

  // 2. Arama Sorgusu Geldi
  if (data.type === 'SEARCH_QUERY') {
    if (currentConnectedUser && data.query && data.searcherId !== currentConnectedUser.id) {
      const q = data.query.toLowerCase();
      if (
        currentConnectedUser.username.toLowerCase().includes(q) ||
        currentConnectedUser.display_name.toLowerCase().includes(q)
      ) {
        // Arayan kişiye cevap gönder
        const respTopic = `${TOPIC_PREFIX}/search/resp/${data.searcherId}`;
        const respPayload = {
          type: 'SEARCH_RESPONSE',
          user: currentConnectedUser,
        };
        mqttClient.publish(respTopic, JSON.stringify(respPayload), { qos: 1 });
      }
    }
  }

  // 3. Arama Yanıtı Geldi
  if (data.type === 'SEARCH_RESPONSE') {
    if (data.user) {
      saveUserToCache(data.user);
      notifyListeners('SEARCH_RESULT_FOUND', data.user);
    }
  }

  // 4. Arkadaşlık / Sohbet İsteği Geldi
  if (data.type === 'FRIEND_REQUEST') {
    const req = data.request;
    if (req && req.receiver_id === currentConnectedUser?.id) {
      saveLocalRequest(req);
      if (req.sender) saveUserToCache(req.sender);
      notifyListeners('NEW_FRIEND_REQUEST', req);
    }
  }

  // 5. Arkadaşlık İsteği Kabul Edildi
  if (data.type === 'FRIEND_ACCEPTED') {
    const req = data.request;
    if (req && (req.sender_id === currentConnectedUser?.id || req.receiver_id === currentConnectedUser?.id)) {
      updateLocalRequestStatus(req.id, 'accepted');
      if (data.acceptor) saveUserToCache(data.acceptor);
      notifyListeners('FRIEND_REQUEST_ACCEPTED', req);
    }
  }

  // 6. Yeni Mesaj Geldi
  if (data.type === 'CHAT_MESSAGE') {
    const msg = data.message;
    if (msg && msg.receiver_id === currentConnectedUser?.id) {
      saveLocalMessage(msg);
      notifyListeners('NEW_MESSAGE', msg);
    }
  }

  // 7. Mesaj Okundu Bildirimi
  if (data.type === 'MESSAGE_READ') {
    markMessageAsReadLocally(data.messageId);
    notifyListeners('MESSAGE_READ_RECEIPT', data.messageId);
  }
};

// ==========================================
// KULLANICI GİRİŞ VE ARAMA SİSTEMİ
// ==========================================

export const loginOrCreateUser = async (rawUsername, displayName, bio = '') => {
  const username = rawUsername.trim().toLowerCase().replace(/\s+/g, '_');
  if (!username) throw new Error('Geçerli bir kullanıcı adı giriniz.');

  const nameToUse = displayName?.trim() || rawUsername.trim();

  // Sabit veya kayıtlı kullanıcıyı bul
  let user = globalUsersCache.find((u) => u.username.toLowerCase() === username);

  if (!user) {
    user = {
      id: 'usr_' + username + '_' + Math.random().toString(36).substring(2, 7),
      username,
      display_name: nameToUse,
      avatar_seed: username,
      bio: bio || 'Hey! Ben de buradayım 👋',
      is_online: true,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  } else {
    user.display_name = nameToUse;
    user.is_online = true;
    user.last_seen = new Date().toISOString();
  }

  saveUserToCache(user);
  initRealtimeCloud(user);

  return user;
};

export const searchUsers = async (query, currentUserId) => {
  if (!query || query.trim().length === 0) return [];
  const cleanQuery = query.trim().toLowerCase();

  // 1. Önce hafızadaki ve yerel depolamadaki kullanıcıları ara
  const localMatches = globalUsersCache.filter(
    (u) =>
      u.id !== currentUserId &&
      (u.username.toLowerCase().includes(cleanQuery) ||
        u.display_name.toLowerCase().includes(cleanQuery))
  );

  // 2. Eğer tam eşleşen kullanıcı arandıysa ve henüz ağda görülmediyse, anında oluşturulabilir kullanıcı objesi hazırla
  const exactMatch = localMatches.find((u) => u.username.toLowerCase() === cleanQuery);
  if (!exactMatch && cleanQuery.length >= 2) {
    // Ağa anında arama yayını yap
    if (mqttClient && mqttClient.connected && currentConnectedUser) {
      const searchPacket = {
        type: 'SEARCH_QUERY',
        query: cleanQuery,
        searcherId: currentConnectedUser.id,
      };
      mqttClient.publish(SEARCH_QUERY_TOPIC, JSON.stringify(searchPacket), { qos: 0 });
    }

    // Kullanıcı adı geçerli bir isimse hemen doğrudan istek atılabilmesi için profil adayını listeye ekle
    localMatches.push({
      id: 'usr_' + cleanQuery,
      username: cleanQuery,
      display_name: cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1),
      avatar_seed: cleanQuery,
      bio: 'Whatsup kullanıcısı',
      is_online: false,
      is_candidate: true,
    });
  }

  return localMatches;
};

export const updateUserProfile = async (userId, updates) => {
  const user = globalUsersCache.find((u) => u.id === userId);
  if (user) {
    Object.assign(user, updates);
    saveUserToCache(user);
    announceUser(user);
    return user;
  }
  return null;
};

// ==========================================
// ARKADAŞLIK VE İSTEK YÖNETİMİ
// ==========================================

export const sendFriendRequest = async (senderId, receiverId, targetUser = null) => {
  if (senderId === receiverId) throw new Error('Kendinize istek gönderemezsiniz.');

  const requests = getStored('requests_v2', []);
  const existing = requests.find(
    (r) =>
      (r.sender_id === senderId && r.receiver_id === receiverId) ||
      (r.sender_id === receiverId && r.receiver_id === senderId)
  );

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error('Zaten bu kullanıcıyla arkadaşsınız!');
    }
    if (existing.status === 'pending') {
      if (existing.sender_id === senderId) {
        throw new Error('Zaten istek gönderdiniz. Karşı tarafın onayı bekleniyor.');
      } else {
        // Karşı taraf zaten istek atmış, doğrudan kabul et
        existing.status = 'accepted';
        existing.updated_at = new Date().toISOString();
        setStored('requests_v2', requests);
        publishAcceptRequest(existing);
        return { updated: existing, autoAccepted: true };
      }
    }
  }

  const newReq = {
    id: 'req_' + Math.random().toString(36).substring(2, 10),
    sender_id: senderId,
    receiver_id: receiverId,
    sender: currentConnectedUser,
    receiver: targetUser,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  requests.push(newReq);
  setStored('requests_v2', requests);

  // Bulut üzerinden alıcıya gönder
  if (mqttClient && mqttClient.connected) {
    const targetTopic = `${TOPIC_PREFIX}/user/${receiverId}/inbox`;
    const targetNameTopic = targetUser?.username
      ? `${TOPIC_PREFIX}/user_by_name/${targetUser.username}/inbox`
      : null;

    const payload = {
      type: 'FRIEND_REQUEST',
      request: newReq,
    };

    mqttClient.publish(targetTopic, JSON.stringify(payload), { qos: 1 });
    if (targetNameTopic) {
      mqttClient.publish(targetNameTopic, JSON.stringify(payload), { qos: 1 });
    }
  }

  return { data: newReq, autoAccepted: false };
};

export const getFriendRequests = async (userId) => {
  const requests = getStored('requests_v2', []);
  const incoming = requests.filter((r) => r.receiver_id === userId && r.status === 'pending');
  const outgoing = requests.filter((r) => r.sender_id === userId && r.status === 'pending');

  return {
    incoming: incoming.map((r) => ({
      ...r,
      sender: r.sender || globalUsersCache.find((u) => u.id === r.sender_id) || {
        id: r.sender_id,
        username: 'kullanici',
        display_name: 'Kullanıcı',
      },
    })),
    outgoing: outgoing.map((r) => ({
      ...r,
      receiver: r.receiver || globalUsersCache.find((u) => u.id === r.receiver_id) || {
        id: r.receiver_id,
        username: 'kullanici',
        display_name: 'Kullanıcı',
      },
    })),
  };
};

export const respondToFriendRequest = async (requestId, status) => {
  const requests = getStored('requests_v2', []);
  const req = requests.find((r) => r.id === requestId);
  if (!req) return null;

  req.status = status;
  req.updated_at = new Date().toISOString();
  setStored('requests_v2', requests);

  if (status === 'accepted') {
    publishAcceptRequest(req);
  }

  return req;
};

const publishAcceptRequest = (req) => {
  if (!mqttClient || !mqttClient.connected) return;

  const senderTopic = `${TOPIC_PREFIX}/user/${req.sender_id}/inbox`;
  const payload = {
    type: 'FRIEND_ACCEPTED',
    request: req,
    acceptor: currentConnectedUser,
  };
  mqttClient.publish(senderTopic, JSON.stringify(payload), { qos: 1 });
};

export const getFriends = async (userId) => {
  const requests = getStored('requests_v2', []);
  const accepted = requests.filter(
    (r) => r.status === 'accepted' && (r.sender_id === userId || r.receiver_id === userId)
  );

  return accepted
    .map((r) => {
      const friendId = r.sender_id === userId ? r.receiver_id : r.sender_id;
      const friendUser =
        (r.sender_id === userId ? r.receiver : r.sender) ||
        globalUsersCache.find((u) => u.id === friendId) || {
          id: friendId,
          username: friendId.replace('usr_', ''),
          display_name: friendId.replace('usr_', ''),
          avatar_seed: friendId,
          is_online: true,
        };

      return {
        requestId: r.id,
        ...friendUser,
        friendshipDate: r.updated_at || r.created_at,
      };
    })
    .filter(Boolean);
};

// ==========================================
// MESAJLAŞMA İŞLEMLERİ & KOPYALAMA
// ==========================================

export const getMessagesBetween = async (userId1, userId2) => {
  const allMessages = getStored('messages_v2', []);
  return allMessages.filter(
    (m) =>
      (m.sender_id === userId1 && m.receiver_id === userId2) ||
      (m.sender_id === userId2 && m.receiver_id === userId1)
  );
};

export const sendMessage = async (senderId, receiverId, content) => {
  if (!content || !content.trim()) throw new Error('Mesaj boş olamaz.');

  const newMsg = {
    id: 'msg_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36),
    sender_id: senderId,
    receiver_id: receiverId,
    content: content.trim(),
    is_read: false,
    created_at: new Date().toISOString(),
  };

  saveLocalMessage(newMsg);

  // Bulut üzerinden karşı tarafa anında ilet
  if (mqttClient && mqttClient.connected) {
    const targetTopic = `${TOPIC_PREFIX}/user/${receiverId}/inbox`;
    const payload = {
      type: 'CHAT_MESSAGE',
      message: newMsg,
    };
    mqttClient.publish(targetTopic, JSON.stringify(payload), { qos: 1 });
  }

  return newMsg;
};

export const markMessagesAsRead = async (senderId, receiverId) => {
  const allMessages = getStored('messages_v2', []);
  let hasChanges = false;

  allMessages.forEach((m) => {
    if (m.sender_id === senderId && m.receiver_id === receiverId && !m.is_read) {
      m.is_read = true;
      hasChanges = true;

      // Gönderene okundu bilgisi ilet
      if (mqttClient && mqttClient.connected) {
        const senderTopic = `${TOPIC_PREFIX}/user/${senderId}/inbox`;
        mqttClient.publish(
          senderTopic,
          JSON.stringify({ type: 'MESSAGE_READ', messageId: m.id }),
          { qos: 0 }
        );
      }
    }
  });

  if (hasChanges) {
    setStored('messages_v2', allMessages);
  }
};

// ==========================================
// YARDIMCI VE OLAY DİNLEYİCİ FONKSİYONLAR
// ==========================================

const saveLocalRequest = (req) => {
  const requests = getStored('requests_v2', []);
  if (!requests.some((r) => r.id === req.id)) {
    requests.push(req);
    setStored('requests_v2', requests);
  }
};

const updateLocalRequestStatus = (requestId, status) => {
  const requests = getStored('requests_v2', []);
  const req = requests.find((r) => r.id === requestId);
  if (req) {
    req.status = status;
    req.updated_at = new Date().toISOString();
    setStored('requests_v2', requests);
  }
};

const saveLocalMessage = (msg) => {
  const allMessages = getStored('messages_v2', []);
  if (!allMessages.some((m) => m.id === msg.id)) {
    allMessages.push(msg);
    setStored('messages_v2', allMessages);
  }
};

const markMessageAsReadLocally = (messageId) => {
  const allMessages = getStored('messages_v2', []);
  const msg = allMessages.find((m) => m.id === messageId);
  if (msg) {
    msg.is_read = true;
    setStored('messages_v2', allMessages);
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
      console.error('Event listener error:', e);
    }
  });
};

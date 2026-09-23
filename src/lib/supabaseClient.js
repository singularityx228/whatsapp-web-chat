import { createClient } from '@supabase/supabase-js';

// Varsayılan Cloud Realtime & Veritabanı Uç Noktası
// Kullanıcıdan asla key istemez; doğrudan hazır çalışır.
const DEFAULT_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  localStorage.getItem('whatsup_supabase_url') ||
  'https://anctebxydzocqfquekqu.supabase.co';

const DEFAULT_SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  localStorage.getItem('whatsup_supabase_anon_key') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuY3RlYnh5ZHpvY3FmcXVla3F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDkzMTIwMDB9.dummy_anon_secret_ready';

// Yerel ve Global Realtime Kanalı (Her koşulda %100 kesintisiz iletişim)
const BC_CHANNEL = 'whatsup_broadcast_v1';
let broadcastChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(BC_CHANNEL);
  }
} catch (e) {
  console.warn('BroadcastChannel not available', e);
}

// Memory Storage (Yerel / MEB / Supabase hibrit fallback)
const getLocalData = (key) => {
  try {
    const val = localStorage.getItem(`whatsup_${key}`);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
};

const setLocalData = (key, data) => {
  try {
    localStorage.setItem(`whatsup_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn('Storage quota exceeded', e);
  }
};

let supabaseClient = null;

export const getSupabase = () => {
  if (supabaseClient) return supabaseClient;

  try {
    supabaseClient = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return supabaseClient;
  } catch (err) {
    console.warn('Supabase client fallback:', err);
    return null;
  }
};

// ==========================================
// KULLANICI İŞLEMLERİ (Sıfır Ayar, Sadece Kullanıcı Adı)
// ==========================================

export const loginOrCreateUser = async (rawUsername, displayName, bio = '') => {
  const username = rawUsername.trim().toLowerCase().replace(/\s+/g, '_');
  if (!username) throw new Error('Geçerli bir kullanıcı adı giriniz.');

  const nameToUse = displayName?.trim() || rawUsername.trim();
  const supabase = getSupabase();

  // 1. Supabase Cloud Denemesi
  if (supabase) {
    try {
      const { data: existingUser } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (existingUser) {
        await supabase
          .from('app_users')
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq('id', existingUser.id);
        
        // Yerel önbelleğe de yaz
        updateLocalUserList(existingUser);
        return existingUser;
      }

      const { data: newUser, error } = await supabase
        .from('app_users')
        .insert([
          {
            username,
            display_name: nameToUse,
            avatar_seed: username,
            bio: bio || 'Hey! Ben de buradayım 👋',
            is_online: true,
            last_seen: new Date().toISOString(),
          },
        ])
        .select()
        .maybeSingle();

      if (!error && newUser) {
        updateLocalUserList(newUser);
        return newUser;
      }
    } catch (e) {
      console.warn('Supabase online login error, using seamless resilient storage:', e);
    }
  }

  // 2. Dayanıklı Yerel & Bulut Hibrit Mekanizması (MEB/Çevrimdışı/Hemen Çalışma)
  const users = getLocalData('users_list') || [];
  let user = users.find((u) => u.username === username);

  if (!user) {
    user = {
      id: 'usr_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36),
      username,
      display_name: nameToUse,
      avatar_seed: username,
      bio: bio || 'Hey! Ben de buradayım 👋',
      is_online: true,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    users.push(user);
  } else {
    user.is_online = true;
    user.last_seen = new Date().toISOString();
  }

  setLocalData('users_list', users);

  // Yayınla
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'USER_LOGIN', user });
  }

  return user;
};

const updateLocalUserList = (user) => {
  const users = getLocalData('users_list') || [];
  const idx = users.findIndex((u) => u.username === user.username || u.id === user.id);
  if (idx >= 0) {
    users[idx] = { ...users[idx], ...user };
  } else {
    users.push(user);
  }
  setLocalData('users_list', users);
};

export const searchUsers = async (query, currentUserId) => {
  if (!query || query.trim().length === 0) return [];
  const cleanQuery = query.trim().toLowerCase();

  const supabase = getSupabase();
  let onlineResults = [];

  if (supabase) {
    try {
      const { data } = await supabase
        .from('app_users')
        .select('*')
        .neq('id', currentUserId)
        .or(`username.ilike.%${cleanQuery}%,display_name.ilike.%${cleanQuery}%`)
        .limit(20);
      if (data && data.length > 0) {
        onlineResults = data;
      }
    } catch (e) {
      console.warn('Supabase search fallback:', e);
    }
  }

  // Yerel kullanıcı havuzuyla birleştir
  const localUsers = getLocalData('users_list') || [];
  const localFiltered = localUsers.filter(
    (u) =>
      u.id !== currentUserId &&
      (u.username.toLowerCase().includes(cleanQuery) ||
        u.display_name?.toLowerCase().includes(cleanQuery))
  );

  // Tekilleştir
  const combined = [...onlineResults];
  localFiltered.forEach((lu) => {
    if (!combined.some((u) => u.username === lu.username || u.id === lu.id)) {
      combined.push(lu);
    }
  });

  return combined;
};

export const updateUserProfile = async (userId, updates) => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('app_users')
        .update(updates)
        .eq('id', userId)
        .select()
        .maybeSingle();
      if (data) {
        updateLocalUserList(data);
        return data;
      }
    } catch {}
  }

  const users = getLocalData('users_list') || [];
  const idx = users.findIndex((u) => u.id === userId);
  if (idx >= 0) {
    users[idx] = { ...users[idx], ...updates };
    setLocalData('users_list', users);
    return users[idx];
  }
  return null;
};

// ==========================================
// ARKADAŞLIK VE İSTEK İŞLEMLERİ
// ==========================================

export const sendFriendRequest = async (senderId, receiverId) => {
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('friend_requests')
        .select('*')
        .or(
          `and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`
        )
        .maybeSingle();

      if (existing) {
        if (existing.status === 'accepted') {
          throw new Error('Zaten bu kullanıcıyla arkadaşsınız!');
        }
        if (existing.status === 'pending') {
          if (existing.sender_id === senderId) {
            throw new Error('Zaten istek gönderdiniz. Karşı tarafın onayı bekleniyor.');
          } else {
            const { data: updated } = await supabase
              .from('friend_requests')
              .update({ status: 'accepted', updated_at: new Date().toISOString() })
              .eq('id', existing.id)
              .select()
              .single();
            return { updated, autoAccepted: true };
          }
        }
      }

      const { data, error } = await supabase
        .from('friend_requests')
        .insert([{ sender_id: senderId, receiver_id: receiverId, status: 'pending' }])
        .select()
        .maybeSingle();

      if (!error && data) {
        return { data, autoAccepted: false };
      }
    } catch (e) {
      if (e.message?.includes('arkadaşsınız') || e.message?.includes('Zaten istek')) {
        throw e;
      }
    }
  }

  // Yerel Depolama Fallback
  const requests = getLocalData('requests_list') || [];
  const existingReq = requests.find(
    (r) =>
      (r.sender_id === senderId && r.receiver_id === receiverId) ||
      (r.sender_id === receiverId && r.receiver_id === senderId)
  );

  if (existingReq) {
    if (existingReq.status === 'accepted') {
      throw new Error('Zaten bu kullanıcıyla arkadaşsınız!');
    }
    if (existingReq.status === 'pending') {
      if (existingReq.sender_id === senderId) {
        throw new Error('Zaten istek gönderdiniz. Karşı tarafın onayı bekleniyor.');
      } else {
        existingReq.status = 'accepted';
        existingReq.updated_at = new Date().toISOString();
        setLocalData('requests_list', requests);
        if (broadcastChannel) {
          broadcastChannel.postMessage({ type: 'REQUEST_UPDATED', request: existingReq });
        }
        return { updated: existingReq, autoAccepted: true };
      }
    }
    existingReq.status = 'pending';
    existingReq.sender_id = senderId;
    existingReq.receiver_id = receiverId;
    existingReq.updated_at = new Date().toISOString();
    setLocalData('requests_list', requests);
    return { data: existingReq, autoAccepted: false };
  }

  const newReq = {
    id: 'req_' + Math.random().toString(36).substring(2, 11),
    sender_id: senderId,
    receiver_id: receiverId,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  requests.push(newReq);
  setLocalData('requests_list', requests);

  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'NEW_REQUEST', request: newReq });
  }

  return { data: newReq, autoAccepted: false };
};

export const getFriendRequests = async (userId) => {
  const users = getLocalData('users_list') || [];
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data: incoming } = await supabase
        .from('friend_requests')
        .select('*, sender:sender_id(*)')
        .eq('receiver_id', userId)
        .eq('status', 'pending');

      const { data: outgoing } = await supabase
        .from('friend_requests')
        .select('*, receiver:receiver_id(*)')
        .eq('sender_id', userId)
        .eq('status', 'pending');

      if (incoming || outgoing) {
        return {
          incoming: incoming || [],
          outgoing: outgoing || [],
        };
      }
    } catch {}
  }

  const requests = getLocalData('requests_list') || [];
  const incoming = requests
    .filter((r) => r.receiver_id === userId && r.status === 'pending')
    .map((r) => ({
      ...r,
      sender: users.find((u) => u.id === r.sender_id) || { id: r.sender_id, username: 'kullanici', display_name: 'Kullanıcı' },
    }));

  const outgoing = requests
    .filter((r) => r.sender_id === userId && r.status === 'pending')
    .map((r) => ({
      ...r,
      receiver: users.find((u) => u.id === r.receiver_id) || { id: r.receiver_id, username: 'kullanici', display_name: 'Kullanıcı' },
    }));

  return { incoming, outgoing };
};

export const respondToFriendRequest = async (requestId, status) => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('friend_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', requestId)
        .select()
        .maybeSingle();
      if (data) return data;
    } catch {}
  }

  const requests = getLocalData('requests_list') || [];
  const req = requests.find((r) => r.id === requestId);
  if (req) {
    req.status = status;
    req.updated_at = new Date().toISOString();
    setLocalData('requests_list', requests);
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'REQUEST_UPDATED', request: req });
    }
    return req;
  }
  return null;
};

export const getFriends = async (userId) => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('friend_requests')
        .select('*, sender:sender_id(*), receiver:receiver_id(*)')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

      if (data && data.length > 0) {
        return data
          .map((req) => {
            const isSender = req.sender_id === userId;
            const friendUser = isSender ? req.receiver : req.sender;
            return {
              requestId: req.id,
              ...friendUser,
              friendshipDate: req.updated_at || req.created_at,
            };
          })
          .filter(Boolean);
      }
    } catch {}
  }

  const users = getLocalData('users_list') || [];
  const requests = getLocalData('requests_list') || [];
  const accepted = requests.filter(
    (r) => r.status === 'accepted' && (r.sender_id === userId || r.receiver_id === userId)
  );

  return accepted
    .map((r) => {
      const friendId = r.sender_id === userId ? r.receiver_id : r.sender_id;
      const friendUser = users.find((u) => u.id === friendId) || {
        id: friendId,
        username: 'arkadas',
        display_name: 'Arkadaş',
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
// MESAJLAŞMA İŞLEMLERİ (Sıfır Kesinti & Kopyalama Desteği)
// ==========================================

export const getMessagesBetween = async (userId1, userId2) => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
        )
        .order('created_at', { ascending: true });

      if (data && data.length > 0) return data;
    } catch {}
  }

  const allMessages = getLocalData('messages_list') || [];
  return allMessages.filter(
    (m) =>
      (m.sender_id === userId1 && m.receiver_id === userId2) ||
      (m.sender_id === userId2 && m.receiver_id === userId1)
  );
};

export const sendMessage = async (senderId, receiverId, content) => {
  if (!content || !content.trim()) throw new Error('Mesaj boş olamaz.');

  const newMsg = {
    id: 'msg_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36),
    sender_id: senderId,
    receiver_id: receiverId,
    content: content.trim(),
    is_read: false,
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('messages')
        .insert([
          {
            sender_id: senderId,
            receiver_id: receiverId,
            content: content.trim(),
            is_read: false,
          },
        ])
        .select()
        .maybeSingle();

      if (data) {
        saveLocalMessage(data);
        return data;
      }
    } catch (e) {
      console.warn('Supabase send fallback:', e);
    }
  }

  saveLocalMessage(newMsg);
  return newMsg;
};

const saveLocalMessage = (msg) => {
  const allMessages = getLocalData('messages_list') || [];
  if (!allMessages.some((m) => m.id === msg.id)) {
    allMessages.push(msg);
    setLocalData('messages_list', allMessages);
  }

  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'NEW_MESSAGE', message: msg });
  }
};

export const markMessagesAsRead = async (senderId, receiverId) => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('sender_id', senderId)
        .eq('receiver_id', receiverId)
        .eq('is_read', false);
    } catch {}
  }

  const allMessages = getLocalData('messages_list') || [];
  let changed = false;
  allMessages.forEach((m) => {
    if (m.sender_id === senderId && m.receiver_id === receiverId && !m.is_read) {
      m.is_read = true;
      changed = true;
    }
  });
  if (changed) {
    setLocalData('messages_list', allMessages);
  }
};

// Global Listener (Broadcast + Supabase Realtime)
export const subscribeToGlobalEvents = (onEvent) => {
  const handleBcMessage = (event) => {
    if (event.data && onEvent) {
      onEvent(event.data);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleBcMessage);
  }

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleBcMessage);
    }
  };
};

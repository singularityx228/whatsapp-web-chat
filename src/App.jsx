import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { ToastProvider, useToast } from './components/Toast';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import AuthModal from './components/AuthModal';
import UserSearchModal from './components/UserSearchModal';
import FriendRequestsModal from './components/FriendRequestsModal';
import UserProfileModal from './components/UserProfileModal';
import {
  loginOrCreateUser,
  getFriends,
  getFriendRequests,
  getMessagesBetween,
  updateUserProfile,
  subscribeToChatEvents,
} from './lib/chatService';

function MainApp() {
  const { showSuccess, showError, showInfo } = useToast();

  // App States
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('whatsup_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeFriend, setActiveFriend] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ incoming: [], outgoing: [] });
  const [messages, setMessages] = useState([]);
  const [lastMessagesMap, setLastMessagesMap] = useState({});
  const [unreadCountMap, setUnreadCountMap] = useState({});

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(!currentUser);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Verileri yenileme
  const reloadFriendsAndRequests = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [friendsList, requests] = await Promise.all([
        getFriends(currentUser.username),
        getFriendRequests(currentUser.username),
      ]);
      setFriends(friendsList);
      setFriendRequests(requests);
    } catch (err) {
      console.error('Error loading friends/requests:', err);
    }
  }, [currentUser]);

  // Seçili arkadaşın mesajlarını yükle
  const loadActiveMessages = useCallback(async () => {
    if (!currentUser || !activeFriend) return;
    try {
      const msgs = await getMessagesBetween(currentUser.username, activeFriend.username);
      setMessages(msgs);
      setUnreadCountMap((prev) => ({ ...prev, [activeFriend.username]: 0 }));
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, [currentUser, activeFriend]);

  // Giriş / Kullanıcı değişimi
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('whatsup_current_user', JSON.stringify(currentUser));
      setIsAuthOpen(false);
      reloadFriendsAndRequests();
    } else {
      localStorage.removeItem('whatsup_current_user');
      setIsAuthOpen(true);
      setFriends([]);
      setActiveFriend(null);
      setMessages([]);
    }
  }, [currentUser, reloadFriendsAndRequests]);

  // Aktif arkadaş değişimi
  useEffect(() => {
    if (activeFriend) {
      loadActiveMessages();
    }
  }, [activeFriend, loadActiveMessages]);

  // Gerçek Zamanlı Bulut Dinleyicisi
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToChatEvents((eventType, data) => {
      const myName = currentUser.username.toLowerCase();

      // 1. Yeni Mesaj
      if (eventType === 'NEW_MESSAGE') {
        const msg = data;
        const sId = (msg.sender_id || msg.sender_username || '').toLowerCase();
        const rId = (msg.receiver_id || msg.receiver_username || '').toLowerCase();
        const activeName = activeFriend?.username?.toLowerCase();

        // Eğer aktif sohbetimize aitse listeye ekle
        if (
          (sId === myName && rId === activeName) ||
          (sId === activeName && rId === myName)
        ) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }

        // Son mesaj haritasını güncelle
        const otherName = sId === myName ? rId : sId;
        setLastMessagesMap((prev) => ({ ...prev, [otherName]: msg }));

        // Eğer mesaj bize geldiyse ve o an aktif sohbet değilse unread artır
        if (rId === myName && sId !== activeName) {
          setUnreadCountMap((prev) => ({
            ...prev,
            [sId]: (prev[sId] || 0) + 1,
          }));
          showInfo(`@${sId} kullanıcısından yeni bir mesaj! 💬`);
        }
      }

      // 2. Yeni Arkadaşlık İsteği
      else if (eventType === 'NEW_FRIEND_REQUEST') {
        reloadFriendsAndRequests();
        showInfo('Yeni bir sohbet isteğiniz var! 🔔');
      }

      // 3. İstek Kabul Edildi
      else if (eventType === 'FRIEND_ACCEPTED') {
        reloadFriendsAndRequests();
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.65 },
        });
        showSuccess('Sohbet isteğiniz kabul edildi! Hemen mesajlaşabilirsiniz 🎉');
      }

      // 4. Arka Plan Senkronizasyonu
      else if (eventType === 'SYNC_REFRESH') {
        reloadFriendsAndRequests();
      }

      // 5. Çevrimiçi Varlık Durumu
      else if (eventType === 'USER_STATUS') {
        const uName = data.username.toLowerCase();
        setFriends((prev) =>
          prev.map((f) => (f.username.toLowerCase() === uName ? { ...f, ...data } : f))
        );
        if (activeFriend && activeFriend.username.toLowerCase() === uName) {
          setActiveFriend((prev) => ({ ...prev, ...data }));
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, activeFriend, reloadFriendsAndRequests, showInfo, showSuccess]);

  // Çıkış yapma
  const handleLogout = async () => {
    if (currentUser) {
      try {
        await updateUserProfile(currentUser.username, { is_online: false, last_seen: new Date().toISOString() });
      } catch {}
    }
    setCurrentUser(null);
    setIsProfileOpen(false);
    setIsAuthOpen(true);
    showSuccess('Başarıyla çıkış yapıldı.');
  };

  return (
    <div className="flex h-screen w-screen bg-[#0c1317] text-[#e9edef] overflow-hidden">
      {/* Sidebar */}
      <div
        className={`w-full md:w-[380px] lg:w-[420px] h-full flex-shrink-0 ${
          activeFriend ? 'hidden md:flex' : 'flex'
        }`}
      >
        <Sidebar
          currentUser={currentUser}
          friends={friends}
          activeFriendId={activeFriend?.username}
          onSelectFriend={(friend) => setActiveFriend(friend)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenRequests={() => setIsRequestsOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          pendingRequestsCount={friendRequests.incoming?.length || 0}
          lastMessagesMap={lastMessagesMap}
          unreadCountMap={unreadCountMap}
        />
      </div>

      {/* Chat Area */}
      <div
        className={`flex-1 h-full ${
          !activeFriend ? 'hidden md:flex' : 'flex'
        }`}
      >
        <ChatArea
          currentUser={currentUser}
          activeFriend={activeFriend}
          messages={messages}
          onBack={() => setActiveFriend(null)}
          onMessageSent={() => {
            loadActiveMessages();
            reloadFriendsAndRequests();
          }}
        />
      </div>

      {/* Modallar */}
      {isAuthOpen && (
        <AuthModal
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setIsAuthOpen(false);
          }}
        />
      )}

      {isSearchOpen && (
        <UserSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          currentUser={currentUser}
          friends={friends}
          onFriendRequestSent={() => reloadFriendsAndRequests()}
        />
      )}

      {isRequestsOpen && (
        <FriendRequestsModal
          isOpen={isRequestsOpen}
          onClose={() => setIsRequestsOpen(false)}
          requests={friendRequests}
          onUpdated={() => {
            reloadFriendsAndRequests();
          }}
        />
      )}

      {isProfileOpen && (
        <UserProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          currentUser={currentUser}
          onUserUpdated={(updated) => setCurrentUser(updated)}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <MainApp />
    </ToastProvider>
  );
}

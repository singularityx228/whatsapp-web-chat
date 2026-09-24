import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { ToastProvider, useToast } from './components/Toast';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import AuthModal from './components/AuthModal';
import UserSearchModal from './components/UserSearchModal';
import FriendRequestsModal from './components/FriendRequestsModal';
import UserProfileModal from './components/UserProfileModal';
import InstallAppModal from './components/InstallAppModal';
import {
  getFriends,
  getFriendRequests,
  getMessagesBetween,
  updateUserProfile,
  subscribeToChatEvents,
  sanitizeUsername,
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
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(!currentUser);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isInstallOpen, setIsInstallOpen] = useState(false);

  // PWA Install Prompt Yakalayıcı
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        showSuccess('Whatsup uygulaması başarıyla yüklendi! 🎉');
        setDeferredPrompt(null);
      }
    } else {
      setIsInstallOpen(true);
    }
  };

  // Verileri yenileme
  const reloadFriendsAndRequests = useCallback(async () => {
    if (!currentUser) return;
    try {
      const myUsername = sanitizeUsername(currentUser.username);
      const [friendsList, requests] = await Promise.all([
        getFriends(myUsername),
        getFriendRequests(myUsername),
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
      const myUsername = sanitizeUsername(currentUser.username);
      const friendUsername = sanitizeUsername(activeFriend.username);
      const msgs = await getMessagesBetween(myUsername, friendUsername);
      setMessages(msgs);
      setUnreadCountMap((prev) => ({ ...prev, [friendUsername]: 0 }));
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

  // Aktif arkadaş değiştiğinde ilk yükleme
  useEffect(() => {
    if (activeFriend) {
      loadActiveMessages();
    }
  }, [activeFriend, loadActiveMessages]);

  // Aktif Sohbet Canlı Mesaj Yoklama (Her 1.5 saniyede buluttan çek)
  useEffect(() => {
    if (!currentUser || !activeFriend) return;

    const chatPollInterval = setInterval(() => {
      loadActiveMessages();
    }, 1500);

    return () => clearInterval(chatPollInterval);
  }, [currentUser, activeFriend, loadActiveMessages]);

  // Gerçek Zamanlı Bulut Olay Dinleyicisi
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToChatEvents((eventType, data) => {
      const myName = sanitizeUsername(currentUser.username);

      // 1. Yeni Mesaj
      if (eventType === 'NEW_MESSAGE') {
        const msg = data;
        const sId = sanitizeUsername(msg.sender_username || msg.sender_id);
        const rId = sanitizeUsername(msg.receiver_username || msg.receiver_id);
        const activeName = sanitizeUsername(activeFriend?.username);

        if (
          (sId === myName && rId === activeName) ||
          (sId === activeName && rId === myName)
        ) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }

        const otherName = sId === myName ? rId : sId;
        setLastMessagesMap((prev) => ({ ...prev, [otherName]: msg }));

        if (rId === myName && sId !== activeName) {
          setUnreadCountMap((prev) => ({
            ...prev,
            [sId]: (prev[sId] || 0) + 1,
          }));
          showInfo(`@${sId} kullanıcısından yeni bir mesaj! 💬`);
        }
      }

      // 2. Yeni İstek
      else if (eventType === 'NEW_FRIEND_REQUEST' || eventType === 'REQUEST_SENT') {
        reloadFriendsAndRequests();
      }

      // 3. İstek Kabul Edildi
      else if (eventType === 'FRIEND_ACCEPTED') {
        reloadFriendsAndRequests();
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.65 },
        });
        showSuccess('Sohbet isteği onaylandı! 🎉');
      }

      // 4. Sohbet Temizlendi
      else if (eventType === 'CHAT_CLEARED') {
        loadActiveMessages();
      }

      // 5. Arka Plan Senkronizasyonu
      else if (eventType === 'SYNC_REFRESH') {
        reloadFriendsAndRequests();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, activeFriend, reloadFriendsAndRequests, loadActiveMessages, showInfo, showSuccess]);

  // Çıkış yapma
  const handleLogout = async () => {
    if (currentUser) {
      try {
        await updateUserProfile(currentUser.username, { is_online: false });
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
          activeFriendId={sanitizeUsername(activeFriend?.username)}
          onSelectFriend={(friend) => setActiveFriend(friend)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenRequests={() => setIsRequestsOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenInstall={handleInstallClick}
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
          onChatCleared={() => {
            loadActiveMessages();
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

      {isInstallOpen && (
        <InstallAppModal
          isOpen={isInstallOpen}
          onClose={() => setIsInstallOpen(false)}
          deferredPrompt={deferredPrompt}
          onInstallPrompt={handleInstallClick}
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

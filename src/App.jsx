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
import VoiceCallModal from './components/VoiceCallModal';
import {
  getFriends,
  getFriendRequests,
  getMessagesBetween,
  updateUserProfile,
  subscribeToChatEvents,
  sanitizeUsername,
  formatDisplayName,
} from './lib/chatService';
import {
  startVoiceCall,
  startCallSignalListener,
} from './lib/callService';
import {
  requestNotificationPermission,
  showDesktopNotification,
} from './lib/notificationService';

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

  // Sesli Arama Durumları (Voice Call States)
  const [callState, setCallState] = useState({ status: 'idle', partnerUsername: null, partnerDisplayName: null });
  const [incomingCall, setIncomingCall] = useState(null);

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

  // Sesli Arama Başlatma
  const handleStartCall = async (friend) => {
    if (!currentUser || !friend) return;
    try {
      await startVoiceCall(currentUser.username, friend.username, friend.display_name);
    } catch (err) {
      showError(err.message || 'Arama başlatılamadı. Mikrofon iznini kontrol edin.');
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

  // Giriş / Kullanıcı değişimi & Bildirim İzni İsteme
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('whatsup_current_user', JSON.stringify(currentUser));
      setIsAuthOpen(false);
      reloadFriendsAndRequests();
      requestNotificationPermission(); // Masaüstü bildirim izni iste
    } else {
      localStorage.removeItem('whatsup_current_user');
      setIsAuthOpen(true);
      setFriends([]);
      setActiveFriend(null);
      setMessages([]);
    }
  }, [currentUser, reloadFriendsAndRequests]);

  // Sesli Arama Sinyal Dinleyicisi
  useEffect(() => {
    if (!currentUser) return;
    const myUsername = sanitizeUsername(currentUser.username);

    const cleanup = startCallSignalListener(
      myUsername,
      (incoming) => {
        setIncomingCall(incoming);
        showDesktopNotification(`Gelen Sesli Arama: @${incoming.callerUsername}`, {
          body: 'Sizi WhatsApp sesli araması ile arıyor...',
          tag: 'voice-call-incoming',
        });
      },
      (state) => {
        setCallState(state);
      }
    );

    return () => cleanup && cleanup();
  }, [currentUser]);

  // Aktif arkadaş değiştiğinde ilk yükleme
  useEffect(() => {
    if (activeFriend) {
      loadActiveMessages();
    }
  }, [activeFriend, loadActiveMessages]);

  // Aktif Sohbet Canlı Mesaj Yoklama (1.5s Polling)
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

        // Masaüstü ve Toast Bildirimi
        if (rId === myName && sId !== activeName) {
          setUnreadCountMap((prev) => ({
            ...prev,
            [sId]: (prev[sId] || 0) + 1,
          }));
          showInfo(`@${sId} kullanıcısından yeni bir mesaj! 💬`);

          // Masaüstü Sistem Bildirimi Fırlat
          showDesktopNotification(`Whatsup: @${sId}`, {
            body: msg.content,
            tag: `msg-${sId}`,
          });
        }
      }

      // 2. Yeni İstek
      else if (eventType === 'NEW_FRIEND_REQUEST' || eventType === 'REQUEST_SENT') {
        reloadFriendsAndRequests();
        if (eventType === 'NEW_FRIEND_REQUEST') {
          showDesktopNotification('Yeni Sohbet İsteği!', {
            body: 'Bir kullanıcı sizinle mesajlaşmak için istek gönderdi.',
          });
        }
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
          onStartCall={handleStartCall}
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

      {/* Sesli Arama Ekranı (WebRTC Voice Call) */}
      <VoiceCallModal
        callState={callState}
        incomingCall={incomingCall}
        currentUser={currentUser}
        onClearIncomingCall={() => setIncomingCall(null)}
      />
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#0b141a] text-white p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center text-2xl font-bold">
            ⚠️
          </div>
          <h2 className="text-xl font-bold">Bir görüntüleme hatası oluştu</h2>
          <p className="text-xs text-gray-400 max-w-sm">
            Sayfa otomatik olarak kurtarılabilir. Lütfen aşağıdaki butona basarak sohbeti yenileyin.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="px-6 py-2.5 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] font-bold text-sm rounded-xl transition-transform active:scale-95 cursor-pointer shadow-lg"
          >
            Sohbeti Yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <MainApp />
      </ToastProvider>
    </ErrorBoundary>
  );
}

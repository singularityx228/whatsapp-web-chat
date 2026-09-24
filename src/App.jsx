import React, { useState, useEffect, useCallback } from 'react';
import { ToastProvider, useToast } from './components/Toast';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import AuthModal from './components/AuthModal';
import UserSearchModal from './components/UserSearchModal';
import FriendRequestsModal from './components/FriendRequestsModal';
import UserProfileModal from './components/UserProfileModal';
import {
  initRealtimeCloud,
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
        getFriends(currentUser.id),
        getFriendRequests(currentUser.id),
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
      const msgs = await getMessagesBetween(currentUser.id, activeFriend.id);
      setMessages(msgs);
      setUnreadCountMap((prev) => ({ ...prev, [activeFriend.id]: 0 }));
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, [currentUser, activeFriend]);

  // Giriş / Kullanıcı değişimi
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('whatsup_current_user', JSON.stringify(currentUser));
      setIsAuthOpen(false);
      initRealtimeCloud(currentUser);
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
      if (eventType === 'NEW_MESSAGE') {
        const msg = data;
        if (
          (msg.sender_id === currentUser.id && msg.receiver_id === activeFriend?.id) ||
          (msg.sender_id === activeFriend?.id && msg.receiver_id === currentUser.id)
        ) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }

        const otherId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
        setLastMessagesMap((prev) => ({ ...prev, [otherId]: msg }));

        if (msg.receiver_id === currentUser.id && msg.sender_id !== activeFriend?.id) {
          setUnreadCountMap((prev) => ({
            ...prev,
            [msg.sender_id]: (prev[msg.sender_id] || 0) + 1,
          }));
          showInfo('Yeni bir mesajınız var 💬');
        }
      } else if (eventType === 'NEW_FRIEND_REQUEST') {
        reloadFriendsAndRequests();
        showInfo('Yeni bir sohbet isteğiniz var! 🔔');
      } else if (eventType === 'FRIEND_REQUEST_ACCEPTED') {
        reloadFriendsAndRequests();
        showSuccess('Sohbet isteğiniz kabul edildi! 🎉');
      } else if (eventType === 'USER_STATUS') {
        setFriends((prev) =>
          prev.map((f) => (f.id === data.id || f.username === data.username ? { ...f, ...data } : f))
        );
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
        await updateUserProfile(currentUser.id, { is_online: false, last_seen: new Date().toISOString() });
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
          activeFriendId={activeFriend?.id}
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
          onMessageSent={() => reloadFriendsAndRequests()}
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
          onUpdated={() => reloadFriendsAndRequests()}
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

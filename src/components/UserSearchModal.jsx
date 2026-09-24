import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Check, Clock, X, UserCheck, Sparkles, Loader2 } from 'lucide-react';
import Avatar from './Avatar';
import { searchUsers, sendFriendRequest } from '../lib/chatService';
import { useToast } from './Toast';

export default function UserSearchModal({ isOpen, onClose, currentUser, friends = [], onFriendRequestSent }) {
  const { showSuccess, showError } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [requestStatusMap, setRequestStatusMap] = useState({});

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Arama Tetikleme
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await searchUsers(query, currentUser?.id);
        setResults(data);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, currentUser?.id]);

  if (!isOpen) return null;

  const handleSendRequest = async (user) => {
    try {
      setRequestStatusMap((prev) => ({ ...prev, [user.id]: 'loading' }));
      const res = await sendFriendRequest(currentUser.id, user.id, user);
      
      if (res.autoAccepted) {
        showSuccess(`${user.display_name} ile arkadaş oldunuz! 🎉`);
        setRequestStatusMap((prev) => ({ ...prev, [user.id]: 'accepted' }));
      } else {
        showSuccess(`${user.display_name} kullanıcısına sohbet isteği gönderildi! ✉️`);
        setRequestStatusMap((prev) => ({ ...prev, [user.id]: 'sent' }));
      }

      onFriendRequestSent && onFriendRequestSent();
    } catch (err) {
      showError(err.message || 'İstek gönderilemedi.');
      setRequestStatusMap((prev) => ({ ...prev, [user.id]: 'error' }));
    }
  };

  const isAlreadyFriend = (userId, username) => {
    return friends.some(
      (f) =>
        f.id === userId ||
        f.username?.toLowerCase() === username?.toLowerCase()
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-[#111b21] border border-[#222e35] rounded-3xl shadow-2xl overflow-hidden text-[#e9edef] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#2a3942]">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#00a884]" />
            <h3 className="font-semibold text-base">Kullanıcı Bul ve İstek Gönder</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-4 border-b border-[#222e35]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8696a0]" />
            <input
              type="text"
              placeholder="Arkadaşının kullanıcı adını yaz (örn: ahmet)"
              value={query}
              onChange={(e) => setQuery(e.target.value.toLowerCase())}
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 bg-[#202c33] border border-[#2a3942] rounded-xl text-white text-sm focus:outline-none focus:border-[#00a884] placeholder:text-gray-500 transition-colors font-mono"
            />
            {loading && (
              <Loader2 className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[#00a884] animate-spin" />
            )}
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-[#222e35]/50">
          {query.trim().length < 2 && (
            <div className="text-center py-10 text-[#8696a0]">
              <Sparkles className="w-8 h-8 mx-auto mb-2 text-[#00a884]/60" />
              <p className="text-sm font-medium">Eklemek istediğiniz kişinin kullanıcı adını yazın</p>
              <p className="text-xs text-[#8696a0]/70 mt-1">İstek gönderip kabul edildiğinde anında mesajlaşabilirsiniz</p>
            </div>
          )}

          {query.trim().length >= 2 && !loading && results.length === 0 && (
            <div className="text-center py-10 text-[#8696a0]">
              <p className="text-sm">"{query}" ile eşleşen kullanıcı bulunamadı.</p>
            </div>
          )}

          {results.map((user) => {
            const alreadyFriend = isAlreadyFriend(user.id, user.username);
            const status = requestStatusMap[user.id];

            return (
              <div
                key={user.id}
                className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    name={user.display_name || user.username}
                    seed={user.avatar_seed || user.username}
                    size="md"
                    isOnline={user.is_online}
                    showStatus={true}
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-[#e9edef] truncate">
                      {user.display_name || user.username}
                    </h4>
                    <p className="text-xs text-[#8696a0] font-mono truncate">
                      @{user.username}
                    </p>
                    {user.bio && (
                      <p className="text-[11px] text-[#8696a0]/80 truncate mt-0.5 max-w-[180px]">
                        {user.bio}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {alreadyFriend || status === 'accepted' ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00a884]/15 text-[#00a884] text-xs font-semibold">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Arkadaşsınız</span>
                    </span>
                  ) : status === 'sent' ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#202c33] text-gray-300 text-xs font-semibold border border-[#2a3942]">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>İstek Gönderildi</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSendRequest(user)}
                      disabled={status === 'loading'}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] rounded-full text-xs font-bold transition-all transform active:scale-95 shadow cursor-pointer disabled:opacity-50"
                    >
                      {status === 'loading' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      <span>İstek Gönder</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

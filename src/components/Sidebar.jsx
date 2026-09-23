import React, { useState } from 'react';
import {
  MessageSquarePlus,
  Search,
  Bell,
  UserPlus,
  User,
  CheckCheck,
} from 'lucide-react';
import Avatar from './Avatar';

export default function Sidebar({
  currentUser,
  friends = [],
  activeFriendId,
  onSelectFriend,
  onOpenSearch,
  onOpenRequests,
  onOpenProfile,
  pendingRequestsCount = 0,
  lastMessagesMap = {},
  unreadCountMap = {},
}) {
  const [filterQuery, setFilterQuery] = useState('');

  const filteredFriends = friends.filter((friend) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      friend.display_name?.toLowerCase().includes(q) ||
      friend.username?.toLowerCase().includes(q)
    );
  });

  const formatMessageTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#111b21] border-r border-[#222e35] select-none text-[#e9edef]">
      {/* Top Bar Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#202c33] border-b border-[#2a3942]">
        {/* User Info / Profile trigger */}
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-3 p-1.5 -ml-1.5 rounded-xl hover:bg-[#2a3942]/60 transition-colors text-left group cursor-pointer"
          title="Profili Düzenle"
        >
          <Avatar
            name={currentUser?.display_name || currentUser?.username}
            seed={currentUser?.avatar_seed || currentUser?.username}
            size="sm"
            isOnline={true}
            showStatus={true}
          />
          <div className="hidden sm:block min-w-0">
            <h3 className="text-sm font-bold text-[#e9edef] truncate group-hover:text-[#00a884] transition-colors">
              {currentUser?.display_name}
            </h3>
            <p className="text-[11px] text-[#8696a0] font-mono truncate">
              @{currentUser?.username}
            </p>
          </div>
        </button>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Add User / Search */}
          <button
            onClick={onOpenSearch}
            title="Kullanıcı Bul ve Ekle"
            className="p-2.5 text-[#aebac1] hover:text-[#00a884] hover:bg-[#2a3942] rounded-full transition-colors relative cursor-pointer"
          >
            <UserPlus className="w-5 h-5" />
          </button>

          {/* Friend Requests Bell */}
          <button
            onClick={onOpenRequests}
            title="Sohbet İstekleri"
            className="p-2.5 text-[#aebac1] hover:text-[#00a884] hover:bg-[#2a3942] rounded-full transition-colors relative cursor-pointer"
          >
            <Bell className="w-5 h-5" />
            {pendingRequestsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-[#00a884] text-[#111b21] rounded-full text-[10px] font-extrabold flex items-center justify-center animate-pulse">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          {/* Profile Quick Button */}
          <button
            onClick={onOpenProfile}
            title="Profilim"
            className="p-2.5 text-[#aebac1] hover:text-[#00a884] hover:bg-[#2a3942] rounded-full transition-colors cursor-pointer"
          >
            <User className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search in Chats */}
      <div className="p-2.5 bg-[#111b21] border-b border-[#222e35]">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8696a0]" />
          <input
            type="text"
            placeholder="Sohbetlerde ara veya filtrele"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#202c33] border border-transparent focus:border-[#00a884]/60 rounded-xl text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#222e35]/30">
        {filteredFriends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 p-6 text-center text-[#8696a0]">
            {friends.length === 0 ? (
              <>
                <div className="w-14 h-14 rounded-2xl bg-[#202c33] flex items-center justify-center text-[#00a884] mb-3 shadow-inner">
                  <UserPlus className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-semibold text-gray-200">Henüz sohbetiniz yok</h4>
                <p className="text-xs text-[#8696a0] mt-1 max-w-[220px]">
                  Yukarıdaki <strong>+ kişi ekle</strong> butonuna basarak arkadaşlarınızın kullanıcı adını aratın.
                </p>
                <button
                  onClick={onOpenSearch}
                  className="mt-4 px-4 py-2 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] text-xs font-bold rounded-xl shadow transition-transform active:scale-95 cursor-pointer"
                >
                  Kullanıcı Ara ve Ekle
                </button>
              </>
            ) : (
              <p className="text-sm">"{filterQuery}" ile eşleşen sohbet yok.</p>
            )}
          </div>
        ) : (
          filteredFriends.map((friend) => {
            const isActive = activeFriendId === friend.id;
            const lastMsg = lastMessagesMap[friend.id];
            const unread = unreadCountMap[friend.id] || 0;
            const isLastMsgMine = lastMsg?.sender_id === currentUser?.id;

            return (
              <div
                key={friend.id}
                onClick={() => onSelectFriend(friend)}
                className={`flex items-center gap-3.5 px-3.5 py-3 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[#2a3942]'
                    : 'hover:bg-[#202c33]/70 active:bg-[#202c33]'
                }`}
              >
                <Avatar
                  name={friend.display_name || friend.username}
                  seed={friend.avatar_seed || friend.username}
                  size="md"
                  isOnline={friend.is_online}
                  showStatus={true}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-[#e9edef] truncate">
                      {friend.display_name || friend.username}
                    </h4>
                    {lastMsg?.created_at && (
                      <span className={`text-[11px] flex-shrink-0 ${unread > 0 ? 'text-[#00a884] font-bold' : 'text-[#8696a0]'}`}>
                        {formatMessageTime(lastMsg.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#8696a0]">
                    <div className="flex items-center gap-1 min-w-0 pr-2">
                      {isLastMsgMine && (
                        <CheckCheck className={`w-3.5 h-3.5 flex-shrink-0 ${lastMsg?.is_read ? 'text-[#53bdeb]' : 'text-[#8696a0]'}`} />
                      )}
                      <span className="truncate">
                        {lastMsg ? lastMsg.content : `@${friend.username}`}
                      </span>
                    </div>

                    {unread > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#00a884] text-[#111b21] text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

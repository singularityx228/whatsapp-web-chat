import React, { useState } from 'react';
import { UserCheck, Check, X, Bell, Clock, Inbox, Send, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import Avatar from './Avatar';
import { respondToFriendRequest } from '../lib/chatService';
import { useToast } from './Toast';

export default function FriendRequestsModal({
  isOpen,
  onClose,
  requests = { incoming: [], outgoing: [] },
  onUpdated,
}) {
  const { showSuccess, showError } = useToast();
  const [tab, setTab] = useState('incoming');
  const [loadingMap, setLoadingMap] = useState({});

  if (!isOpen) return null;

  const triggerCelebration = () => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#00a884', '#25d366', '#34b7f1', '#ece5dd'],
    });
  };

  const handleRespond = async (requestId, status, senderName) => {
    try {
      setLoadingMap((prev) => ({ ...prev, [requestId]: true }));
      await respondToFriendRequest(requestId, status);
      
      if (status === 'accepted') {
        triggerCelebration();
        showSuccess(`${senderName || 'Kullanıcı'} ile mesajlaşmaya başlayabilirsiniz! 🎉`);
      } else {
        showSuccess('İstek reddedildi.');
      }

      onUpdated && onUpdated();
    } catch (err) {
      showError(err.message || 'İşlem başarısız oldu.');
    } finally {
      setLoadingMap((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const incomingCount = requests.incoming?.length || 0;
  const outgoingCount = requests.outgoing?.length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#111b21] border border-[#222e35] rounded-3xl shadow-2xl overflow-hidden text-[#e9edef] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#2a3942]">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-[#00a884]" />
            <h3 className="font-semibold text-base">Sohbet İstekleri</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#222e35] bg-[#182229]">
          <button
            onClick={() => setTab('incoming')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
              tab === 'incoming'
                ? 'border-[#00a884] text-[#00a884] bg-[#202c33]/50'
                : 'border-transparent text-[#8696a0] hover:text-gray-200'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Gelen İstekler</span>
            {incomingCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#00a884] text-[#111b21] text-[11px] font-bold flex items-center justify-center">
                {incomingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('outgoing')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
              tab === 'outgoing'
                ? 'border-[#00a884] text-[#00a884] bg-[#202c33]/50'
                : 'border-transparent text-[#8696a0] hover:text-gray-200'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Giden İstekler</span>
            {outgoingCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#374248] text-gray-200 text-[11px] font-bold flex items-center justify-center">
                {outgoingCount}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === 'incoming' && (
            <>
              {incomingCount === 0 ? (
                <div className="text-center py-12 text-[#8696a0]">
                  <Inbox className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">Bekleyen yeni sohbet isteğiniz yok</p>
                  <p className="text-xs text-[#8696a0]/70 mt-1">
                    Biri size kullanıcı adınızla istek gönderdiğinde burada görünecektir.
                  </p>
                </div>
              ) : (
                requests.incoming.map((req) => {
                  const sender = req.sender || {};
                  const displayName = sender.display_name || sender.username || 'Kullanıcı';
                  const username = sender.username || 'kullanici';
                  const isLoading = loadingMap[req.id];

                  return (
                    <div
                      key={req.id}
                      className="p-3.5 bg-[#202c33] border border-[#2a3942] rounded-2xl flex items-center justify-between gap-3 shadow-md"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={displayName}
                          seed={sender.avatar_seed || username}
                          size="md"
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-[#e9edef] truncate">
                            {displayName}
                          </h4>
                          <p className="text-xs text-[#00a884] font-mono truncate">
                            @{username}
                          </p>
                          <p className="text-[11px] text-[#8696a0] truncate mt-0.5">
                            Sizinle sohbet başlatmak istiyor
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRespond(req.id, 'rejected', displayName)}
                          disabled={isLoading}
                          title="Reddet"
                          className="p-2 bg-[#182229] hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRespond(req.id, 'accepted', displayName)}
                          disabled={isLoading}
                          title="Kabul Et"
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] rounded-xl text-xs font-bold shadow transition-all transform active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          {isLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          )}
                          <span>Kabul Et</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'outgoing' && (
            <>
              {outgoingCount === 0 ? (
                <div className="text-center py-12 text-[#8696a0]">
                  <Send className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">Giden bekleyen istek bulunmuyor</p>
                  <p className="text-xs text-[#8696a0]/70 mt-1">
                    Arama simgesine basıp yeni kullanıcılara istek gönderebilirsiniz.
                  </p>
                </div>
              ) : (
                requests.outgoing.map((req) => {
                  const receiver = req.receiver || {};
                  const displayName = receiver.display_name || receiver.username || 'Kullanıcı';
                  const username = receiver.username || 'kullanici';

                  return (
                    <div
                      key={req.id}
                      className="p-3.5 bg-[#202c33] border border-[#2a3942] rounded-2xl flex items-center justify-between gap-3 shadow-md"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          name={displayName}
                          seed={receiver.avatar_seed || username}
                          size="md"
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-[#e9edef] truncate">
                            {displayName}
                          </h4>
                          <p className="text-xs text-[#8696a0] font-mono truncate">
                            @{username}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#182229] border border-[#2a3942] text-xs font-medium text-amber-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Onay Bekleniyor</span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

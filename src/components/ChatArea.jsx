import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Smile,
  Copy,
  Check,
  CheckCheck,
  ArrowLeft,
  Search,
  Lock,
  Sparkles,
  MoreVertical,
  ShieldAlert,
  Trash2,
  Ban,
  UserCheck,
  Heart,
  ThumbsUp,
  Phone,
} from 'lucide-react';
import Avatar from './Avatar';
import {
  sendMessage,
  markMessagesAsRead,
  sanitizeUsername,
  formatDisplayName,
  blockUser,
  unblockUser,
  isUserBlocked,
  clearChatHistory,
  reactToMessage,
  setTypingStatus,
  checkIsPartnerTyping,
} from '../lib/chatService';
import { playMessageSentSound, playMessageReceivedSound } from '../lib/soundEffects';
import { useToast } from './Toast';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '🎉', '🚀', '🙏', '😊', '😍', '👀', '💯'];
const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

export default function ChatArea({
  currentUser,
  activeFriend,
  messages = [],
  onBack,
  onStartCall,
  onMessageSent,
  onChatCleared,
}) {
  const { showSuccess, showError, showInfo } = useToast();
  const [inputText, setInputText] = useState('');
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimerRef = useRef(null);
  const prevMsgCountRef = useRef(messages.length);

  const myUsername = sanitizeUsername(currentUser?.username);
  const friendUsername = sanitizeUsername(activeFriend?.username);
  const friendDisplayName = formatDisplayName(friendUsername, activeFriend?.display_name);

  // Blok durumu ve ses kontrolü
  useEffect(() => {
    if (activeFriend) {
      setIsBlocked(isUserBlocked(myUsername, friendUsername));
    }
  }, [activeFriend?.username, myUsername, friendUsername]);

  // Yeni mesaj geldiğinde ses çal
  useEffect(() => {
    if (Array.isArray(messages) && messages.length > prevMsgCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && typeof lastMsg === 'object') {
        const sender = sanitizeUsername(lastMsg.sender_username || lastMsg.sender_id);
        if (sender !== myUsername) {
          playMessageReceivedSound();
        }
      }
    }
    prevMsgCountRef.current = Array.isArray(messages) ? messages.length : 0;
  }, [messages?.length, myUsername]);

  // Karşı tarafın yazıyor durumunu yoklama
  useEffect(() => {
    if (!activeFriend || !currentUser) return;

    const interval = setInterval(async () => {
      const typing = await checkIsPartnerTyping(friendUsername, myUsername);
      setIsPartnerTyping(typing);
    }, 1500);

    return () => clearInterval(interval);
  }, [activeFriend?.username, friendUsername, myUsername, currentUser]);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
    if (activeFriend && currentUser) {
      markMessagesAsRead(friendUsername, myUsername);
    }
  }, [activeFriend?.username, messages.length, friendUsername, myUsername]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText || !activeFriend || !currentUser) return;

    if (isBlocked) {
      showError('Bu kullanıcıyı engellediniz. Mesaj göndermek için engeli kaldırın.');
      return;
    }

    try {
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      // Yazıyor durumunu kapat
      setTypingStatus(myUsername, friendUsername, false);

      playMessageSentSound();
      await sendMessage(myUsername, friendUsername, cleanText);
      onMessageSent && onMessageSent();
      scrollToBottom('smooth');
    } catch (err) {
      showError(err.message || 'Mesaj gönderilemedi.');
      setInputText(cleanText);
    }
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

    // Yazıyor durumunu buluta bildir
    if (!isBlocked && activeFriend) {
      setTypingStatus(myUsername, friendUsername, true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        setTypingStatus(myUsername, friendUsername, false);
      }, 2500);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopyMessage = async (msg) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      showSuccess('Mesaj panoya kopyalandı! 📋');
      setTimeout(() => {
        setCopiedMsgId(null);
      }, 2000);
    } catch {
      showError('Mesaj kopyalanamadı.');
    }
  };

  const handleToggleBlock = async () => {
    setShowOptionsMenu(false);
    try {
      if (isBlocked) {
        await unblockUser(myUsername, friendUsername);
        setIsBlocked(false);
        showSuccess(`${friendDisplayName} engeliniz kaldırıldı.`);
      } else {
        if (window.confirm(`${friendDisplayName} kullanıcısını engellemek istediğinizden emin misiniz?`)) {
          await blockUser(myUsername, friendUsername);
          setIsBlocked(true);
          showSuccess(`${friendDisplayName} engellendi.`);
        }
      }
    } catch (err) {
      showError('İşlem gerçekleştirilemedi.');
    }
  };

  const handleClearChat = async () => {
    setShowOptionsMenu(false);
    if (window.confirm('Bu sohbetteki tüm mesaj geçmişini temizlemek istediğinize emin misiniz?')) {
      try {
        await clearChatHistory(myUsername, friendUsername);
        showSuccess('Sohbet geçmişi temizlendi.');
        onChatCleared && onChatCleared();
      } catch {
        showError('Sohbet temizlenemedi.');
      }
    }
  };

  const handleReact = async (msgId, emoji) => {
    try {
      await reactToMessage(myUsername, friendUsername, msgId, emoji);
      setActiveReactionMsgId(null);
    } catch {}
  };

  const addEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDateHeader = (isoString) => {
    if (!isoString) return 'Bugün';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Bugün';
      const now = new Date();
      if (d.toDateString() === now.toDateString()) return 'Bugün';
      
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return 'Dün';

      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return 'Bugün';
    }
  };

  if (!activeFriend) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-[#222e35] text-[#8696a0] p-8 select-none border-b-8 border-[#00a884]">
        <div className="max-w-md text-center space-y-4">
          <div className="w-24 h-24 mx-auto rounded-3xl bg-[#111b21] flex items-center justify-center text-[#00a884] shadow-2xl border border-[#2a3942]">
            <Sparkles className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-light text-[#e9edef]">Whatsup Web & Masaüstü</h2>
          <p className="text-sm text-[#8696a0] leading-relaxed">
            Arkadaşlarınızla güvenli, şifreli ve engelsiz şekilde mesajlaşın. Sohbet başlatmak için soldaki listeden birini seçin veya yeni bir arkadaş ekleyin.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-[#8696a0]/80 pt-4">
            <Lock className="w-3.5 h-3.5 text-[#00a884]" />
            <span>Uçtan uca şifreli ve tüm cihazlarla %100 uyumlu</span>
          </div>
        </div>
      </div>
    );
  }

  const filteredMessages = (Array.isArray(messages) ? messages : []).filter((m) => {
    if (!m || typeof m !== 'object') return false;
    if (!searchInChat.trim()) return true;
    const content = typeof m.content === 'string' ? m.content : '';
    return content.toLowerCase().includes(searchInChat.toLowerCase());
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden select-text relative">
      {/* Top Header */}
      <div className="flex items-center justify-between px-2.5 sm:px-4 py-2 bg-[#202c33] border-b border-[#2a3942] z-20 select-none relative min-h-[56px]">
        {/* Left: Back + Avatar + User Info */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-1">
          <button
            onClick={onBack}
            className="md:hidden p-1.5 -ml-0.5 text-[#aebac1] hover:text-white rounded-lg cursor-pointer flex-shrink-0"
            title="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <Avatar
            name={friendDisplayName}
            seed={activeFriend.avatar_seed || friendUsername}
            size="sm"
            isOnline={activeFriend.is_online}
            showStatus={true}
          />

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-[#e9edef] truncate flex items-center gap-1.5">
              <span className="truncate">{friendDisplayName}</span>
              {isBlocked && (
                <span className="text-[10px] px-1.5 py-0.2 bg-red-500/20 text-red-400 rounded font-semibold flex-shrink-0">
                  Engellendi
                </span>
              )}
            </h3>
            <p className="text-xs truncate">
              {isPartnerTyping ? (
                <span className="text-[#25d366] font-semibold animate-pulse">yazıyor...</span>
              ) : activeFriend.is_online ? (
                <span className="text-[#00a884] font-medium">çevrimiçi</span>
              ) : (
                <span className="text-[#8696a0]">@{friendUsername}</span>
              )}
            </p>
          </div>
        </div>

        {/* Right: Actions (CALL BUTTON, SEARCH, OPTIONS) */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-[#aebac1] relative flex-shrink-0">
          {/* Sesli Arama Butonu - WhatsApp Yeşili Vurgulu */}
          <button
            onClick={() => onStartCall && onStartCall(activeFriend)}
            disabled={isBlocked}
            className="p-2 sm:p-2.5 rounded-full bg-[#00a884]/20 hover:bg-[#00a884]/35 text-[#00a884] hover:text-white transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center border border-[#00a884]/30"
            title="WhatsApp Sesli Arama Başlat"
          >
            <Phone className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
          </button>

          <button
            onClick={() => setShowSearchBox(!showSearchBox)}
            className={`p-2 rounded-full hover:bg-[#2a3942] hover:text-white transition-colors cursor-pointer ${
              showSearchBox ? 'text-[#00a884]' : ''
            }`}
            title="Sohbette Ara"
          >
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          <button
            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
            className="p-2 rounded-full hover:bg-[#2a3942] hover:text-white transition-colors cursor-pointer"
            title="Seçenekler"
          >
            <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Options Dropdown Menu */}
          {showOptionsMenu && (
            <div className="absolute top-11 right-0 w-48 bg-[#202c33] border border-[#2a3942] rounded-2xl shadow-2xl py-2 z-50 text-sm animate-pop-in">
              <button
                onClick={handleToggleBlock}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-red-400 hover:bg-[#111b21] transition-colors cursor-pointer"
              >
                <Ban className="w-4 h-4" />
                <span>{isBlocked ? 'Engeli Kaldır' : 'Kullanıcıyı Engelle'}</span>
              </button>

              <button
                onClick={handleClearChat}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-gray-300 hover:bg-[#111b21] transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-[#8696a0]" />
                <span>Sohbeti Temizle</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* In-Chat Search Box */}
      {showSearchBox && (
        <div className="px-4 py-2 bg-[#182229] border-b border-[#222e35] flex items-center gap-2 animate-fade-in z-10">
          <Search className="w-4 h-4 text-[#8696a0]" />
          <input
            type="text"
            placeholder="Bu sohbette ara..."
            value={searchInChat}
            onChange={(e) => setSearchInChat(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-[#8696a0]"
          />
          {searchInChat && (
            <button
              onClick={() => setSearchInChat('')}
              className="text-xs text-[#8696a0] hover:text-white px-2 py-1 rounded bg-[#202c33]"
            >
              Temizle
            </button>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-12 py-4 space-y-3 chat-bg-pattern">
        {/* End to End Encryption Badge */}
        <div className="flex justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#182229]/95 border border-[#222e35] rounded-xl text-[11px] text-[#ffd279] shadow-sm max-w-sm text-center">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 text-[#ffd279]" />
            <span>Mesajlar uçtan uca şifrelidir. Bu sohbetteki mesajları sadece siz ve <strong>{friendDisplayName}</strong> okuyabilir.</span>
          </div>
        </div>

        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#8696a0] text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884]">
              <Smile className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium">Henüz mesaj yok</p>
            <p className="text-xs max-w-xs">
              <strong>{friendDisplayName}</strong> kullanıcısına ilk selamı gönderin! 👋
            </p>
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const msgSender = sanitizeUsername(msg.sender_username || msg.sender_id);
            const isMe = msgSender === myUsername;
            const isCopied = copiedMsgId === msg.id;
            const showReactions = activeReactionMsgId === msg.id;

            let showDateHeader = false;
            try {
              if (index === 0) {
                showDateHeader = true;
              } else if (filteredMessages[index - 1]?.created_at && msg.created_at) {
                const prevD = new Date(filteredMessages[index - 1].created_at);
                const currD = new Date(msg.created_at);
                if (!isNaN(prevD.getTime()) && !isNaN(currD.getTime())) {
                  showDateHeader = prevD.toDateString() !== currD.toDateString();
                }
              }
            } catch {
              showDateHeader = false;
            }

            return (
              <React.Fragment key={msg.id || index}>
                {showDateHeader && (
                  <div className="flex justify-center my-3">
                    <span className="px-3 py-1 bg-[#182229] border border-[#222e35] text-[#8696a0] rounded-lg text-[11px] font-semibold uppercase tracking-wider shadow-sm">
                      {formatDateHeader(msg.created_at)}
                    </span>
                  </div>
                )}

                <div className={`flex items-end gap-1.5 ${isMe ? 'justify-end' : 'justify-start'} group animate-fade-in relative`}>
                  {/* Message Bubble */}
                  <div
                    className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 shadow-md transition-all text-sm leading-relaxed ${
                      isMe
                        ? 'bg-[#005c4b] text-[#e9edef] bubble-outgoing'
                        : 'bg-[#202c33] text-[#e9edef] bubble-incoming'
                    }`}
                  >
                    {/* Reaction Floating Picker */}
                    {showReactions && (
                      <div className="absolute -top-10 left-0 bg-[#111b21] border border-[#2a3942] rounded-full p-1 flex items-center gap-1 shadow-2xl z-30 animate-pop-in">
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(msg.id, emoji)}
                            className="text-base p-1 hover:scale-125 transition-transform cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Message Content & Action Icons */}
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap break-words word-break flex-1 select-text">
                        {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')}
                      </p>

                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0 -mr-1 -mt-0.5">
                        {/* Reaction Trigger */}
                        <button
                          onClick={() => setActiveReactionMsgId(showReactions ? null : msg.id)}
                          title="Tepki Ver"
                          className="p-1 rounded hover:bg-black/20 text-[#aebac1] hover:text-white cursor-pointer"
                        >
                          <Smile className="w-3.5 h-3.5" />
                        </button>

                        {/* COPY BUTTON */}
                        <button
                          onClick={() => handleCopyMessage(msg)}
                          title="Mesajı Kopyala"
                          className="p-1 rounded hover:bg-black/20 text-[#aebac1] hover:text-white cursor-pointer"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-[#25d366]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Reactions Display */}
                    {msg.reactions && typeof msg.reactions === 'object' && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {Object.entries(msg.reactions).map(([user, emo]) => (
                          <span
                            key={user}
                            className="inline-flex items-center px-1.5 py-0.5 bg-[#111b21]/80 rounded-full text-xs shadow-sm border border-[#2a3942]"
                          >
                            {emo}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer: Time + Read Receipts */}
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-[#8696a0] select-none">
                      {isCopied && (
                        <span className="text-[#25d366] font-bold text-[9px] mr-1 animate-pulse">
                          Kopyalandı!
                        </span>
                      )}
                      <span>{formatTime(msg.created_at)}</span>
                      {isMe && (
                        <span>
                          <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Blocked Banner or Normal Input Bar */}
      {isBlocked ? (
        <div className="p-4 bg-[#182229] border-t border-[#222e35] flex items-center justify-between text-xs text-red-400">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 flex-shrink-0" />
            <span>Bu kullanıcıyı engellediniz. Mesaj göndermek için engeli kaldırın.</span>
          </div>
          <button
            onClick={handleToggleBlock}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold rounded-lg cursor-pointer"
          >
            Engeli Kaldır
          </button>
        </div>
      ) : (
        <>
          {/* Quick Emoji Bar */}
          {showEmojiBar && (
            <div className="px-4 py-2 bg-[#202c33] border-t border-[#2a3942] flex items-center gap-2 overflow-x-auto animate-fade-in">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => addEmoji(emoji)}
                  className="text-xl p-1.5 hover:bg-[#2a3942] rounded-lg transition-transform hover:scale-125 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Chat Input Form */}
          <form
            onSubmit={handleSend}
            className="flex items-end gap-2 px-3 sm:px-4 py-2.5 bg-[#202c33] border-t border-[#2a3942] select-none"
          >
            <button
              type="button"
              onClick={() => setShowEmojiBar(!showEmojiBar)}
              className={`p-2.5 rounded-full hover:bg-[#2a3942] transition-colors cursor-pointer ${
                showEmojiBar ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-white'
              }`}
              title="Emojiler"
            >
              <Smile className="w-6 h-6" />
            </button>

            <div className="flex-1 bg-[#2a3942] rounded-2xl px-4 py-2 border border-transparent focus-within:border-[#00a884]/50 transition-colors">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Bir mesaj yazın (Shift+Enter ile yeni satır)..."
                className="w-full bg-transparent text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none resize-none max-h-28 overflow-y-auto"
              />
            </div>

            {inputText.trim() ? (
              <button
                type="submit"
                className="p-3 rounded-full bg-[#00a884] hover:bg-[#008f72] text-[#111b21] transition-transform active:scale-95 shadow-md cursor-pointer flex-shrink-0"
                title="Gönder"
              >
                <Send className="w-5 h-5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => addEmoji('👍')}
                className="p-3 rounded-full text-[#8696a0] hover:text-[#00a884] hover:bg-[#2a3942] transition-colors cursor-pointer flex-shrink-0"
                title="Beğeni gönder"
              >
                <span className="text-xl leading-none">👍</span>
              </button>
            )}
          </form>
        </>
      )}
    </div>
  );
}

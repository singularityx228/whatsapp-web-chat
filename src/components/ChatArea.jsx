import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Smile,
  Copy,
  Check,
  CheckCheck,
  ArrowLeft,
  MoreVertical,
  Search,
  Phone,
  Video,
  Lock,
  Paperclip,
  Mic,
  Sparkles,
} from 'lucide-react';
import Avatar from './Avatar';
import { sendMessage, markMessagesAsRead } from '../lib/supabaseClient';
import { useToast } from './Toast';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '🎉', '🚀', '🙏', '😊', '😍', '👀', '💯'];

export default function ChatArea({
  currentUser,
  activeFriend,
  messages = [],
  onBack,
  onMessageSent,
}) {
  const { showSuccess, showError } = useToast();
  const [inputText, setInputText] = useState('');
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Otomatik aşağı kaydırma
  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
    if (activeFriend && currentUser) {
      markMessagesAsRead(activeFriend.id, currentUser.id);
    }
  }, [activeFriend?.id, messages.length]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const cleanText = inputText.trim();
    if (!cleanText || !activeFriend || !currentUser) return;

    try {
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      await sendMessage(currentUser.id, activeFriend.id, cleanText);
      onMessageSent && onMessageSent();
      scrollToBottom('smooth');
    } catch (err) {
      showError(err.message || 'Mesaj gönderilemedi.');
      setInputText(cleanText); // Geri yükle
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

  const addEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  // Tarih gruplama formatlayıcı
  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDateHeader = (isoString) => {
    try {
      const d = new Date(isoString);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) return 'Bugün';
      
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return 'Dün';

      return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  };

  if (!activeFriend) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-[#222e35] text-[#8696a0] p-8 select-none border-b-8 border-[#00a884]">
        <div className="max-w-md text-center space-y-4">
          <div className="w-24 h-24 mx-auto rounded-3xl bg-[#111b21] flex items-center justify-center text-[#00a884] shadow-2xl border border-[#2a3942]">
            <Sparkles className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-light text-[#e9edef]">Whatsup Web'e Hoş Geldiniz</h2>
          <p className="text-sm text-[#8696a0] leading-relaxed">
            Arkadaşlarınızla güvenli, hızlı ve engelsiz şekilde mesajlaşın. Sohbet başlatmak için soldaki listeden birini seçin veya yeni bir arkadaş ekleyin.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-[#8696a0]/80 pt-4">
            <Lock className="w-3.5 h-3.5" />
            <span>Tüm platformlar ve cihazlarla %100 uyumlu</span>
          </div>
        </div>
      </div>
    );
  }

  // Arama filtresi
  const filteredMessages = messages.filter((m) => {
    if (!searchInChat.trim()) return true;
    return m.content?.toLowerCase().includes(searchInChat.toLowerCase());
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] overflow-hidden select-text relative">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#202c33] border-b border-[#2a3942] z-10 select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Back Button */}
          <button
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 text-[#aebac1] hover:text-white rounded-lg cursor-pointer"
            title="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <Avatar
            name={activeFriend.display_name || activeFriend.username}
            seed={activeFriend.avatar_seed || activeFriend.username}
            size="sm"
            isOnline={activeFriend.is_online}
            showStatus={true}
          />

          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#e9edef] truncate">
              {activeFriend.display_name || activeFriend.username}
            </h3>
            <p className="text-xs text-[#8696a0] truncate">
              {activeFriend.is_online ? (
                <span className="text-[#00a884] font-medium">çevrimiçi</span>
              ) : (
                `@${activeFriend.username}`
              )}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1 text-[#aebac1]">
          <button
            onClick={() => setShowSearchBox(!showSearchBox)}
            className={`p-2 rounded-full hover:bg-[#2a3942] hover:text-white transition-colors cursor-pointer ${
              showSearchBox ? 'text-[#00a884]' : ''
            }`}
            title="Sohbette Ara"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* In-Chat Search Box */}
      {showSearchBox && (
        <div className="px-4 py-2 bg-[#182229] border-b border-[#222e35] flex items-center gap-2 animate-fade-in">
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
        {/* End to end encryption notice */}
        <div className="flex justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#182229]/90 border border-[#222e35] rounded-lg text-[11px] text-[#ffd279] shadow-sm max-w-sm text-center">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Mesajlar Supabase gerçek zamanlı sunucusu üzerinden anında iletilir.</span>
          </div>
        </div>

        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#8696a0] text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-[#202c33] flex items-center justify-center text-[#00a884]">
              <Smile className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium">Henüz mesaj yok</p>
            <p className="text-xs max-w-xs">
              <strong>{activeFriend.display_name}</strong> kullanıcısına ilk selamı gönderin! 👋
            </p>
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const isMe = msg.sender_id === currentUser.id;
            const isCopied = copiedMsgId === msg.id;

            // Gün ayracı
            const showDateHeader =
              index === 0 ||
              new Date(messages[index - 1].created_at).toDateString() !==
                new Date(msg.created_at).toDateString();

            return (
              <React.Fragment key={msg.id || index}>
                {showDateHeader && (
                  <div className="flex justify-center my-3">
                    <span className="px-3 py-1 bg-[#182229] border border-[#222e35] text-[#8696a0] rounded-lg text-[11px] font-semibold uppercase tracking-wider shadow-sm">
                      {formatDateHeader(msg.created_at)}
                    </span>
                  </div>
                )}

                <div className={`flex items-end gap-1.5 ${isMe ? 'justify-end' : 'justify-start'} group animate-fade-in`}>
                  {/* Message Bubble */}
                  <div
                    className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 shadow-md transition-all text-sm leading-relaxed ${
                      isMe
                        ? 'bg-[#005c4b] text-[#e9edef] bubble-outgoing'
                        : 'bg-[#202c33] text-[#e9edef] bubble-incoming'
                    }`}
                  >
                    {/* Message Content & Copy Icon Header */}
                    <div className="flex items-start justify-between gap-3">
                      <p className="whitespace-pre-wrap break-words word-break flex-1 select-text">
                        {msg.content}
                      </p>

                      {/* COPY BUTTON (EN ÖNEMLİ İSTEK) */}
                      <button
                        onClick={() => handleCopyMessage(msg)}
                        title="Mesajı Kopyala"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -mr-1 -mt-0.5 rounded hover:bg-black/20 text-[#aebac1] hover:text-white cursor-pointer flex-shrink-0"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-[#25d366]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Footer: Time + Read Receipts + Copied badge */}
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-[#8696a0] select-none">
                      {isCopied && (
                        <span className="text-[#25d366] font-bold text-[9px] mr-1 animate-pulse">
                          Kopyalandı!
                        </span>
                      )}
                      <span>{formatTime(msg.created_at)}</span>
                      {isMe && (
                        <span>
                          {msg.is_read ? (
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-[#8696a0]" />
                          )}
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

      {/* Chat Input Bar */}
      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 px-3 sm:px-4 py-2.5 bg-[#202c33] border-t border-[#2a3942] select-none"
      >
        {/* Emoji Button */}
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

        {/* Text Input */}
        <div className="flex-1 bg-[#2a3942] rounded-2xl px-4 py-2 border border-transparent focus-within:border-[#00a884]/50 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Bir mesaj yazın (Shift+Enter ile yeni satır)..."
            className="w-full bg-transparent text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none resize-none max-h-28 overflow-y-auto"
          />
        </div>

        {/* Send Button */}
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
    </div>
  );
}

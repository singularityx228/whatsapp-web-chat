import React, { useState } from 'react';
import { MessageSquare, User, AtSign, ArrowRight, Sparkles } from 'lucide-react';
import Avatar from './Avatar';
import { loginOrCreateUser } from '../lib/chatService';
import { useToast } from './Toast';

const PRESET_AVATARS = ['Felix', 'Luna', 'Nova', 'Leo', 'Milo', 'Zara', 'Oliver', 'Bella'];

export default function AuthModal({ onLoginSuccess }) {
  const { showSuccess, showError } = useToast();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('Felix');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username.trim()) {
      showError('Lütfen geçerli bir kullanıcı adı girin.');
      return;
    }

    try {
      setIsLoading(true);
      const user = await loginOrCreateUser(username, displayName || username);
      user.avatar_seed = selectedAvatar;
      showSuccess(`Hoş geldin, ${user.display_name}! 🎉`);
      onLoginSuccess(user);
    } catch (err) {
      console.error('Login error:', err);
      showError(`Giriş yapılamadı: ${err.message || 'Lütfen tekrar deneyin.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#0b141a]/95 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#111b21] border border-[#222e35] rounded-3xl shadow-2xl overflow-hidden text-[#e9edef]">
        <div className="h-2 bg-gradient-to-r from-[#00a884] to-[#25d366]" />

        <div className="p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#00a884]/15 text-[#00a884] mb-3 shadow-inner">
              <MessageSquare className="w-8 h-8 fill-current" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Whatsup Web</h2>
            <p className="text-sm text-[#8696a0] mt-1">
              Engelsiz, her cihazda çalışan anlık mesajlaşma
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col items-center justify-center py-2">
              <Avatar
                name={displayName || username || 'U'}
                seed={selectedAvatar}
                size="xl"
                className="ring-4 ring-[#00a884]/30 mb-3 transition-transform duration-300 hover:scale-105"
              />
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1">
                {PRESET_AVATARS.map((seed) => (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => setSelectedAvatar(seed)}
                    className={`w-7 h-7 rounded-full overflow-hidden transition-all cursor-pointer ${
                      selectedAvatar === seed ? 'ring-2 ring-[#00a884] scale-110' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    <Avatar name={seed} seed={seed} size="xs" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8696a0] mb-1.5 uppercase tracking-wider">
                Kullanıcı Adı <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8696a0]" />
                <input
                  type="text"
                  placeholder="ornek: ahmet"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  required
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 bg-[#202c33] border border-[#2a3942] rounded-xl text-white text-sm focus:outline-none focus:border-[#00a884] transition-all placeholder:text-gray-500 font-mono"
                />
              </div>
              <span className="text-[11px] text-[#8696a0] mt-1 block">
                Arkadaşlarınız sizi bu kullanıcı adı ile bulup istek gönderecek.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8696a0] mb-1.5 uppercase tracking-wider">
                Görünen İsim (İsteğe Bağlı)
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8696a0]" />
                <input
                  type="text"
                  placeholder="Ahmet Yılmaz"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#202c33] border border-[#2a3942] rounded-xl text-white text-sm focus:outline-none focus:border-[#00a884] transition-all placeholder:text-gray-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] rounded-xl font-bold text-sm shadow-xl transition-all transform active:scale-[0.98] disabled:opacity-60 mt-4 cursor-pointer"
            >
              <span>{isLoading ? 'Giriş Yapılıyor...' : 'Sohbete Başla'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#222e35] flex items-center justify-center text-xs text-[#8696a0]">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#00a884]" /> %100 Her Cihaz ve Ağla Uyumlu
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

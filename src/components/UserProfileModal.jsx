import React, { useState } from 'react';
import { User, AtSign, FileText, Check, X, LogOut, Sparkles, Loader2 } from 'lucide-react';
import Avatar from './Avatar';
import { updateUserProfile } from '../lib/supabaseClient';
import { useToast } from './Toast';

const PRESET_AVATARS = ['Felix', 'Luna', 'Nova', 'Leo', 'Milo', 'Zara', 'Oliver', 'Bella', 'Gizmo', 'Sammy', 'Casper', 'Pepper'];

export default function UserProfileModal({ isOpen, onClose, currentUser, onUserUpdated, onLogout }) {
  const { showSuccess, showError } = useToast();
  const [displayName, setDisplayName] = useState(currentUser?.display_name || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarSeed, setAvatarSeed] = useState(currentUser?.avatar_seed || currentUser?.username || 'Felix');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen || !currentUser) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      showError('Görünen isim boş bırakılamaz.');
      return;
    }

    try {
      setIsSaving(true);
      const updated = await updateUserProfile(currentUser.id, {
        display_name: displayName.trim(),
        bio: bio.trim(),
        avatar_seed: avatarSeed,
      });

      showSuccess('Profiliniz güncellendi! ✨');
      onUserUpdated && onUserUpdated(updated);
      onClose();
    } catch (err) {
      showError(err.message || 'Profil güncellenemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-[#111b21] border border-[#222e35] rounded-3xl shadow-2xl overflow-hidden text-[#e9edef]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#2a3942]">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#00a884]" />
            <h3 className="font-semibold text-base">Profilim & Ayarlar</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Avatar preview and picker */}
          <div className="flex flex-col items-center">
            <Avatar
              name={displayName || currentUser.username}
              seed={avatarSeed}
              size="xl"
              className="ring-4 ring-[#00a884]/40 mb-3 shadow-lg"
            />
            <p className="text-xs text-[#8696a0] mb-2">Avatar Seçin</p>
            <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-2 px-1">
              {PRESET_AVATARS.map((seed) => (
                <button
                  key={seed}
                  type="button"
                  onClick={() => setAvatarSeed(seed)}
                  className={`w-8 h-8 rounded-full overflow-hidden transition-all cursor-pointer ${
                    avatarSeed === seed ? 'ring-2 ring-[#00a884] scale-110' : 'opacity-50 hover:opacity-100'
                  }`}
                >
                  <Avatar name={seed} seed={seed} size="xs" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8696a0] mb-1.5 uppercase tracking-wider">
              Kullanıcı Adı (Değiştirilemez)
            </label>
            <div className="relative">
              <AtSign className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8696a0]" />
              <input
                type="text"
                value={currentUser.username}
                disabled
                className="w-full pl-10 pr-4 py-2.5 bg-[#182229] border border-[#222e35] rounded-xl text-[#8696a0] text-sm font-mono cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8696a0] mb-1.5 uppercase tracking-wider">
              Görünen İsim
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8696a0]" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 bg-[#202c33] border border-[#2a3942] rounded-xl text-white text-sm focus:outline-none focus:border-[#00a884] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8696a0] mb-1.5 uppercase tracking-wider">
              Durum / Hakkımda
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-3.5 top-3 text-[#8696a0]" />
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Örn: Hey! Ben de buradayım 👋"
                className="w-full pl-10 pr-4 py-2 bg-[#202c33] border border-[#2a3942] rounded-xl text-white text-sm focus:outline-none focus:border-[#00a884] transition-colors resize-none"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Çıkış Yap</span>
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] rounded-xl text-sm font-bold shadow-lg transition-all transform active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

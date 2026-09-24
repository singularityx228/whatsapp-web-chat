import React, { useState, useEffect } from 'react';
import { User, AtSign, FileText, Check, X, LogOut, Ban, Sparkles, Loader2, ShieldCheck } from 'lucide-react';
import Avatar from './Avatar';
import { updateUserProfile, getBlockedUsers, unblockUser, sanitizeUsername, formatDisplayName } from '../lib/chatService';
import { useToast } from './Toast';

const PRESET_AVATARS = ['Felix', 'Luna', 'Nova', 'Leo', 'Milo', 'Zara', 'Oliver', 'Bella', 'Gizmo', 'Sammy', 'Casper', 'Pepper'];

export default function UserProfileModal({ isOpen, onClose, currentUser, onUserUpdated, onLogout }) {
  const { showSuccess, showError } = useToast();
  const [displayName, setDisplayName] = useState(currentUser?.display_name || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [avatarSeed, setAvatarSeed] = useState(currentUser?.avatar_seed || currentUser?.username || 'Felix');
  const [isSaving, setIsSaving] = useState(false);
  const [blockedList, setBlockedList] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setBlockedList(getBlockedUsers());
    }
  }, [isOpen]);

  if (!isOpen || !currentUser) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      showError('Görünen isim boş bırakılamaz.');
      return;
    }

    try {
      setIsSaving(true);
      const updated = await updateUserProfile(currentUser.username, {
        display_name: displayName.trim(),
        bio: bio.trim(),
        avatar_seed: avatarSeed,
      });

      showSuccess('Profiliniz güncellendi! ✨');
      onUserUpdated && onUserUpdated(updated || { ...currentUser, display_name: displayName.trim(), bio: bio.trim(), avatar_seed: avatarSeed });
      onClose();
    } catch (err) {
      showError(err.message || 'Profil güncellenemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnblock = async (blockedUsername) => {
    try {
      const updated = await unblockUser(currentUser.username, blockedUsername);
      setBlockedList([...updated]);
      showSuccess(`@${blockedUsername} engeli kaldırıldı.`);
    } catch {
      showError('Engel kaldırılamadı.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-[#111b21] border border-[#222e35] rounded-3xl shadow-2xl overflow-hidden text-[#e9edef] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#2a3942]">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#00a884]" />
            <h3 className="font-semibold text-base">Profil & Gizlilik Ayarları</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <form onSubmit={handleSave} className="space-y-4">
            {/* Avatar preview and picker */}
            <div className="flex flex-col items-center">
              <Avatar
                name={displayName || currentUser.username}
                seed={avatarSeed}
                size="xl"
                className="ring-4 ring-[#00a884]/40 mb-3 shadow-lg"
              />
              <p className="text-xs text-[#8696a0] mb-2">Avatarınızı Seçin</p>
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
                Kullanıcı Adı (Benzersiz)
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#00a884]" />
                <input
                  type="text"
                  value={currentUser.username}
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 bg-[#182229] border border-[#222e35] rounded-xl text-[#00a884] text-sm font-mono cursor-not-allowed font-bold"
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
                Hakkımda / Durum
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 absolute left-3.5 top-3 text-[#8696a0]" />
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Örn: Hey! Ben de Whatsup kullanıyorum 👋"
                  className="w-full pl-10 pr-4 py-2 bg-[#202c33] border border-[#2a3942] rounded-xl text-white text-sm focus:outline-none focus:border-[#00a884] transition-colors resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] rounded-xl text-sm font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}</span>
            </button>
          </form>

          {/* Engellenen Kişiler Bölümü */}
          <div className="pt-4 border-t border-[#222e35] space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider">
              <Ban className="w-4 h-4" />
              <span>Engellenen Kişiler ({blockedList.length})</span>
            </div>

            {blockedList.length === 0 ? (
              <p className="text-xs text-[#8696a0] py-1">Engellenen herhangi bir kullanıcı yok.</p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {blockedList.map((blockedUser) => (
                  <div
                    key={blockedUser}
                    className="flex items-center justify-between p-2.5 bg-[#182229] border border-[#222e35] rounded-xl text-xs"
                  >
                    <span className="font-mono text-gray-200">@{blockedUser}</span>
                    <button
                      type="button"
                      onClick={() => handleUnblock(blockedUser)}
                      className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg font-bold transition-colors cursor-pointer"
                    >
                      Engeli Kaldır
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Hesaptan Çıkış Yap</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

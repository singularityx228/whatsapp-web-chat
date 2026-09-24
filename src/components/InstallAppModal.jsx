import React from 'react';
import { Download, Monitor, Smartphone, Check, X, ShieldCheck, Sparkles } from 'lucide-react';

export default function InstallAppModal({ isOpen, onClose, deferredPrompt, onInstallPrompt }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-[#111b21] border border-[#222e35] rounded-3xl shadow-2xl overflow-hidden text-[#e9edef]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#202c33] border-b border-[#2a3942]">
          <div className="flex items-center gap-2.5">
            <Download className="w-5 h-5 text-[#00a884]" />
            <h3 className="font-semibold text-base">Uygulamayı İndir / Yükle</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="text-center py-2">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#00a884]/15 flex items-center justify-center text-[#00a884] mb-3 shadow-inner">
              <Monitor className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-white">Masaüstü ve Mobil Uygulama</h4>
            <p className="text-xs text-[#8696a0] mt-1 max-w-xs mx-auto">
              Whatsup Web'i bilgisayarınıza, tabletinize veya telefonunuza doğrudan uygulama olarak yükleyin.
            </p>
          </div>

          {/* Direct Install Button if PWA prompt is ready */}
          {deferredPrompt && (
            <button
              onClick={() => {
                onInstallPrompt && onInstallPrompt();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] font-bold text-sm rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Tek Tıkla Uygulamayı Yükle</span>
            </button>
          )}

          {/* Manual Install Guide */}
          <div className="space-y-3 pt-2 text-xs text-[#8696a0]">
            <div className="p-3 bg-[#182229] border border-[#222e35] rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-[#00a884] font-semibold">
                <Monitor className="w-4 h-4" />
                <span>Bilgisayar İçin (Chrome / Edge):</span>
              </div>
              <p>
                Adres çubuğundaki (URL yanındaki) <strong>"Uygulamayı Yükle" 📥</strong> simgesine tıklayın veya tarayıcı menüsünden <strong>"Whatsup uygulamasını yükle"</strong> deyin.
              </p>
            </div>

            <div className="p-3 bg-[#182229] border border-[#222e35] rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-[#53bdeb] font-semibold">
                <Smartphone className="w-4 h-4" />
                <span>Telefon / Tablet İçin (iOS / Android):</span>
              </div>
              <p>
                Safari veya Chrome'da <strong>"Paylaş"</strong> veya <strong>"Üç Nokta (⋮)"</strong> menüsüne tıklayıp <strong>"Ana Ekrana Ekle" (Add to Home Screen)</strong> butonuna basın.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#8696a0] pt-2">
            <ShieldCheck className="w-4 h-4 text-[#00a884]" />
            <span>%100 Güvenli & Reklamsız Progressive Web App (PWA)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

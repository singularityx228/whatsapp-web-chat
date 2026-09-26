import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, Volume2, ShieldCheck, Sparkles } from 'lucide-react';
import Avatar from './Avatar';
import { acceptIncomingCall, endCall, toggleMute } from '../lib/callService';
import { formatDisplayName } from '../lib/chatService';

export default function VoiceCallModal({
  callState,
  incomingCall,
  currentUser,
  onClearIncomingCall,
}) {
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Görüşme Süresi Sayacı
  useEffect(() => {
    let timer = null;
    if (callState?.status === 'connected') {
      setCallDuration(0);
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callState?.status]);

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // 1. GELEN ARAMA EKRANI
  if (incomingCall && callState?.status !== 'connected') {
    const callerName = formatDisplayName(incomingCall.callerUsername, incomingCall.callerDisplayName);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
        <div className="relative w-full max-w-sm bg-[#111b21] border border-[#222e35] rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center text-white">
          <div className="relative mb-6">
            <div className="absolute -inset-3 rounded-full bg-[#00a884]/30 animate-ping" />
            <Avatar
              name={callerName}
              seed={incomingCall.callerUsername}
              size="xl"
              className="relative ring-4 ring-[#00a884]"
            />
          </div>

          <h3 className="text-xl font-bold">{callerName}</h3>
          <p className="text-xs text-[#00a884] font-mono mt-0.5">@{incomingCall.callerUsername}</p>
          <p className="text-sm text-[#8696a0] mt-3 animate-pulse">Gelen Sesli Arama...</p>

          <div className="flex items-center gap-6 mt-8">
            {/* Reddet */}
            <button
              onClick={() => {
                endCall(currentUser?.username, incomingCall.callerUsername);
                onClearIncomingCall && onClearIncomingCall();
              }}
              title="Reddet"
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg transition-transform active:scale-90 cursor-pointer"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>

            {/* Kabul Et */}
            <button
              onClick={async () => {
                await acceptIncomingCall(currentUser?.username, incomingCall.callerUsername, incomingCall.offer);
                onClearIncomingCall && onClearIncomingCall();
              }}
              title="Kabul Et"
              className="w-14 h-14 rounded-full bg-[#00a884] hover:bg-[#008f72] flex items-center justify-center shadow-lg transition-transform active:scale-90 animate-bounce cursor-pointer"
            >
              <PhoneCall className="w-6 h-6 text-[#111b21]" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. GİDEN ARAMA VEYA AKTİF GÖRÜŞME EKRANI
  if (callState?.status === 'calling' || callState?.status === 'connected') {
    const partnerName = formatDisplayName(callState.partnerUsername, callState.partnerDisplayName);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
        <div className="relative w-full max-w-sm bg-[#111b21] border border-[#222e35] rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center text-white">
          <div className="relative mb-6">
            {callState.status === 'calling' && (
              <div className="absolute -inset-3 rounded-full bg-[#00a884]/20 animate-pulse" />
            )}
            <Avatar
              name={partnerName}
              seed={callState.partnerUsername}
              size="xl"
              className="relative ring-4 ring-[#00a884]"
            />
          </div>

          <h3 className="text-xl font-bold">{partnerName}</h3>
          <p className="text-xs text-[#00a884] font-mono mt-0.5">@{callState.partnerUsername}</p>

          <div className="mt-3">
            {callState.status === 'calling' ? (
              <p className="text-sm text-[#8696a0] animate-pulse">Çalıyor...</p>
            ) : (
              <div className="flex items-center gap-2 text-sm font-semibold text-[#00a884]">
                <Volume2 className="w-4 h-4 animate-pulse" />
                <span>{formatDuration(callDuration)}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-5 mt-8">
            {/* Mikrofon Aç/Kapat */}
            {callState.status === 'connected' && (
              <button
                onClick={() => {
                  const muted = toggleMute();
                  setIsMuted(muted);
                }}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  isMuted ? 'bg-red-500/30 text-red-400 border border-red-500' : 'bg-[#202c33] text-gray-200 hover:bg-[#2a3942]'
                }`}
                title={isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Sustur'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}

            {/* Aramayı Bitir */}
            <button
              onClick={() => {
                endCall(currentUser?.username, callState.partnerUsername);
              }}
              title="Aramayı Sonlandır"
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg transition-transform active:scale-90 cursor-pointer"
            >
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-[#8696a0] mt-6">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00a884]" />
            <span>WebRTC Uçtan Uca Şifreli Sesli Arama</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

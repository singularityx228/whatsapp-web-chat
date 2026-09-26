// ==============================================================================
// WHATSUP WEBRTC HIGH-QUALITY VOICE CALLING ENGINE
// - Kristal Netliğinde Sesli Arama (WebRTC P2P Audio Stream)
// - STUN Sunucusu Desteği (Google Public STUN)
// - Mikrofon Susturma / Hoparlör Yönetimi
// - Arama Süresi Sayacı & WhatsApp Zil / Çalma Sesleri
// ==============================================================================

import {
  startRingtone,
  stopRingtone,
  startCallingTone,
  stopCallingTone,
  playCallConnectedSound,
  playCallEndedSound,
} from './soundEffects';
import { sanitizeUsername } from './chatService';

const PRIMARY_BUCKET = '573iJSs13F7bnpGHmWr5Dy';
const BACKUP_BUCKET = 'K3Fbofi6FB4oh9chLvWGap';

const CLOUD_ENDPOINTS = [
  `https://kvdb.io/${PRIMARY_BUCKET}`,
  `https://kvdb.io/${BACKUP_BUCKET}`,
];

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

let peerConnection = null;
let localStream = null;
let remoteAudioElement = null;
let callCheckTimer = null;
let onCallStateChangeCallback = null;

// Sinyal Gönder / Al
const sendSignal = async (targetUsername, payload) => {
  const target = sanitizeUsername(targetUsername);
  const key = `call_signal_${target}`;
  const data = {
    ...payload,
    timestamp: Date.now(),
  };

  for (const ep of CLOUD_ENDPOINTS) {
    try {
      await fetch(`${ep}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {}
  }
};

const getSignal = async (myUsername) => {
  const my = sanitizeUsername(myUsername);
  const key = `call_signal_${my}`;
  for (const ep of CLOUD_ENDPOINTS) {
    try {
      const res = await fetch(`${ep}/${encodeURIComponent(key)}?nocache=${Date.now()}`);
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
};

const clearSignal = async (myUsername) => {
  const my = sanitizeUsername(myUsername);
  const key = `call_signal_${my}`;
  for (const ep of CLOUD_ENDPOINTS) {
    try {
      await fetch(`${ep}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'NONE', timestamp: Date.now() }),
      });
    } catch {}
  }
};

// ==========================================
// SESLİ ARAMA BAŞLATMA (Arayan Taraf)
// ==========================================

export const startVoiceCall = async (myUsername, targetUsername, targetDisplayName) => {
  const my = sanitizeUsername(myUsername);
  const target = sanitizeUsername(targetUsername);

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    throw new Error('Mikrofon erişim izni verilmedi!');
  }

  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  // Yerel ses kanalını ekle
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Karşı tarafın sesi geldiğinde çal
  peerConnection.ontrack = (event) => {
    handleRemoteStream(event.streams[0]);
  };

  // ICE adayları
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal(target, {
        type: 'ICE_CANDIDATE',
        from: my,
        candidate: event.candidate,
      });
    }
  };

  // WebRTC Offer oluştur
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // Buluta sinyal gönder
  await sendSignal(target, {
    type: 'CALL_OFFER',
    from: my,
    fromDisplayName: my,
    offer: offer,
  });

  startCallingTone();

  if (onCallStateChangeCallback) {
    onCallStateChangeCallback({
      status: 'calling',
      partnerUsername: target,
      partnerDisplayName: targetDisplayName || target,
      isMuted: false,
    });
  }

  return peerConnection;
};

// ==========================================
// ARAMAYI KABUL ETME (Aranan Taraf)
// ==========================================

export const acceptIncomingCall = async (myUsername, callerUsername, offer) => {
  const my = sanitizeUsername(myUsername);
  const caller = sanitizeUsername(callerUsername);

  stopRingtone();

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    throw new Error('Mikrofon erişim izni verilmedi!');
  }

  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    handleRemoteStream(event.streams[0]);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal(caller, {
        type: 'ICE_CANDIDATE',
        from: my,
        candidate: event.candidate,
      });
    }
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  await sendSignal(caller, {
    type: 'CALL_ANSWER',
    from: my,
    answer: answer,
  });

  playCallConnectedSound();

  if (onCallStateChangeCallback) {
    onCallStateChangeCallback({
      status: 'connected',
      partnerUsername: caller,
      partnerDisplayName: caller,
      isMuted: false,
    });
  }

  return peerConnection;
};

// ==========================================
// ARAMAYI BİTİRME / REDDETME
// ==========================================

export const endCall = async (myUsername, partnerUsername) => {
  stopRingtone();
  stopCallingTone();
  playCallEndedSound();

  if (partnerUsername) {
    sendSignal(partnerUsername, {
      type: 'CALL_END',
      from: myUsername,
    });
  }

  if (myUsername) {
    clearSignal(myUsername);
  }

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (remoteAudioElement) {
    remoteAudioElement.srcObject = null;
    remoteAudioElement.remove();
    remoteAudioElement = null;
  }

  if (onCallStateChangeCallback) {
    onCallStateChangeCallback({
      status: 'idle',
      partnerUsername: null,
      partnerDisplayName: null,
      isMuted: false,
    });
  }
};

// Mikrofon Aç / Kapat (Mute)
export const toggleMute = () => {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // isMuted
    }
  }
  return false;
};

// Karşı tarafın sesini çalma
const handleRemoteStream = (stream) => {
  if (!remoteAudioElement) {
    remoteAudioElement = document.createElement('audio');
    remoteAudioElement.autoplay = true;
    document.body.appendChild(remoteAudioElement);
  }
  remoteAudioElement.srcObject = stream;
  remoteAudioElement.play().catch(() => {});
};

// ==========================================
// GELEN ARAMA SİNYALİ DİNLEYİCİSİ (Polling Engine)
// ==========================================

export const startCallSignalListener = (myUsername, onIncomingCall, onStateUpdate) => {
  if (!myUsername) return;
  onCallStateChangeCallback = onStateUpdate;

  if (callCheckTimer) clearInterval(callCheckTimer);

  callCheckTimer = setInterval(async () => {
    try {
      const signal = await getSignal(myUsername);
      if (!signal || !signal.type || Date.now() - signal.timestamp > 12000) return;

      // 1. Gelen Arama Teklifi (Incoming Call)
      if (signal.type === 'CALL_OFFER') {
        startRingtone();
        if (onIncomingCall) {
          onIncomingCall({
            callerUsername: signal.from,
            callerDisplayName: signal.fromDisplayName || signal.from,
            offer: signal.offer,
          });
        }
      }

      // 2. Arama Karşı Tarafça Kabul Edildi (Call Answered)
      else if (signal.type === 'CALL_ANSWER' && peerConnection) {
        stopCallingTone();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
        playCallConnectedSound();
        clearSignal(myUsername);
        if (onCallStateChangeCallback) {
          onCallStateChangeCallback({
            status: 'connected',
            partnerUsername: signal.from,
            partnerDisplayName: signal.from,
            isMuted: false,
          });
        }
      }

      // 3. ICE Adayı Geldi
      else if (signal.type === 'ICE_CANDIDATE' && peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch {}
      }

      // 4. Arama Sonlandırıldı
      else if (signal.type === 'CALL_END') {
        endCall(myUsername, null);
      }
    } catch (e) {}
  }, 1800);

  return () => {
    if (callCheckTimer) clearInterval(callCheckTimer);
  };
};

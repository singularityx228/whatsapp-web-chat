// ==============================================================================
// WHATSUP WEBRTC INSTANT VOICE CALLING ENGINE (v9 - ULTRA FAST PUBSUB)
// - 0ms Gecikmeli WebRTC Sinyalleşme
// - Google STUN Sunucusu Desteği (STUN 19302)
// - Tam SDP Paketleme (Tek Seferde Güvenilir Bağlantı)
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
  unlockAudio,
} from './soundEffects';
import { sanitizeUsername, publishEvent } from './chatService';

const NTFY_BASE = 'https://ntfy.sh';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

let peerConnection = null;
let localStream = null;
let remoteAudioElement = null;
let activeCallId = null;
let onCallStateChangeCallback = null;
let activeCallSignalSource = null;

// ==========================================
// SESLİ ARAMA BAŞLATMA (Arayan Taraf)
// ==========================================

export const startVoiceCall = async (myUsername, targetUsername, targetDisplayName) => {
  const my = sanitizeUsername(myUsername);
  const target = sanitizeUsername(targetUsername);

  unlockAudio();

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (err) {
    throw new Error('Mikrofon erişim izni verilmedi! Lütfen tarayıcı ayarlarından mikrofonu açın.');
  }

  activeCallId = `call_${my}_${target}_${Date.now()}`;
  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  // Yerel ses kanalını ekle
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Karşı tarafın sesi geldiğinde çal
  peerConnection.ontrack = (event) => {
    handleRemoteStream(event.streams[0]);
  };

  // WebRTC Offer oluştur
  const offer = await peerConnection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: false,
  });
  await peerConnection.setLocalDescription(offer);

  // STUN ICE adaylarının SDP içerisine toplanmasını bekle (Maks 1.2 sn)
  if (peerConnection.iceGatheringState !== 'complete') {
    await new Promise((resolve) => {
      const checkState = () => {
        if (peerConnection?.iceGatheringState === 'complete') {
          peerConnection.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      peerConnection.addEventListener('icegatheringstatechange', checkState);
      setTimeout(resolve, 1200);
    });
  }

  // Karşı tarafın gelen kutusuna çağrı teklifi gönder (Instant PubSub)
  await publishEvent(`whatsup_v9_inbox_${target}`, {
    event: 'VOICE_CALL_OFFER',
    data: {
      callId: activeCallId,
      caller: my,
      callerDisplayName: my,
      target: target,
      offer: {
        type: peerConnection.localDescription.type,
        sdp: peerConnection.localDescription.sdp,
      },
      timestamp: Date.now(),
    },
  });

  startCallingTone();

  if (onCallStateChangeCallback) {
    onCallStateChangeCallback({
      status: 'calling',
      partnerUsername: target,
      partnerDisplayName: targetDisplayName || target,
      isMuted: false,
      callId: activeCallId,
    });
  }

  return peerConnection;
};

// ==========================================
// ARAMAYI KABUL ETME (Aranan Taraf)
// ==========================================

export const acceptIncomingCall = async (myUsername, callerUsername, offerData, callId) => {
  const my = sanitizeUsername(myUsername);
  const caller = sanitizeUsername(callerUsername);

  stopRingtone();
  unlockAudio();

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (err) {
    throw new Error('Mikrofon erişim izni verilmedi!');
  }

  activeCallId = callId || `call_${caller}_${my}`;
  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    handleRemoteStream(event.streams[0]);
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offerData));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  // ICE adaylarını bekle (Maks 1.2 sn)
  if (peerConnection.iceGatheringState !== 'complete') {
    await new Promise((resolve) => {
      const checkState = () => {
        if (peerConnection?.iceGatheringState === 'complete') {
          peerConnection.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      peerConnection.addEventListener('icegatheringstatechange', checkState);
      setTimeout(resolve, 1200);
    });
  }

  // Arayan tarafa yanıt gönder (Instant PubSub)
  await publishEvent(`whatsup_v9_inbox_${caller}`, {
    event: 'VOICE_CALL_ANSWER',
    data: {
      callId: activeCallId,
      caller: caller,
      responder: my,
      answer: {
        type: peerConnection.localDescription.type,
        sdp: peerConnection.localDescription.sdp,
      },
      timestamp: Date.now(),
    },
  });

  playCallConnectedSound();

  if (onCallStateChangeCallback) {
    onCallStateChangeCallback({
      status: 'connected',
      partnerUsername: caller,
      partnerDisplayName: caller,
      isMuted: false,
      callId: activeCallId,
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

  const my = sanitizeUsername(myUsername);
  const partner = sanitizeUsername(partnerUsername);

  if (partner) {
    publishEvent(`whatsup_v9_inbox_${partner}`, {
      event: 'VOICE_CALL_ENDED',
      data: { from: my, timestamp: Date.now() },
    });
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

  activeCallId = null;

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

// Karşı tarafın sesini hoparlörden çalma
const handleRemoteStream = (stream) => {
  if (!remoteAudioElement) {
    remoteAudioElement = document.createElement('audio');
    remoteAudioElement.autoplay = true;
    remoteAudioElement.playsInline = true;
    document.body.appendChild(remoteAudioElement);
  }
  remoteAudioElement.srcObject = stream;
  remoteAudioElement.play().catch(() => {});
};

// ==========================================
// GELEN ARAMA DİNLEYİCİSİ (SSE Dinleme)
// ==========================================

export const startCallSignalListener = (myUsername, onIncomingCall, onStateUpdate) => {
  if (!myUsername) return;
  const my = sanitizeUsername(myUsername);
  onCallStateChangeCallback = onStateUpdate;

  if (activeCallSignalSource) {
    activeCallSignalSource.close();
  }

  try {
    activeCallSignalSource = new EventSource(`${NTFY_BASE}/whatsup_v9_inbox_${my}/sse`);
    activeCallSignalSource.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'message') {
          const inner = JSON.parse(payload.message);

          // 1. Gelen Arama Teklifi
          if (inner.event === 'VOICE_CALL_OFFER' && inner.data) {
            const data = inner.data;
            startRingtone();
            if (onIncomingCall) {
              onIncomingCall({
                callerUsername: data.caller,
                callerDisplayName: data.callerDisplayName || data.caller,
                offer: data.offer,
                callId: data.callId,
              });
            }
          }

          // 2. Arama Karşı Tarafça Kabul Edildi
          else if (inner.event === 'VOICE_CALL_ANSWER' && inner.data) {
            const data = inner.data;
            if (peerConnection && peerConnection.signalingState === 'have-local-offer') {
              stopCallingTone();
              await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
              playCallConnectedSound();

              if (onCallStateChangeCallback) {
                onCallStateChangeCallback({
                  status: 'connected',
                  partnerUsername: data.responder,
                  partnerDisplayName: data.responder,
                  isMuted: false,
                });
              }
            }
          }

          // 3. Arama Sonlandırıldı
          else if (inner.event === 'VOICE_CALL_ENDED') {
            endCall(my, null);
          }
        }
      } catch (e) {}
    };
  } catch (e) {
    console.warn('Call SSE listener error:', e);
  }

  return () => {
    if (activeCallSignalSource) {
      activeCallSignalSource.close();
      activeCallSignalSource = null;
    }
  };
};

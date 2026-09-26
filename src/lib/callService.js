// ==============================================================================
// WHATSUP WEBRTC HIGH-QUALITY VOICE CALLING ENGINE (FULL SDP GATHERING)
// - Kristal Netliğinde Sesli Arama (WebRTC P2P Audio Stream)
// - Google STUN Sunucusu Desteği (STUN 19302)
// - Tam SDP Paketleme (KVDB Race Condition Bağışık)
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
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

let peerConnection = null;
let localStream = null;
let remoteAudioElement = null;
let callCheckTimer = null;
let onCallStateChangeCallback = null;
let activeCallId = null;

// Bulut Key-Value Yardımcıları
const putCloudData = async (key, data) => {
  const json = JSON.stringify(data);
  for (const ep of CLOUD_ENDPOINTS) {
    try {
      await fetch(`${ep}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      });
    } catch {}
  }
};

const getCloudData = async (key) => {
  for (const ep of CLOUD_ENDPOINTS) {
    try {
      const res = await fetch(`${ep}/${encodeURIComponent(key)}?nocache=${Date.now()}`);
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
};

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

  // Buluta Teklifi Yaz
  const callOfferPayload = {
    callId: activeCallId,
    type: 'CALL_OFFER',
    caller: my,
    callerDisplayName: my,
    target: target,
    offer: {
      type: peerConnection.localDescription.type,
      sdp: peerConnection.localDescription.sdp,
    },
    status: 'ringing',
    timestamp: Date.now(),
  };

  await putCloudData(`call_offer_${target}`, callOfferPayload);

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

  // Buluta Yanıtı Yaz
  const answerPayload = {
    callId: activeCallId,
    type: 'CALL_ANSWER',
    caller: caller,
    responder: my,
    answer: {
      type: peerConnection.localDescription.type,
      sdp: peerConnection.localDescription.sdp,
    },
    status: 'connected',
    timestamp: Date.now(),
  };

  await Promise.all([
    putCloudData(`call_answer_${caller}`, answerPayload),
    putCloudData(`call_offer_${my}`, { status: 'accepted', timestamp: Date.now() }),
  ]);

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

  const endPayload = {
    type: 'CALL_ENDED',
    status: 'ended',
    from: my,
    timestamp: Date.now(),
  };

  if (partner) {
    putCloudData(`call_offer_${partner}`, endPayload);
    putCloudData(`call_answer_${partner}`, endPayload);
  }
  if (my) {
    putCloudData(`call_offer_${my}`, endPayload);
    putCloudData(`call_answer_${my}`, endPayload);
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

// Karşı tarafın sesini çalma
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
// GELEN ARAMA VE YANIT DİNLEYİCİSİ (Polling Engine)
// ==========================================

export const startCallSignalListener = (myUsername, onIncomingCall, onStateUpdate) => {
  if (!myUsername) return;
  const my = sanitizeUsername(myUsername);
  onCallStateChangeCallback = onStateUpdate;

  if (callCheckTimer) clearInterval(callCheckTimer);

  callCheckTimer = setInterval(async () => {
    try {
      // 1. Kendi adımıza gelen bir arama teklifi var mı?
      const incomingOffer = await getCloudData(`call_offer_${my}`);
      if (
        incomingOffer &&
        incomingOffer.type === 'CALL_OFFER' &&
        incomingOffer.status === 'ringing' &&
        Date.now() - incomingOffer.timestamp < 25000
      ) {
        startRingtone();
        if (onIncomingCall) {
          onIncomingCall({
            callerUsername: incomingOffer.caller,
            callerDisplayName: incomingOffer.callerDisplayName || incomingOffer.caller,
            offer: incomingOffer.offer,
            callId: incomingOffer.callId,
          });
        }
      }

      // 2. Başlattığımız arama için karşı taraftan cevap geldi mi?
      const myAnswer = await getCloudData(`call_answer_${my}`);
      if (
        myAnswer &&
        myAnswer.type === 'CALL_ANSWER' &&
        myAnswer.status === 'connected' &&
        peerConnection &&
        peerConnection.signalingState === 'have-local-offer' &&
        Date.now() - myAnswer.timestamp < 25000
      ) {
        stopCallingTone();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(myAnswer.answer));
        playCallConnectedSound();
        putCloudData(`call_answer_${my}`, { status: 'cleared', timestamp: Date.now() });

        if (onCallStateChangeCallback) {
          onCallStateChangeCallback({
            status: 'connected',
            partnerUsername: myAnswer.responder,
            partnerDisplayName: myAnswer.responder,
            isMuted: false,
          });
        }
      }

      // 3. Arama sonlandırıldı mı?
      if (
        (incomingOffer && incomingOffer.status === 'ended' && Date.now() - incomingOffer.timestamp < 10000) ||
        (myAnswer && myAnswer.status === 'ended' && Date.now() - myAnswer.timestamp < 10000)
      ) {
        endCall(my, null);
      }
    } catch (e) {}
  }, 1200);

  return () => {
    if (callCheckTimer) clearInterval(callCheckTimer);
  };
};

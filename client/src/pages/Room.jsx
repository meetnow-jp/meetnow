import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import VideoGrid from '../components/VideoGrid.jsx';
import ControlBar from '../components/ControlBar.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import TranscriptPanel from '../components/TranscriptPanel.jsx';
import DeviceSetup from '../components/DeviceSetup.jsx';
import { useRecording } from '../hooks/useRecording.js';
import { useTranscription } from '../hooks/useTranscription.js';

// GitHub API から最新のサーバー URL を取得（ビルド不要でリアルタイム更新）
async function fetchServerUrl() {
  try {
    const r = await fetch(
      'https://api.github.com/repos/meetnow-jp/meetnow/contents/config.json',
      { headers: { Accept: 'application/vnd.github.v3.raw' }, cache: 'no-store' }
    );
    if (r.ok) {
      const cfg = await r.json();
      if (cfg && cfg.wsUrl) return cfg.wsUrl;
    }
  } catch {}
  // フォールバック: ビルド時の環境変数
  return import.meta.env.VITE_LIVEKIT_HOST || null;
}

// ブラウザネイティブ Web Crypto API で LiveKit JWT を生成
// livekit-server-sdk は Node.js 専用のため使用しない
async function generateTokenClientSide(room, username) {
  const host   = await fetchServerUrl();
  const key    = import.meta.env.VITE_LIVEKIT_API_KEY;
  const secret = import.meta.env.VITE_LIVEKIT_API_SECRET;
  if (!host || !key || !secret) return null;

  const identity = `${username}_${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);

  // Base64url エンコード
  const b64url = (obj) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const header  = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    iss: key,
    sub: identity,
    iat: now,
    nbf: now,
    exp: now + 14400, // 4時間
    name: username,
    video: {
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  });

  const sigInput = `${header}.${payload}`;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(sigInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return { token: `${sigInput}.${sig}`, url: host };
}

function RoomContent({ roomId }) {
  const navigate = useNavigate();
  const [showChat, setShowChat] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const recording = useRecording();
  const transcription = useTranscription();

  return (
    <div className="room-wrapper">
      <div className="room-body">
        <div className="main-area">
          <VideoGrid />
        </div>
        <ChatPanel onClose={() => setShowChat(false)} visible={showChat} />
        {showTranscript && (
          <TranscriptPanel
            transcripts={transcription.transcripts}
            interimText={transcription.interimText}
            onClear={transcription.clearTranscripts}
            onDownload={transcription.downloadTranscript}
            onClose={() => setShowTranscript(false)}
          />
        )}
      </div>
      <ControlBar
        roomId={roomId}
        onLeave={() => navigate('/')}
        showChat={showChat}
        onToggleChat={() => setShowChat(v => !v)}
        showTranscript={showTranscript}
        onToggleTranscript={() => setShowTranscript(v => !v)}
        recording={recording}
        transcription={transcription}
      />
    </div>
  );
}

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState(null); // null = デバイス選択前
  const userName = sessionStorage.getItem('userName') || 'Guest';

  useEffect(() => {
    if (!roomId) return navigate('/');

    (async () => {
      try {
        // まずクライアント側生成を試みる（GitHub Pages + ローカルサーバー用）
        const clientResult = await generateTokenClientSide(roomId, userName);
        if (clientResult) {
          setToken(clientResult.token);
          setServerUrl(clientResult.url);
          return;
        }
        // フォールバック: サーバー API
        const r = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: roomId, username: userName }),
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        setToken(d.token);
        setServerUrl(d.url);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [roomId]);

  if (error) {
    return (
      <div className="error-page">
        <p>接続エラー: {error}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>戻る</button>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="connecting-page">
        <div className="spinner" />
        <p>接続中...</p>
      </div>
    );
  }

  // デバイス選択画面（OBS Virtual Camera もここで選択可能）
  if (!devices) {
    return <DeviceSetup onConfirm={setDevices} />;
  }

  // LiveKit にデバイス ID を渡す
  const audioOptions = devices.micId
    ? { deviceId: devices.micId }
    : true;
  const videoOptions = devices.camId
    ? { deviceId: devices.camId }
    : true;

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio={audioOptions}
      video={videoOptions}
      onDisconnected={() => navigate('/')}
    >
      <RoomAudioRenderer />
      <RoomContent roomId={roomId} />
    </LiveKitRoom>
  );
}

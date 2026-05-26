import { useCallback, useEffect, useState } from 'react';

export default function DeviceSetup({ onConfirm }) {
  const [cameras, setCameras]   = useState([]);
  const [mics, setMics]         = useState([]);
  const [camId, setCamId]       = useState('');
  const [micId, setMicId]       = useState('');
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [obsState, setObsState] = useState('idle'); // idle | loading | ok | error
  const [obsMsg, setObsMsg]     = useState('');

  // デバイス一覧取得
  const refreshDevices = useCallback(async (autoSelectObs = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {}

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const mics = devices.filter(d => d.kind === 'audioinput');
    setCameras(cams);
    setMics(mics);

    if (autoSelectObs) {
      // OBS Virtual Camera を自動選択
      const obsCamera = cams.find(d => d.label.toLowerCase().includes('obs'));
      if (obsCamera) {
        setCamId(obsCamera.deviceId);
      } else {
        setCamId(prev => prev || cams[0]?.deviceId || '');
      }
    } else {
      setCamId(prev => prev || cams[0]?.deviceId || '');
    }
    setMicId(prev => prev || mics[0]?.deviceId || '');
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshDevices(false);
  }, [refreshDevices]);

  // OBS 一括起動
  const startObs = useCallback(async () => {
    setObsState('loading');
    setObsMsg('OBSを起動中...');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/obs/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) {
        setObsState('error');
        if (data.wsEnabled === false) {
          setObsMsg('⚙️ OBSのWebSocketを有効化してください → OBS「ツール」→「WebSocketサーバー設定」→「有効にする」にチェック（初回のみ）');
        } else {
          setObsMsg(data.hint || data.error || 'OBSの起動に失敗しました');
        }
        return;
      }
      setObsState('ok');
      setObsMsg('OBS仮想カメラ起動済み ✓');
      // 仮想カメラが OS に認識されるまで少し待ってからデバイスリストを更新
      await new Promise(r => setTimeout(r, 1500));
      await refreshDevices(true);
    } catch (e) {
      setObsState('error');
      setObsMsg('サーバーへの接続に失敗しました');
    }
  }, [refreshDevices]);

  // カメラプレビュー
  useEffect(() => {
    if (!camId) return;
    let stream;
    (async () => {
      try {
        if (preview) preview.getTracks().forEach(t => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: camId } },
          audio: false,
        });
        setPreview(stream);
      } catch {}
    })();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [camId]);

  const handleConfirm = () => {
    if (preview) preview.getTracks().forEach(t => t.stop());
    onConfirm({ camId, micId });
  };

  return (
    <div className="device-setup-overlay">
      {/* ヘッダー */}
      <div className="device-setup-header">
        <h2>📹 会議に参加する前に確認</h2>
      </div>

      <div className="device-setup-body">
        {/* 左: 大きなカメラプレビュー */}
        <div className="device-preview-area">
          <div className="device-preview">
            {preview ? (
              <video
                autoPlay
                muted
                playsInline
                ref={el => { if (el && preview) el.srcObject = preview; }}
              />
            ) : (
              <div className="device-preview-empty">
                <span style={{ fontSize: 48 }}>📷</span>
                <span>{loading ? '読み込み中...' : 'カメラが見つかりません'}</span>
              </div>
            )}
          </div>
        </div>

        {/* 右: 設定パネル */}
        <div className="device-setup-card">

          {/* OBS 一括起動 */}
          <div className="obs-section">
            <button
              className={`btn obs-btn${obsState === 'ok' ? ' obs-btn-ok' : ''}${obsState === 'error' ? ' obs-btn-error' : ''}`}
              onClick={startObs}
              disabled={obsState === 'loading'}
            >
              {obsState === 'loading' ? (
                <><span className="obs-spin">⏳</span> 起動中...</>
              ) : obsState === 'ok' ? (
                <>✅ OBS仮想カメラ 起動済み</>
              ) : (
                <>🎬 OBSを起動して仮想カメラを使う</>
              )}
            </button>
            {obsMsg && obsState !== 'idle' && (
              <p className={`obs-msg ${obsState}`}>{obsMsg}</p>
            )}
            <p className="obs-hint">OBSがない場合はそのまま「今すぐ参加」を押してください</p>
          </div>

          {/* カメラ選択 */}
          <div className="device-field">
            <label>📹 カメラ</label>
            <select value={camId} onChange={e => setCamId(e.target.value)}>
              {cameras.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `カメラ ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
              {cameras.length === 0 && <option value="">カメラが見つかりません</option>}
            </select>
          </div>

          {/* マイク選択 */}
          <div className="device-field">
            <label>🎤 マイク</label>
            <select value={micId} onChange={e => setMicId(e.target.value)}>
              {mics.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `マイク ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
              {mics.length === 0 && <option value="">マイクが見つかりません</option>}
            </select>
          </div>

          <button className="btn btn-primary btn-full" style={{ marginTop: 'auto' }} onClick={handleConfirm}>
            今すぐ参加
          </button>
        </div>
      </div>
    </div>
  );
}

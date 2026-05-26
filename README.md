# MeetNow

ブラウザだけで使えるビデオ会議アプリ（Teams風）。参加者登録不要、最大200人対応。

**公開URL**: https://meetnow-jp.github.io/meetnow/

## アーキテクチャ

```
GitHub Pages (静的フロントエンド)
  └─ React + Vite + LiveKit Components
       ├─ JWT はブラウザ内 Web Crypto API で生成
       └─ WSS URL は config.json を GitHub API で実行時取得

ローカルPC（ホスト側のみ必要）
  ├─ LiveKit Server v1.12.0 (C:\livekit\livekit-server.exe, port 7880)
  ├─ Node.js API Server (server/index.js, port 3001)
  └─ SSH トンネル (localhost.run → lhr.life の公開URL)
       └─ URL を config.json に書き込み → GitHub API 経由でクライアントが取得
```

## ディレクトリ構成

```
meeting-app/
├── client/                  # React フロントエンド (Vite)
│   └── src/
│       ├── pages/
│       │   ├── Home.jsx     # ルーム名入力・参加画面
│       │   └── Room.jsx     # 会議室（LiveKit接続・JWT生成）
│       ├── components/
│       │   ├── VideoGrid.jsx     # 映像グリッド
│       │   ├── ControlBar.jsx    # マイク/カメラ/退出ボタン
│       │   ├── ChatPanel.jsx     # チャット
│       │   ├── TranscriptPanel.jsx # 文字起こし
│       │   └── DeviceSetup.jsx   # デバイス選択
│       └── hooks/
│           ├── useRecording.js   # 録画
│           └── useTranscription.js # 音声認識
├── server/
│   └── index.js             # Express API（トークン発行・OBS連携）
├── config.json              # 現在のWSS URL（GitHub API 経由で実行時更新）
├── start-public.ps1         # 全サービス起動スクリプト（Windows）
├── livekit-config.yaml      # LiveKit 設定（port, APIキー）
└── .gh-token                # GitHub PAT（gitignore済み）
```

## LiveKit 設定

- 実行ファイル: `C:\livekit\livekit-server.exe`
- 設定ファイル: `C:\livekit\config.yaml`

```yaml
port: 7880
keys:
  APIqt5m8GpCm8bw: PIqqeaewpkkBFVrMzxLxBaCD87UZCF0fsDrO6d2TlBSA
```

## 起動方法（ホスト側）

```powershell
# すべてのサービスを一括起動
.\start-public.ps1
```

スクリプトが自動で:
1. LiveKit サーバー起動
2. API サーバー起動
3. localhost.run トンネル接続
4. config.json を最新URLで更新

## 環境変数（GitHub Secrets）

| 変数名 | 説明 |
|---|---|
| `VITE_LIVEKIT_API_KEY` | LiveKit API キー |
| `VITE_LIVEKIT_API_SECRET` | LiveKit API シークレット |
| `VITE_LIVEKIT_HOST` | フォールバック用WSS URL |
| `VITE_API_URL` | API サーバー URL |

## 既知の問題

- localhost.run の無料トンネルはSSH切断でURLが変わる
  → `start-public.ps1` を再実行すれば自動更新される

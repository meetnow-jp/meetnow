# AI Agent Instructions for MeetNow

このファイルはOpenAI Codex、Claude CodeなどのAIエージェント向けの作業指示書です。

## プロジェクト概要

**MeetNow** はブラウザベースのビデオ会議アプリ。
- フロントエンド: React + Vite → GitHub Pages にデプロイ
- バックエンド: LiveKit SFU（ローカルPC起動）+ Node.js API
- トンネル: localhost.run（SSH）で外部公開

## セットアップ

```bash
# フロントエンド依存関係
cd client && npm install

# バックエンド依存関係
cd server && npm install
```

## 開発サーバー起動

```bash
# フロントエンド (port 5173)
cd client && npm run dev

# バックエンド (port 3001)
cd server && npm start
```

## ビルド

```bash
cd client && npm run build
# 成果物: client/dist/
```

## 主要ファイルと役割

### `client/src/pages/Room.jsx`
- 会議室のメインコンポーネント
- `fetchServerUrl()`: GitHub API から config.json を取得しWSS URLを得る
- `generateTokenClientSide()`: Web Crypto API で LiveKit JWT を生成（Node.js SDK不使用）
- LiveKitRoom コンポーネントで接続

### `client/src/pages/Home.jsx`
- ルーム名・ユーザー名入力画面

### `server/index.js`
- Express サーバー
- `POST /api/token`: LiveKit アクセストークン発行
- `POST /api/obs/start`: OBS 仮想カメラ起動
- `GET /health`: ヘルスチェック

### `config.json`（リポジトリルート）
- 現在の LiveKit WSS URL を保持
- GitHub API 経由でクライアントが実行時に取得（リビルド不要）
- `start-public.ps1` が自動更新する

## コーディングルール

1. **JWT生成はクライアントサイドのみ** (`Room.jsx` 内 `generateTokenClientSide`)
   - `livekit-server-sdk` は `client/` では使用しない（Node.js専用のため）
   - `crypto.subtle` (Web Crypto API) を使う

2. **サーバーURLの取得は必ず `fetchServerUrl()` 経由**
   - `VITE_LIVEKIT_HOST` はフォールバックのみ
   - `config.json` の値を優先

3. **日本語UI**: ボタンラベル・エラーメッセージは日本語で

4. **スタイル**: CSS は `client/src/index.css` に集約（CSS Modules 不使用）

## よくある修正タスク

### UIの改善
- `client/src/components/` 内の各コンポーネントを編集
- スタイルは `client/src/index.css` を編集

### 新機能追加
- React コンポーネントを `client/src/components/` に追加
- カスタムフックは `client/src/hooks/` に追加

### APIエンドポイント追加
- `server/index.js` に `app.post('/api/xxx', ...)` を追加

### トンネル安定化
- `start-public.ps1` を編集（PowerShell スクリプト）
- SSH 再接続時に config.json を自動更新するロジックを改善

## デプロイ

`master` ブランチに push すると GitHub Actions が自動でビルド＆デプロイ。
`config.json` の変更はデプロイをトリガーしない（`paths-ignore` 設定済み）。

## 注意事項

- `.gh-token` ファイルは gitignore 済み。コミットしない
- `livekit-config.yaml` の API シークレットは32文字以上必要
- GitHub Pages の URL: `https://meetnow-jp.github.io/meetnow/`

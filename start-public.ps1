$env:PATH = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:PATH"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# GitHub PAT を .gh-token ファイルから読み込む
$tokenFile = "$root\.gh-token"
if (Test-Path $tokenFile) {
  $GH_TOKEN = (Get-Content $tokenFile -Raw).Trim()
} elseif ($env:GH_TOKEN) {
  $GH_TOKEN = $env:GH_TOKEN
} else {
  Write-Host "警告: .gh-token が見つかりません" -ForegroundColor Yellow
  $GH_TOKEN = $null
}
$env:GH_TOKEN = $GH_TOKEN

# ── config.json を GitHub に更新する関数 ──────────────────
function Update-ConfigJson($wssUrl) {
  if (-not $GH_TOKEN) { return }
  try {
    $h = @{
      "Authorization" = "token $GH_TOKEN"
      "Accept"        = "application/vnd.github+json"
      "Content-Type"  = "application/json"
    }
    $cur = Invoke-RestMethod `
      -Uri "https://api.github.com/repos/meetnow-jp/meetnow/contents/config.json" `
      -Headers $h
    $b64  = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("{`"wsUrl`":`"$wssUrl`"}"))
    $body = @{ message = "update server URL"; content = $b64; sha = $cur.sha } | ConvertTo-Json
    Invoke-RestMethod `
      -Uri "https://api.github.com/repos/meetnow-jp/meetnow/contents/config.json" `
      -Method PUT -Headers $h -Body $body | Out-Null
    Write-Host "    [config.json 更新] $wssUrl" -ForegroundColor Cyan
  } catch {
    Write-Host "    [config.json 更新失敗] $_" -ForegroundColor Red
  }
}

# ── トンネルを起動してURLを返す関数 ────────────────────────
function Start-Tunnel {
  $sshOut = "$env:TEMP\lhr_tunnel.txt"
  if (Test-Path $sshOut) { Remove-Item $sshOut -Force }
  Get-Process ssh -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1

  Start-Process -FilePath "powershell.exe" -WindowStyle Minimized `
    -ArgumentList "-NoProfile -Command `"ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=5 -o StrictHostKeyChecking=no -R 80:localhost:7880 nokey@localhost.run 2>&1 | Tee-Object -FilePath '$sshOut'; while(`$true){Start-Sleep 60}`""

  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline -ForegroundColor Gray
    if (Test-Path $sshOut) {
      $line = Get-Content $sshOut -ErrorAction SilentlyContinue | Select-String "lhr.life" | Select-Object -Last 1
      if ($line) {
        $m = [regex]::Match($line.ToString(), 'https://[^\s]+lhr\.life')
        if ($m.Success) { Write-Host ""; return ($m.Value -replace "^https://", "wss://") }
      }
    }
  }
  Write-Host ""; return $null
}

Write-Host "=== MeetNow 公開サーバー起動 ===" -ForegroundColor Cyan

# 1. LiveKit 起動（C:\livekit\ を優先使用）
$lkExe    = "C:\livekit\livekit-server.exe"
$lkConfig = "C:\livekit\config.yaml"

# 初回: livekit-bin フォルダからコピー
if (-not (Test-Path $lkExe)) {
  $srcExe = "$root\livekit-bin\livekit-server.exe"
  $srcCfg = "$root\livekit-config.yaml"
  if (Test-Path $srcExe) {
    New-Item -ItemType Directory -Force "C:\livekit" | Out-Null
    Copy-Item $srcExe $lkExe -Force
    Copy-Item $srcCfg $lkConfig -Force
    Write-Host "[準備] LiveKit を C:\livekit\ にコピーしました" -ForegroundColor Green
  }
}

if (Test-Path $lkExe) {
  if (-not (Get-Process livekit-server -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $lkExe -ArgumentList "--config `"$lkConfig`"" -WindowStyle Minimized
    Write-Host "[1/3] LiveKit 起動中..." -ForegroundColor Green
    Start-Sleep -Seconds 3
  } else {
    Write-Host "[1/3] LiveKit はすでに起動中" -ForegroundColor Yellow
  }
} else {
  Write-Host "[1/3] LiveKit が見つかりません: $lkExe" -ForegroundColor Red
}

# 2. API サーバー起動
$serverPath = "$root\server"
if (-not (Get-Process node -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath "node" -ArgumentList "$serverPath\index.js" `
    -WorkingDirectory $serverPath -WindowStyle Minimized
  Write-Host "[2/3] APIサーバー起動中 (port 3001)..." -ForegroundColor Green
  Start-Sleep -Seconds 2
} else {
  Write-Host "[2/3] APIサーバーはすでに起動中" -ForegroundColor Yellow
}

# 3. トンネル起動
Write-Host "[3/3] トンネル接続中..." -NoNewline -ForegroundColor Green
$currentUrl = Start-Tunnel

if (-not $currentUrl) {
  Write-Host "[エラー] トンネルURL取得失敗" -ForegroundColor Red
  pause; exit 1
}

Write-Host "    URL: $currentUrl" -ForegroundColor Cyan
Update-ConfigJson $currentUrl

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  起動完了！" -ForegroundColor Green
Write-Host "  https://meetnow-jp.github.io/meetnow/" -ForegroundColor Green
Write-Host "  ★ このウィンドウは閉じないでください ★" -ForegroundColor Yellow
Write-Host "  （トンネルが切れたら自動で再接続します）" -ForegroundColor Gray
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# ── 自動監視ループ（15秒ごとにトンネル確認・切れたら自動復旧）──
$lastUrl   = $currentUrl
$lastCheck = Get-Date
$sshOut    = "$env:TEMP\lhr_tunnel.txt"

while ($true) {
  Start-Sleep -Seconds 15

  # トンネル生存確認
  $alive = $false
  if (Get-Process ssh -ErrorAction SilentlyContinue) {
    $httpUrl = $lastUrl -replace "^wss://", "https://"
    try {
      $req = [System.Net.HttpWebRequest]::Create($httpUrl)
      $req.Timeout = 5000; $req.Method = "GET"
      $resp = $req.GetResponse(); $resp.Close(); $alive = $true
    } catch [System.Net.WebException] {
      $code = [int]$_.Exception.Response.StatusCode
      if ($code -gt 0 -and $code -ne 503) { $alive = $true }
    } catch {}
  }

  if (-not $alive) {
    Write-Host "$(Get-Date -Format 'HH:mm:ss') [警告] トンネル切断 → 自動再接続中..." -ForegroundColor Yellow

    # LiveKit も確認・再起動
    if (-not (Get-Process livekit-server -ErrorAction SilentlyContinue)) {
      Write-Host "    LiveKit も停止 → 再起動..." -ForegroundColor Yellow
      Start-Process -FilePath $lkExe -ArgumentList "--config `"$lkConfig`"" -WindowStyle Minimized
      Start-Sleep -Seconds 3
    }

    Write-Host "    再接続中..." -NoNewline -ForegroundColor Green
    $newUrl = Start-Tunnel

    if ($newUrl) {
      $lastUrl = $newUrl
      Update-ConfigJson $newUrl
      Write-Host "$(Get-Date -Format 'HH:mm:ss') [復旧完了] $newUrl" -ForegroundColor Green
    } else {
      Write-Host "$(Get-Date -Format 'HH:mm:ss') [再接続失敗] 15秒後に再試行..." -ForegroundColor Red
    }
  } elseif (((Get-Date) - $lastCheck).TotalMinutes -ge 30) {
    Write-Host "$(Get-Date -Format 'HH:mm:ss') [正常稼働中] $lastUrl" -ForegroundColor Green
    $lastCheck = Get-Date
  }
}

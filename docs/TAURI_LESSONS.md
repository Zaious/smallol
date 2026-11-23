# Tauri 經驗與心得（來自 Basesmall，2026-10-03 至 10-13）

Basesmall 用 Tauri 2.12（Rust 殼 + TypeScript 網頁），Windows 用 WebView2、macOS 用 WKWebView。
以下都是實際踩過、量過的；數字附來源。

## 建置

- **App 開著就不能建到同一個資料夾**：exe 被鎖住，建置會「存取被拒」。另開輸出資料夾：`CARGO_TARGET_DIR` 設**絕對路徑**（設相對路徑時，Tauri 會在 `src-tauri/` 底下再建一層 `src-tauri/target-*`）。`.gitignore` 用 `src-tauri/target-*/` 一次蓋掉。
- **時間**：release 設定開了 LTO、`codegen-units = 1`，全新建置約 8 分鐘，之後改一點約 3–6 分鐘（Windows 本機實測）。
- **只在發布時才需要的資源放 `tauri.release.conf.json`**，用 `--config` 疊上去。放主設定的話，Tauri 的 build script 在任何建置（含 `tauri dev`）都要求檔案存在，乾淨的 clone 會直接失敗（例：建置時才產生的 `THIRD_PARTY_LICENSES.txt`）。
- Node 24 能直接執行 `.ts`：`src/` 用 `.ts` 副檔名 import、不用參數屬性，腳本可以直接 `node scripts/x.ts`。

## 權限（capabilities）

- 視窗是**照標籤（label）列在 capability 裡**的。新增視窗（例如新的選配小視窗）忘了加，那個視窗就沒有權限。
- 開外部連結（opener）要列出允許的網址。
- CSP 的 `connect-src` 要列出前端會呼叫的 API 網域；Rust 端發的請求（例如更新外掛）不受 CSP 管。

## 視窗

- 無邊框、透明、永遠在最上層：`decorations: false`、`transparent: true`、`alwaysOnTop: true`。
- 選配小視窗設 `focusable: false`，才不會搶走使用者的焦點。
- 多視窗：**主視窗是唯一的資料擁有者**，小視窗只畫主視窗用事件送來的資料。事件只能傳純 JSON（不能傳 Map）。
- 小視窗預設排成一欄放在主視窗旁邊，超過螢幕底部要換下一欄（`currentMonitor()` 取螢幕大小）。
- window-state 外掛會把視窗位置寫在 App 設定資料夾；測試時用自訂設定資料夾也一樣會寫到使用者真正的資料夾。解法：`with_filename(絕對路徑)`（外掛用 `app_dir.join(filename)`，絕對路徑會取代）。

## 資源用量（實測，0.1.1，重播中的「場」尺寸，2026-10-05）

- 私有記憶體約 190 MB：主程式 31 MB，其餘是 WebView2。CPU 約一個核心的 3.8%。
- Windows 安裝檔：1.26 MiB（0.1.0）→ 1.91 MiB（0.1.1，加了更新外掛）。

## App 內更新（tauri-plugin-updater）

- **設定裡沒有 `plugins.updater`（含 `pubkey`）時，App 啟動就會失敗**：外掛的設定沒有預設值。
- 更新檔簽章用維護者自己的金鑰（跟 Apple 憑證無關），**私鑰遺失就再也推不了更新**。金鑰由維護者用腳本產生並放進 GitHub Secrets，Claude 不經手。
- 只在有金鑰時才產生更新檔（`tauri.updater.conf.json` 的 `createUpdaterArtifacts`），fork 沒有金鑰也能照常建置。
- `requireSignedVersion: true` 可用：這版 CLI 會把版本號寫進簽章的 trusted comment（實際解開過）。
- **macOS 的更新檔只從 `app` 打包產生**：只打包 `dmg` 時 `latest.json` 沒有 macOS。要 `--bundles app,dmg`。
- 判斷能不能自己更新：Windows 看 exe 旁邊有沒有 NSIS 寫的 `uninstall.exe`（免安裝 zip 沒有）；macOS 要在 `.app` 裡、不是從磁碟映像或 App Translocation 路徑執行；Linux 只有 AppImage。
- 驗證 GitHub 上的簽章和 App 裡的公鑰是同一把：寫個 minisign 驗證（ed25519 + BLAKE2b-512）比對，Basesmall 有做過。
- 端到端實測法：用丟棄式金鑰建兩版（舊版指向本機 `latest.json`），裝舊版、按更新、看它自動裝新版並重開，再靜默解除安裝。

## Windows 安裝檔（NSIS）

- `installMode: currentUser`：只裝給目前使用者，不需要系統管理員，更新時也不跳 UAC。
- `/S` 靜默安裝；解除安裝靜默時**不會**刪 App 資料（只有勾了核取方塊才刪）。
- 沒有程式碼簽章 → SmartScreen 警告。另外提供免安裝 zip 給不能裝程式的公司電腦。

## macOS 簽章與公證

- Developer ID 憑證可以在 Windows 上產生（openssl），維護者自己跑腳本，Claude 不經手私鑰與密碼。
- GitHub Actions：**`APPLE_*` 環境變數只要「存在」（即使是空字串）Tauri 就當成要簽**，空的會讓建置失敗。只把有值的寫進 `GITHUB_ENV`。沒有憑證時退回 ad-hoc 簽章（`signingIdentity: "-"`）。
- 驗證：在 Mac 上 `codesign --verify --deep --strict`、`xcrun stapler validate`、把 App 標成網路下載後 `spctl -a -vvv -t exec`。
- `gh secret set` 從標準輸入讀值時會去掉結尾換行。

## 測試與自動化

- **不動真正的游標，也能在 App 裡測滑鼠**：啟動時設 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` 和獨立的 `WEBVIEW2_USER_DATA_FOLDER`，再用 DevTools 協定（CDP）送 `Input.dispatchMouseEvent`、讀 DOM、截圖（`Page.captureScreenshot`，可設 3 倍解析度出宣傳圖）。對視窗 PostMessage 送 WM_MOUSEMOVE 觸發不了 hover。
- 測試時一律用另一個設定資料夾（Basesmall 用 `BASESMALL_CONFIG_DIR`），不要碰使用者的設定。
- 加啟動參數讓測試可重現：`--game`、`--seek`、`--paused`、`--tier`、`--set=key:value`。
- 網頁的 `fetch` 預設可能拿 `stale-while-revalidate` 的舊快取，直播延遲會多好幾秒；`cache: 'no-cache'` 把延遲從 17 秒降到 13 秒（同時並排實測）。

## Windows 工具雜項

- PowerShell 5.1 呼叫外部程式時，空字串參數會被丟掉，後面的參數全部往前位移。
- `Get-CimInstance Win32_Process` 在這台機器上很慢，會讓腳本逾時；找子程序可改用 `Get-Process` 加啟動時間過濾。

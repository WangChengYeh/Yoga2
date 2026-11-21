# Yoga2 · 3D 瑜伽練習室

手機網頁的女性 3D 教練，結合三動作帶練、真人去背入場、AI 骨架與語音互動。

- 網站：[GitHub Pages](https://wangchengyeh.github.io/Yoga2/)
- 最新開發版本：**v0.9.6**。發布／驗證結果見 [測試與驗收](docs/TESTING.md)。網站右上角版號可檢查更新。
- 文件入口：[docs/README.md](docs/README.md)

## 使用方式

1. 進入頁面後預設嘗試啟用相機、語音輸入與本機 AI；語音回覆和帶練輸出預設勾選。首次請允許相機／麥克風權限；瀏覽器要求操作時，點「啟用相機與語音」。
2. 相機開啟即去背入場，教練在左、真人在右，沒有獨立預覽視窗。手機需實際拍到全身才會顯示真人全身；不補出畫面外的腿腳。
3. 按開始帶練：站姿上舉伸展 16 秒、左右側伸展 32 秒、展臂開胸 20 秒，1× 合計 68 秒。支援暫停、重播、選動作與變速。
4. 可說「暫停」「繼續」「再一次」「慢一點」，或詢問動作與要領。收到說話事件就暫停，回答播完才依原先播放狀態接續；語音失敗時保留文字，課程保持暫停。
5. 全螢幕保留相機、退出與播放／倒數，其餘選項放在「⋯」。AI 骨架預設顯示，教練骨架可另開啟。

每次造訪只自動嘗試啟用一次；手動關閉或切背景後不自行重啟。AI 預設啟用會嘗試下載模型；不需要時可關閉。瀏覽器權限、語音及 WebGPU 支援仍決定實際可用功能。

## AI 與語音

本機 AI 使用 WebLLM 與 Qwen2.5-0.5B-Instruct 4-bit 模型。首次模型下載估計 300–500 MB，模型記憶體預算約 1 GB，均非本手機的實測值。模型就緒後生成階段口令並回答問題；未就緒、關閉或生成無效時使用基本口令。開始／暫停等控制由程式處理。

語音辨識使用瀏覽器 SpeechRecognition，語音輸出使用 SpeechSynthesis；服務可能依賴網路。第一次點擊會以靜音語音準備發聲，優先本機中文聲音。輸出失敗保留錯誤代碼與文字，不再連帶關閉麥克風；按「啟用相機與語音」重試。這無法繞過瀏覽器的使用者手勢政策。

相機與姿勢在本機分析；本機 AI 不接收影像，網站不保存錄音或問答紀錄。關閉 AI 或切背景會釋放模型 Worker，下載快取可能保留。診斷與資料邊界見 [除錯指南](docs/DEBUGGING.md)。

## 畫面與能力範圍

Luna 預設正面站立。教練與真人左右固定，比例校準後鎖定，伸展變寬不拉伸人像或移動站位。橫向以雙手上舉到腳底約佔場景高度 80% 取景；直向窄螢幕以完整伸展可見為優先。教練不隨半身相機輸入裁切。

真人是去背影像平面，並非完整 3D 人體重建。姿勢回饋只觀察手腕上舉、側傾方向與展臂高度；低信心、多人、暗處、出框或過期時停止相關判斷。單鏡頭估計無法保證動作正確或安全。

## 問題回報

「回報問題」可打包相機輸入、場景圖、版號、尺寸及診斷資料。**主動送出會公開上傳照片至 GitHub。** 專用 GitHub App 預計代建 Issue，訪客不用登入；目前尚未確認 App 完成安裝，不能視為匿名回報已驗收。設定與復原見 [後端文件](debug-server/README.md)。

## 本機開發與發布

需求：Node.js 22+。

```sh
npm ci
npm run check
npm run build
python3 -m http.server 8080 --directory dist
```

開啟 `http://localhost:8080`；正式相機使用 HTTPS 或 localhost。勿直接開啟 HTML 檔。

GitHub Pages 沿用 `main` 根目錄發布。`src/index.html` 為共用介面來源；build 同步根目錄 `index.html`，並產生自帶執行素材的 `dist/` 供其他靜態主機使用。Pages 使用固定版本 jsDelivr 模組，首次需連網。

發布時更新 package 與 lockfile 版號，執行 build，一併提交 `src/release.js`、`version.json`、根首頁與模組版本參數。CI 檢查語法、測試、建置、首頁同步及真實人像模型；Pages 發布為獨立工作。操作及驗證清單見 [TESTING.md](docs/TESTING.md)。

## 原始碼索引

| 位置 | 職責 |
| --- | --- |
| `src/app.js`、`course.js`、`motion.js`、`rig.js` | 場景、課程、動作與角色骨架 |
| `src/default-media.js` | 預設啟用與點擊重試協調 |
| `src/camera-session.js`、`pose-*` | 相機生命週期、推論與有限姿勢規則 |
| `src/human-*`、`cutout-core.js`、`skeleton.js` | 去背、固定構圖與關節顯示 |
| `src/voice-*`、`guidance.js`、`ai-guidance.js` | 聆聽、語音輸出、說話暫停與 AI 口令 |
| `src/local-ai*`、`ai-diagnostics.js` | 模型載入、快取復原、問答與錯誤診斷 |
| `src/report-*`、`debug-server/` | 回報打包、擷取與專用 GitHub App 後端 |
| `tests/`、`scripts/` | 回歸測試、模型準備、建置與離線檢查 |

角色為 CC0 素材衍生的 Luna；來源與授權見 [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md)。

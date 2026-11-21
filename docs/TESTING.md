# 測試與驗收

現行開發版本 v0.9.8。執行紀錄與發布狀態見 [VALIDATION](logs/VALIDATION.md)；歷史測試數量不代表目前結果。

## 重現自動檢查

```sh
npm ci
npm run check
npm run build
npm run test:portrait
```

`check` 包含語法檢查與 Node 測試；`build` 驗證素材並產生靜態網站。人像整合另需 Python 3.12 與 CPU 執行依賴，準備方式見 [fixtures](../tests/fixtures/README.md)。CI 每次 main 推送重跑上述檢查，並確認根目錄首頁與共用介面同步。

本機最新已完成 260 項 Node 測試與建置。人像整合為獨立 5 項，不能未執行就併入通過數。

## 功能與測試對照

以下檔名均位於 `tests/`。

| 功能 | 測試 | 驗證重點 |
| --- | --- | --- |
| M1／M5 角色與動作 | `character-asset`、`rig`、`motion`、`mouth` | 真實 GLB、站姿朝向、腳部穩定、上舉／側伸展／展臂與嘴型 |
| M2 課程 | `course` | 16／48／68 秒邊界、暫停、倍速、跳轉、重播、完成與背景 |
| M3 相機與規則 | `camera-session`、`pose-rules` | 授權／取消／釋放、單幀排程、低信心／多人／過期與穩定判斷 |
| M4 語音與帶練 | `voice-intents`、`voice-session`、`guidance`、`voice-guidance-panel` | 基本控制、問答、文字回音過濾、播放時非回音文字打斷、回答後接續、錯誤不自動繼續 |
| M4.5 更新 | `update` | 版號、no-store、同版重載、子路徑、網路錯誤與重複點擊 |
| M6 去背與構圖 | `cutout`、`portrait-mask`、`human-panel`、`practice-layout` | 同幀、鏡像、遮罩清理、固定位置／縮放、全身取景與資源釋放 |
| 全螢幕 | `fullscreen`、`fullscreen-tools` | 原生／備援、旋轉比例、原控制移入更多選單及還原 |
| M7 骨架 | `skeleton` | 關節信心、線條／球、非等比縮放、真實模型與過期清理 |
| M8 回報 | `report`、`github-app-report` | PNG／ZIP、尺寸與缺圖、來源／身分、RSA／AES、限流、CAS 與防重複 |
| 本機 AI | `local-ai`、`local-ai-model` | GPU／Worker／逾時、取消、診斷、空分片驗證與限定一次快取復原 |
| AI 帶練 | `ai-guidance`、`voice-guidance-panel` | 預先生成、短句檢查、3 秒回退、問答優先、過時回覆隔離 |
| v0.9.6 預設媒體 | `default-media`、`voice-session`、`voice-guidance-panel` | 同步請求、不重複啟用、背景不重開、AI 一次啟用、靜音準備、播放錯誤與保留聆聽 |
| v0.9.8 進場與對話 | `default-media`、`voice-guidance-panel`、`voice-intents`、`local-ai` | 先招呼再載入、點擊有聲重試、不重複招呼、不自動開始、標準 AI／重試、短暫對話與清除 |
| 真實人像（另跑） | `portrait.integration.mjs` | 實際模型去背、頭肩骨架、不補腿腳與橫直向構圖 |

表中除 `.mjs` 外檔名皆以 `.test.js` 結尾。CameraSession 類別本身不會建構即請求權限；app 的 default-media 協調器明確啟動，兩層測試對應不同責任。

## 手機驗收清單

每次記錄版本、手機型號、OS、瀏覽器版本、螢幕方向、首次或已快取，以及權限狀態。

- [ ] 首次允許相機與麥克風；拒絕後提示可重試，沒有連續權限請求。
- [ ] 未開始帶練即有聲招呼；瀏覽器阻擋後點擊可重試，開始聊天或帶練後不重複招呼。
- [ ] AI 為標準配備，無開關；自動載入、失敗原因與重試；返回前景準備模型，基本功能不等待 AI；觀察下載時間與真實記憶體行為。
- [ ] 「你好／等一下／準備好了」回應自然，明確準備後才開始；上一輪追問有上下文，背景返回不保留舊問答。
- [ ] 點擊後能播放基本與 AI 語音；播放錯誤顯示代碼，仍可收音與觸控操作。
- [ ] 教練發聲與 AI 思考時收音不中斷；非回音的 interim 即停止發聲／暫停動作，舊回答不能恢復課程；等最新回答播完再繼續；原本暫停、明確暫停、失敗與背景不自動恢復。
- [ ] 教練全身與上舉指尖可見；橫向約 80% 場景高；真人伸展不變寬拉伸、不漂移。
- [ ] 近距離／半身／全身、遮擋與多人；不顯示舊骨架，兩人線條可讀。
- [ ] 全螢幕精簡、更多選單、旋轉、退出與瀏覽器返回後的啟用按鈕正常。
- [ ] 手動關閉、切背景、離開後停止裝置；返回不自行重開。
- [ ] App 安裝就緒後，以未登入手機送出一份回報，核對實際 Issue、兩張圖片、JSON 與 ZIP。
- [ ] 連續五分鐘記錄幀率、延遲、耗電、發熱與語音／3D 同時執行品質。

自動測試包含替身相機、語音與 GPU；真實人像 CPU 測試不等於 Safari WASM／WebGPU 或即時相機實測。離線 Blender 圖也不是手機截圖。雲端瀏覽器曾無 WebGL，無法據此完成角色渲染驗收。

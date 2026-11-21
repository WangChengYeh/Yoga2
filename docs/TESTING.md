# 測試與驗收

現行開發版本 v0.9.15。執行紀錄與發布狀態見 [VALIDATION](logs/VALIDATION.md)；歷史測試數量不代表目前結果。

## 重現自動檢查

```sh
npm ci
npm run check
npm run build
npm run test:portrait
```

`check` 包含語法檢查與 Node 測試；`build` 驗證素材並產生靜態網站。人像整合另需 Python 3.12 與 CPU 執行依賴，準備方式見 [fixtures](../tests/fixtures/README.md)。CI 每次 main 推送重跑上述檢查，並確認根目錄首頁與共用介面同步。

本機最新已完成 308 項 Node 測試與建置。人像整合為獨立 5 項，不能未執行就併入通過數。

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
| v0.9.8 進場與對話 | `default-media`、`voice-guidance-panel`、`voice-intents`、`local-ai` | AI 啟動後生成招呼、點擊有聲重試、不重複招呼、不自動開始、標準 AI／重試、短暫對話與清除 |
| v0.9.11 音訊復原 | `voice-session`、`voice-guidance-panel`、`default-media` | 無靜音 primer、有聲重播、預設 voice、孤兒佇列、保留 mic、過期句清理、診斷隱私與複製 |
| v0.9.12 本機包與日誌 | `report-panel`、`runtime-log`、`fullscreen-tools` | 無後端下載、圖片省略、擷取失敗降級、同份回報、併發、Blob URL 回收、前次紀錄、去重與隱私 |
| v0.9.13 真實包回歸 | `voice-session`、`voice-guidance-panel`、`camera-session`、`cutout`、`default-media` | 未互動不假逾時、明確啟用、mic 錯誤不取消 TTS、重啟保留播放、招呼期間不預取、相機階段／幀數 |
| v0.9.14 收音事件與截圖 | `voice-session`、`voice-guidance-panel`、`report-panel` | 擷取／聲音／說話／結果、回音與手動控制區分、24 筆上限／晚到、截圖選單／訊息排除 |
| 真實人像（另跑） | `portrait.integration.mjs` | 實際模型去背、頭肩骨架、不補腿腳與橫直向構圖 |

表中除 `.mjs` 外檔名皆以 `.test.js` 結尾。CameraSession 類別本身不會建構即請求權限；app 的 default-media 協調器明確啟動，兩層測試對應不同責任。

## 手機驗收清單

每次記錄版本、手機型號、OS、瀏覽器版本、螢幕方向、首次或已快取，以及權限狀態。

- [ ] 首次允許相機與麥克風；拒絕後提示可重試，沒有連續權限請求。
- [ ] AI 下載／啟動期間不播招呼；ready 後 AI 生成並嘗試發聲，無需開始帶練。
- [ ] 播放被擋時「和 Luna 打招呼」仍可見；相機／麥克風成功不會誤收起它；取消後可重試，招呼完成才收起。
- [ ] 生成或播放期間先開口／開始帶練／切背景，遲到招呼不能插入；招呼完成不自動開始。
- [ ] AI 為標準配備，無開關；自動載入、失敗原因與重試；返回前景準備模型，基本功能不等待 AI；觀察下載時間與真實記憶體行為。
- [ ] 「你好／等一下／準備好了」回應自然，明確準備後才開始；上一輪追問有上下文，背景返回不保留舊問答。
- [ ] 點擊後能播放基本與 AI 語音；start-timeout 時保留文字、mic 與引擎快照，「重試聲音」直接播失敗句、使用系統預設聲音；一般點擊不意外重播。
- [ ] 首次完全沒有頁面互動時直接看到「和 Luna 打招呼」，點擊後播放，不先出 start-timeout；重啟聆聽不重播或切斷招呼。
- [ ] 下載 ZIP 中 microphone 的 audio-start／speech-start／result 有實際事件與時間；教練發聲時是否仍有回報，回音與接受的 final 分開。沒有回報時標為未知，不宣稱硬體無聲。
- [ ] 場景圖不被下載選單、打包訊息遮住；真人／教練與主要播放控制仍保留，原始相機圖不變。
- [ ] 語音輸入服務失敗顯示精確代碼，正在說話的教練繼續；若是問答，不因輸入錯誤自動恢復動作。
- [ ] 語音錯誤後複製診斷，確認 paused／pending／speaking、聲音數量、手勢與事件時間，不含回答文字；錯誤後的新問題不重播舊回答。
- [ ] 教練發聲與 AI 思考時收音不中斷；非回音的 interim 即停止發聲／暫停動作，舊回答不能恢復課程；等最新回答播完再繼續；原本暫停、明確暫停、失敗與背景不自動恢復。
- [ ] 教練全身與上舉指尖可見；橫向約 80% 場景高；真人伸展不變寬拉伸、不漂移。
- [ ] 近距離／半身／全身、遮擋與多人；不顯示舊骨架，兩人線條可讀。
- [ ] 全螢幕精簡、更多選單、旋轉、退出與瀏覽器返回後的啟用按鈕正常。
- [ ] 手動關閉、切背景、離開後停止裝置；返回不自行重開。
- [ ] 未登入且回報服務未啟用時下載 ZIP；核對相機圖／場景／版號／尺寸／聲音引擎／runtime，手機自動下載被擋仍可點「儲存 ZIP」。
- [ ] 精簡日誌不擷取圖片／呼叫渲染，沒有相機權限或 WebGL 不可用仍可下載；完整截圖失敗可降級。
- [ ] 閃退後重開下載精簡日誌，核對 previous／previousSessionUnclean；不能把該旗標當成 crash 或 RAM 不足的證據。
- [ ] App 安裝就緒後，以未登入手機送出一份回報，核對實際 Issue、兩張圖片、JSON 與 ZIP。
- [ ] 連續五分鐘記錄幀率、延遲、耗電、發熱與語音／3D 同時執行品質。

自動測試包含替身相機、語音與 GPU；真實人像 CPU 測試不等於 Safari WASM／WebGPU 或即時相機實測。離線 Blender 圖也不是手機截圖。雲端瀏覽器曾無 WebGL，無法據此完成角色渲染驗收。

- `tests/activity-log.test.js`：骨架抽樣頻率／容量、隱藏關節、時間對齊、快照隔離及操作選項過濾。

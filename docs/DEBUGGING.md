# 除錯與日誌指南

先記錄網站版號、裝置與瀏覽器、橫直向／全螢幕、權限、操作順序，再保存畫面上的完整錯誤。不要只記「AI 不能用」或把所有載入失敗歸為記憶體不足。

## 本機 AI

在 AI 選項展開／複製診斷。內容包含版本、瀏覽器能力、GPU 限制、失敗階段、錯誤碼、原始名稱／訊息、資源路徑及最近階段事件（上限 16 筆）；實際欄位依失敗時已取得資訊而異。

| 現象或代碼 | 能判定的範圍 | 處理 |
| --- | --- | --- |
| WebGPU 不支援／adapter 為 null | 瀏覽器未提供可用 GPU；null 沒有底層原因 | 保留能力資訊，使用基本指令；不宣稱 RAM 不足 |
| `GPU_CHECK_TIMEOUT` | GPU 檢查超過 10 秒，尚未開始模型下載 | 保存主頁／Worker 階段，再手動重試 |
| `MODEL_LOAD_ERROR` | 模型下載、編譯或配置失敗 | 依原始錯誤及資源請求判讀，不只看總括訊息 |
| `Tensor-cache ... exceeds shard size 0` | 讀到空分片 | v0.9.4 起使用 IndexedDB，僅針對損壞清指定模型並重試一次 |
| `MODEL_SHARD_INVALID` | 分片驗證／單次復原後仍失敗 | 保存驗證大小、資源與復原紀錄，再決定是否手動重新下載 |
| 載入／回答逾時 | 載入 180 秒／回答 45 秒保護已觸發 | 保存當時階段；不能據此確定手機效能或網路根因 |
| `Illegal invocation` | 曾確認是原生計時器接收者錯誤 | v0.9.2 已修；先核對更新是否生效 |

「重新下載模型」清除本模型 IndexedDB 快取；會重新耗用下載流量。一般 GPU、記憶體或網路錯誤不會自動盲目重下載。舊 Cache API 權重不再使用，但可能仍佔儲存空間。

## AI 啟動後招呼（v0.9.10）

流程為：模型下載／啟動 → ready → AI 生成招呼 → 嘗試語音播放 → 等使用者回應。不在下載前播固定開場；招呼本身不會啟動課程。生成使用模型 request，但不把合成的招呼指令寫入使用者短暫問答記憶。

瀏覽器阻擋時，場景保留「和 Luna 打招呼」，點擊直接播放準備好的有聲招呼。捕捉階段略過同一按鈕，避免點擊處理兩次；重開聆聽後才發聲，避免 enable() 先取消招呼。播放開始與完成分開記錄；僅 onend 完成才收起入口，先被使用者插話則轉交對話，不重複招呼。

診斷布林值：`welcomeDelivered` 為已收到播放開始，`welcomeCompleted` 為收到結束，`welcomePreparing` 為生成中，`welcomeEngaged` 為使用者已介入。這些事件不證明手機喇叭實際有聲；仍需現場確認音量、裝置輸出及瀏覽器狀態。

AI 對話無開關，進入即準備；失敗按「重試 AI 教練」。切背景釋放，返回前景或 bfcache 還原時重新準備模型；不因此重開相機／聆聽。上一輪問答各最多 96 字，只在記憶體接續對話，不進診斷／回報，停用或背景時清除。

## 語音播放

語音輸入與輸出分開判讀。v0.9.6 起在獨立語音播放狀態保留代碼，回報診斷包含 `lastAudioError`、`audioBlocked`；錯誤紀錄可能保留上次失敗，應搭配當下狀態與重現步驟判讀。

| 代碼 | 含義 |
| --- | --- |
| `not-allowed` | 合成器回報不允許播放；可能需要點擊啟用 |
| `start-timeout` | 10 秒內沒有收到語音開始事件 |
| `playback-timeout` | 已開始但 60 秒內沒有正常結束 |
| `prime-timeout` | 舊版靜音準備逾時；v0.9.11 已移除靜音 utterance |
| `prime-failed`／其他名稱 | 保留合成器事件或例外代碼，尚未分類的原因需依裝置重現 |

v0.9.11 點「重試聲音」直接重播保留的失敗句子；不再用音量 0 的句子宣告已準備。只有真正 utterance.onstart 才標記播放已啟動。start-timeout 重試改用系統預設語音（lang=zh-TW），不指定先前的 voice 物件。原生引擎存在沒有本程式對應 utterance 的佇列時先清理；不因播放關閉 mic，也不假裝這已證實手機根因。輸出失敗不再關閉麥克風，文字保留，該次課程不自動恢復。若語音辨識本身拒絕／失敗，仍可能獨立停止聆聽。

### start-timeout 的診斷與證據

10 秒內未收到開始事件只代表事件未到，無法單憑此判定是手勢、聲音包、佇列、音訊路由或同時收播。錯誤下方「複製聲音診斷」包含版號、瀏覽器、失敗時的 paused／pending／speaking、voiceCount、要求的語系、userActivation（不支援時 null）、收音實例及最近 12 筆事件時間；不含句子、影像、錄音或模型問答。Clipboard 失敗可長按文字。回報問題也會帶相同引擎摘要。

新問題與手動跳轉會清除過期重試；音訊仍被阻擋時，新文字回答替換重試目標。一般頁面點擊只預載聲音清單，不會偷偷重播；明確按重試才發聲。失敗後重播不恢復原先已取消的自動接續意圖。

參考：[WebKit Bug 321436](https://bugs.webkit.org/show_bug.cgi?id=321436) 的開發者回報提及 iOS 收播互相影響與 TTS pending 卡住；[Web Speech API issue 96](https://github.com/WebAudio/web-speech-api/issues/96) 將此歸為瀏覽器實作問題。這些是相似案例，不能直接當成此手機的根因。保留 mic 是產品要求；不強制改成半雙工，也未宣稱原生 iOS API 保證可同時收播。

## 播放時插話（v0.9.7）

語音輸出與模型思考不再主動停止辨識，使用 continuous 模式；瀏覽器結束一輪時重新連接，手動關閉／背景／權限或服務錯誤才停止。診斷的 `listening` 是開啟意圖，`recognitionAttached` 是當下辨識實例是否存在，不能只看前者認定硬體正收音。

播放期間 speechstart 無法區分人聲與喇叭，故等待第一個非回音的 interim／final 文字才取消 TTS、嘴型與舊 AI 問答。未播放且無回音尾段時仍可由 speechstart 暫停。文字比對忽略標點，濾掉目前口令片段及結束後 1.2 秒的尾音；獨立暫停等短控制可通過（與整句口令完全相同時仍視為回音）。這不是聲學消回音，辨識錯字、混音或使用者重複原句仍可能誤判，需手機實測。

目前沒有另開 WebAudio 麥克風或完整 AEC 管線，也不宣稱瀏覽器保證全雙工。若手機播音時本身中止辨識，請保存服務錯誤、狀態、喇叭／耳機模式與 OS／瀏覽器資訊。

## 真實包判讀與 v0.9.13 修正

已收到 v0.9.12 真實手機包。AI 約 6 秒 ready，初次招呼時 userActivation 的 active／hasBeenActive 都是 false，佇列 pending／speaking／paused 均 false，仍有 69 個 voice。約 10 秒後逾時；之後使用者點擊且改用 system-default，開始事件距 speak-request 為 46 ms。兩個條件同時改變，不能獨立證明是手勢或指定 voice；目前更不應把它當作佇列已卡住或模型未載入。

v0.9.13 在明確得知頁面尚無互動時先保留句子、顯示啟用按鈕，不製造 10 秒逾時。當前回答也可等啟用再播放，期間保持暫停。初次點擊走已觀察到成功的系統 voice 路徑。互動 API 不存在時不猜測，維持原播放／錯誤處理。

包內另有一次 voice error，但沒有 speech error；按原程式路徑判讀，與語音輸入服務出錯後呼叫整個 stop() 一致，原包未記錄具體辨識錯誤碼，無法回補。現在輸入錯誤只停止辨識，保留 TTS 及其 watchdog，另外記 lastRecognitionError／恢復時間；不因重開 mic 取消招呼。手動「停止語音」與背景仍停止全部。錯誤後不自動恢復課程。

相機為 active、video readyState=4，但結果 stale、無配對推論幀與人像校準；不能單憑 readyState 說相機仍正常更新，也不能確定卡在去背模型載入。新增 pipeline 的 attempts／accepted／slow／inFlightAgeMs、lastAcceptedAgeMs、lastVideoTime／videoCurrentTime、tracks（狀態／muted／enabled），engine stage 可分 capture-frame、portrait-loading、pose-inference、portrait-inference、mask-compose。這些是診斷增補，尚未宣稱修好相機卡住。

包內前次有 pagehide／background，previousSessionUnclean=false，沒有記錄 JS／WebGL／GPU OOM 錯誤。這只代表此包沒抓到崩潰證據，不能排除其他時間曾 crash；GPU 的 maxBufferSize 不是可用 RAM。原始 ZIP 與照片不放公開 repo，僅去識別化 flags／相對時序存成測試 fixture。

## 本機下載與 crash 線索（v0.9.12）

一般畫面「下載除錯包」，全螢幕從「⋯」開啟，選完整除錯包或精簡日誌。成功準備後自動嘗試下載，並保留可由使用者點擊的「儲存 ZIP」連結；應用程式只能確認 ZIP 已備妥，無法確認手機已寫進檔案 App。換新包或 dispose 會回收舊 Blob URL，不自動上傳。線上回報服務未設定、被擋或限流不影響本機下載；已有待送回報時可下載相同 report ID 與快照。

完整包可能含照片；精簡包只含 diagnostics.json／report.zip，不讀人體影像、不呼叫 render／screenshot。完整版擷取拋出錯誤時嘗試降級；若瀏覽器整個程序被終止，JS catch 無法完成打包，需重開後選精簡日誌。

`runtime` 包含目前與前一次最多各 32 筆事件，近期紀錄存於本機 localStorage；只留 allowlist 的階段、錯誤名稱／類別、來源檔名、行列與時間。全域 error／unhandledrejection 只記錄結構化線索，記憶體相關字串僅標為 hint，不代表已證實記憶體不足。不留原始訊息、stack、對話或影像；載入進度去重，避免頻繁同步寫入。儲存被拒／損壞不阻擋網站，診斷標明 persistence。

`previousSessionUnclean` 只表示上一筆前景活動紀錄沒等到正常離開／背景事件。強制關閉、系統回收、重新載入或崩潰都可能缺最後事件；反之，背景先記成 inactive 再被終止也不一定有未正常標記。因此不能用它確診 crash，更無法代替 OS crash dump。另記錄 WebGL context loss、AI phase／code、語音 phase／code、手動課程控制及開始擷取，供比對時間。

## 圖像、構圖與回報

先確認相機實際拍到的範圍，真人腿腳出框無法補回；教練則應維持全身。記錄校準、鏡像、場景尺寸、DPR、全螢幕及當前動作。比例錯誤先保留原狀態，再試重新校準，便於比較。

一鍵回報含 `camera.png`、`scene.png`、`diagnostics.json`、`report.zip`。相機圖優先採推論同幀原始未鏡像 RGB；無有效幀時標明缺圖或即時備援未配對。場景圖包含網頁練習區，沒有其他 App 或瀏覽器工具列。專用 App 尚待安裝驗收；完整設定見 [後端文件](../debug-server/README.md)。

## 日誌與公開資料

- 程式診斷不含影像、骨架或問答；資源 URL 去除 query／fragment，錯誤訊息會刪除問題字串。不自動上傳。
- 主動一鍵回報是另一流程，**會包含照片與診斷並公開至 GitHub**；送出前確認畫面內容。
- 執行輸出可重導向本機檔案，例如 `npm run check > /tmp/yoga-check.log 2>&1`。`*.log`、`test-results/`、`.venv/` 與 `dist/` 已忽略，不納入 git。
- 長期追查只保存必要的去識別摘要、可重現步驟、版本與結論，寫入 [問題日誌](logs/ISSUES.md)；測試指令／結果寫入 [驗證日誌](logs/VALIDATION.md)。
- 不保存或貼出權杖、私鑰、cookie、一次性 code、管理者帳號及完整對話。後端金鑰名稱與部署規則見其 README；不可任意旋轉已用於加密 App 設定的金鑰。

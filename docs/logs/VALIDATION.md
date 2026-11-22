# 驗證執行日誌

日期採台灣時間；下表只記錄已有證據的執行結果。不將替身測試視為手機驗收，也不將本機通過視為已發布。

## 2026-11-22 · v0.9.25

- 相機 Debug 原圖疊加局部骨架，解除全身課程有效性對 Debug 的限制；不啟用去背，加入粗骨線及關節點。
- 本機 411 項 Node 測試及建置通過；新增 4 項局部骨架與生命週期測試。CI／Pages 待發布後補記；手機真實半身顯示仍待使用者實測。

## 2026-11-22 · v0.9.24（M1 實作，實機驗收待完成）

- 路線圖 M1：Luna + 男性學員 GLB、最小 quaternion 映射、confidence/mirror/stale、固定站位比例、預設關閉去背、保留原始觀測及語音控制。
- 本機 `npm run check`：407 項通過，0 失敗／跳過；`npm run build`、`git diff --check` 通過。四動作離線骨架視覺圖見 [M1 記錄](../DUAL_AVATAR.md)。
- 實作提交 `d958b96`，測試啟動器修正 `1ac26fd`。[CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44999441028)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44999440421) 均成功：407 項 Node、6 個 Chromium 版面案例、獨立 5 項真實人像回歸。首輪 CI `44999285833` 因選用 Chromium 啟動逾時失敗，改優先用 Chrome 後通過。
- 正式頁顯示 v0.9.24；雲端瀏覽器全螢幕設定標題量測為 235×24 px、14 px 字級。該瀏覽器沒有 WebGL，角色顯示僅以實際骨變換的離線圖驗證，不能視為手機驗收。iPhone Safari／真實相機三動作／前後效能／30 分鐘尚未驗收。

## 2026-11-22 · v0.9.23

- GPU 區段結束改採 WebGL fence／WebGPU queue 完成通知，保留 API／SDK 往返另列。未知留空，容量／逾時／生命週期／來源與通知延遲進面板及 ZIP。
- `npm run check`：399 項通過，0 失敗／跳過；`npm run build`、`git diff --check` 通過。涵蓋真完成時序、非阻塞查詢、批次與 queue 不保留、原生 API 語意、reject／逾時／遲到／readonly、GPU 統計定義與 UI。
- 實作提交 `415b2a7`；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44988095709)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44988095214) 均成功，包含真實人像／骨架 CPU 回歸。正式 version.json HTTP 200 且為 0.9.23。iPhone 實際支援、觀測開銷、三十分鐘與真正 GPU 利用率未驗收；完成通知含排隊／通知延遲。

## 2026-11-22 · v0.9.22

- 依使用者修正，採 task 起訖／CPU／GPU 歸類估算 loading：CPU 重疊累加，LLM 全歸 GPU task；GPU 區段去重、排隊另列。線上面板 1／5／15／30 分鐘、基準比較、觀測 FPS 與除錯包。
- `npm run check`：387 項通過，0 失敗／跳過；`npm run build`、`git diff --check` 通過。含 CPU 200%、GPU 去重、背景／邊界／小於 1 ms、長時間容量、面板及相機／CPU 四階段回歸。
- 實作提交 `872ab9d`；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44986229159)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44986228924) 均成功，含真實人像／骨架 CPU 回歸。正式 version.json HTTP 200 且為 0.9.22。手機三十分鐘與硬體使用率未驗收。此版不含獨立保留的防噪修改。

## 2026-11-22 · v0.9.21

- 應用層排程、可調 3D／相機／辨識 FPS、三級自動降規、含排隊的 LLM 回覆期限與取消回收。預設 30／20 FPS、辨識 3 FPS、等待 8 秒。
- `npm run check`：374 項通過，0 失敗／跳過；`npm run build`、`git diff --check` 通過。新測試覆蓋排程順序、背景／致命封鎖、FPS 更新競態、降規／恢復、回覆逾時、原生取消確認及卡死回收；保留既有語音回歸。
- 實作提交 `79cb520`；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44983194543)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44983194422) 均成功，CI 含真實人像／骨架 CPU 回歸。正式 `version.json` HTTP 200 且為 `0.9.21`。尚未完成實機三十分鐘驗收，不宣稱已修復 OOM 或 crash。

## 2026-11-22 · v0.9.20

- 實作修訂規劃中的記憶體診斷，保留原語音行為。每五秒／最近五分鐘、關鍵任務邊界、錯誤固定快照、前次小型數值摘要及 ZIP 獨立 JSON。
- `npm run check`：353 項通過，0 失敗／跳過。包含 GPU 追蹤原 API 語意／readonly 降級、數值估算與未知值、取樣／淘汰／持久化／錯誤、模型／推論／清理邊界、MediaPipe 載入、ZIP 獨立檔與語音回歸。`npm run build`、`git diff --check` 通過。
- GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44978177691)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44978177339) 均成功；實作提交 `310febb`。CI 含真實人像／骨架 CPU 回歸。尚未執行 iPhone 真實 GPU 配置與三十分鐘穩定性驗收，無法由單元測試推定 OOM 根因。

## 2026-11-22 · v0.9.19

- 依要求新增 1K 並設預設，遷移舊偏好避免自動重回 4K／16K。1K 以感知／骨架摘要縮小 prompt，完整來源留在除錯包。
- `npm run check`：339 項通過，0 失敗／跳過；含兩種精度的三種 window、遷移、1K prompt／來源快照分離、未知值及持久化 1K 狀態。`npm run build`、`git diff --check` 通過。
- GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44957096157)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44957095861) 均成功；實作提交 `c45d44f`。CI 含真實人像／骨架 CPU 回歸；手機 crash 是否改善仍待實測。

## 2026-11-22 · v0.9.18

- 依使用者指定新增 4K／16K 選項，預設 4K，模式選擇與實際啟用狀態分開記錄。保留兩種模式的雙骨架資料。
- `npm run check`：335 項通過，0 失敗／跳過；涵蓋兩個精度分支的 4K／16K worker reload、儲存、切換／舊回呼、失敗狀態、面板／mic 與持久化日誌。`npm run build`、`git diff --check` 通過。
- GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44956366261)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44956366155) 均成功；實作提交 `82d9139`。CI 含真實人像／骨架 CPU 回歸；兩種模式的手機 RAM 用量與穩定性仍待實測。

## 2026-11-22 · v0.9.17

- 真人相機規則結果／33 個關節、Luna 真實 rig 的 22 個關節及互動狀態接入對話／問候／口令 worker；上下文依使用者要求設為 16K。
- `npm run check`：327 項通過，0 失敗／跳過，含實際 worker 傳輸、真人過期／關閉／切課程、真實 Luna 隱藏骨架圖層仍可取得關節、姿勢問句與六輪記憶。`npm run build` 與 `git diff --check` 通過。
- GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44955103490)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44955103038) 均成功；實作提交 `1878d53`。CI 包含真實人像／骨架 CPU 回歸；16K 的手機記憶體／延遲及實際回覆品質仍待實機驗證。

## 2026-11-22 · v0.9.16

- 讀取使用者 v0.9.15 除錯包，確認兩次手動重開辨識後各成功問答一輪，回答正常結束後沒有後續輸入事件；未據此斷言原生根因。
- `npm run check`：317 項通過、0 失敗／跳過，含正式面板三輪問答與輸入連線重建、打斷、停止／失敗。`npm run build` 與 `git diff --check` 通過。
- GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44953540327)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44953539652) 均成功；實作提交 `2d6e2ca`。CI 包含真實人像／骨架 CPU 回歸；iPhone 連續問答待實機驗證。

## 2026-11-22 · v0.9.15

- 操作／課程／語音狀態與每秒身體骨架加入本機除錯時間線，不新增影音擷取。
- `npm run check`：312 項通過，0 失敗／跳過；`npm run build` 通過，`git diff --check` 通過。
- GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44952447453)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44952446644) 均成功，實作提交 `de700291414ab6a47009b467887a1747e54ca101`；CI 含真實人像／骨架 CPU 回歸。尚無新版實機驗收。

## 2026-11-22 · v0.9.14

- 讀取第二份使用者 v0.9.13 ZIP 與 scene.png。確認語音事件與相機結果更新，截圖含下載介面遮擋；未由包內證據定位 crash。
- `npm run check`：308 項通過，0 失敗／跳過；含麥克風事件／計數、無內容、回音／手動區分、晚到及截圖 clone。
- `npm run build` 通過、素材雜湊驗證完成；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44951500143)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44951499536) 均成功，對應實作提交 [761d269](https://github.com/WangChengYeh/Yoga2/commit/761d2693b503f565dbaeafdf11d825a2638c22c7)。CI 含獨立真實人像 CPU 回歸。尚未取得新版手機收音事件。

## 2026-11-22 · v0.9.13

- 實際讀取 v0.9.12 使用者 ZIP：diagnostics.json、camera.png、scene.png；原檔不加入 repo。去識別化旗標與相對時序 fixture 僅用於回歸。
- `npm run check`：301 項通過，0 失敗／跳過；含首次啟用、mic 失敗保留 TTS、恢復、暫停意圖、預取抑制與相機管線資料。
- `npm run build` 通過、素材雜湊驗證完成；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44949950567)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44949950565) 均成功，對應實作提交 [24c7e77](https://github.com/WangChengYeh/Yoga2/commit/24c7e7780b1528bcf505f0ff88eae1004bc21de6)。CI 含獨立真實人像 CPU 回歸。真實包有開始／完成事件，不代表已確認喇叭音訊；也沒有足夠 crash 根因證據。

## 2026-11-22 · v0.9.12

- `npm run check`：289 項通過，0 失敗／跳過；含本機 ZIP 流程、精簡包不渲染、失敗／併發／晚到及 URL 釋放，runtime 跨重開與隱私。
- 儲存／crash 測試用事件及儲存替身，沒有模擬 OS kill，也不能確認手機已將檔案寫入本機。
- `npm run build` 通過、素材雜湊驗證完成；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44948121531)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44948120932) 均成功，對應實作提交 [6527d72](https://github.com/WangChengYeh/Yoga2/commit/6527d72392d5e067941f098ae2a0a61a45af92c4)。CI 含獨立真實人像 CPU 回歸。手機 ZIP 儲存與 crash 根因待實測。

## 2026-11-22 · v0.9.11

- `npm run check`：276 項通過，0 失敗／跳過；含 start-timeout 系統 voice 重試、孤兒佇列、無靜音 primer、mic 保留、內容更新／取消及診斷複製。
- 以語音引擎替身模擬 pending／paused 與不發事件，不代表已重現使用者 iPhone 的底層原因。
- `npm run build` 通過、素材雜湊驗證完成；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44946624142)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44946623762) 均成功，對應實作提交 [f555b01](https://github.com/WangChengYeh/Yoga2/commit/f555b0182e0a5b52297ce8a7f656bbefac9b789c)。CI 含獨立真實人像 CPU 回歸。手機實際發聲與同時收播待驗收。

## 2026-11-22 · v0.9.10

- `npm run check`：268 項通過，0 失敗／跳過；含 AI ready 招呼、按鈕時序與取消回歸。
- 驗證下載期間零招呼、ready 後生成／播放、招呼結束不開始、失敗與取消入口保留、遲到招呼隔離、合成指令不進問答記憶。
- `npm run build` 通過，保留最新版推論排隊及相關測試；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44945268336)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44945267416) 均成功，對應實作提交 [94e0ffa](https://github.com/WangChengYeh/Yoga2/commit/94e0ffa31d0f87f78d980f7804ff7cdf7a9f916f)。CI 亦通過獨立真實人像 CPU 整合。手機實際聲音待驗收。

## 2026-11-21 · v0.9.8

- `npm run check`：260 項通過，0 失敗／跳過；含語法檢查。
- 涵蓋進場招呼、未開始即有聲、點擊重試、靜音／背景／對話保護、插話、標準 AI／重試及短暫記憶清除。
- `npm run build` 通過，模型雜湊驗證完成；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44902682319)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44902682135) 均成功，對應實作提交 [061702c](https://github.com/WangChengYeh/Yoga2/commit/061702c326ea2034846c031e5e27fcc2cb4c7b19)。手機初次發聲與 AI 對話品質待驗收。

## 2026-11-21 · v0.9.7

- `npm run check`：249 項通過，0 失敗／跳過；含語法與插話整合測試。
- 測試涵蓋 TTS／AI 思考時收音、回音片段、連續 final 去重、打斷舊語音／AI 與保留課程恢復意圖。
- `npm run build` 通過、模型雜湊驗證完成；GitHub [CI](https://github.com/WangChengYeh/Yoga2/actions/runs/44901476431)／[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44901475914) 均成功，對應實作提交 [0a47717](https://github.com/WangChengYeh/Yoga2/commit/0a47717d9db394b44b1697d23653bcdccc387c3f)；手機實際同時收播與回音仍待驗收。

## 2026-11-21 · v0.9.6

| 檢查 | 結果／證據 | 限制 |
| --- | --- | --- |
| `npm run check` | 通過：242 項、0 失敗、0 跳過；包含語法檢查 | 相機、語音、GPU 部分使用替身 |
| `npm run build` | 通過；Luna、Pose Lite 與人像模型雜湊驗證，產生 dist | 建置不驗證手機播放 |
| 文件整理 | 現行說明、規劃、版本日誌、問題／驗證日誌分開，舊筆記封存 | 相對 Markdown 連結已檢查可解析；不代表外部服務已啟用 |
| GitHub CI／Pages | 通過：[Check Yoga2](https://github.com/WangChengYeh/Yoga2/actions/runs/44900600583)、[Pages](https://github.com/WangChengYeh/Yoga2/actions/runs/44900599566) | 對應下列實作提交；不代表手機驗收 |
| iPhone 語音與自動啟用 | 待實機驗收 | 尚無手機錯誤碼與聲音成功證據 |

已驗證實作提交：[95e9c70](https://github.com/WangChengYeh/Yoga2/commit/95e9c704e4266a005c09f9551297ad66d802df36)。CI 包含獨立真實人像 CPU 整合測試；本次後續文件補記不修改執行程式。

## v0.9.5 · 前一個發布版本

- main commit：`31b4bda8abd3e7f61519e1af91079a44a28f2288`。
- GitHub 的 Check Yoga2 與 Pages 工作均成功；本段不代表 v0.9.6 已發布。
- AI 口令整合測試驗證預先生成、回退、問答中斷與恢復；中文生成與手機延遲仍需實機。

## v0.9.4 · 分片調查與使用者回覆

- 在調查環境下載官方首分片得到 HTTP 200、68,067,328 bytes，與 manifest 一致。
- 這只確認該次上游資源正確，不能證明使用者手機的網路或快取正常，也不能判定手機空分片根因。
- IndexedDB／分片復原修正後，使用者表示「可以了」；沒有量測該手機記憶體或記錄完整下載時序。

## 早期圖像與模型驗證

- 真實人像 CPU 整合有獨立 5 項測試，來源、數值與重現方式見 [fixtures](../../tests/fixtures/README.md)。CI 會重跑，新增發布需查當次結果。
- 教練姿勢使用正式 GLB 骨架與蒙皮頂點驗證；布局與角色離線渲染詳見 [歷史筆記](../archive/development-notes.md)。
- 雲端瀏覽器曾無 WebGL，僅驗證不支援提示；不作為手機 3D 畫面、觸控或即時相機成功的證據。

後續每次發布追加日期、版本、commit、指令、通過／失敗數與工作連結；手機另加裝置、OS、瀏覽器和操作結果。原始 log 不進 git。

## 2026-11-22 · v0.9.29 自動取景／M3

- `npm run check`：457/457 Node 測試通過；`npm run build` 成功，首頁同步。
- 瀏覽器正式 DOM/CSS：72/72 幾何組合通過，涵蓋橫直向、全螢幕、Debug 開關／關相機、相機比例與提示。修正小橫向無提示時 viewport 遮到播放列的回歸。
- 實際 GLB／合成動作 ESM 頁面可載入、切全螢幕、切上舉；相機距離由站姿約 3.78 變上舉約 4.32，合成 envelope 投影 max |NDC| 約 0.79，保持邊界內。這是目前瀏覽器頁面合成驗證，不是使用者 MacBook 測量。
- 此瀏覽器 WebGL 無法啟用，rig QA 明確使用 CPU 骨架投影；未驗證 GPU 材質、真人姿勢精度、真實 TTS 時間或 30 分鐘手機穩定性。上述項目續追 #11，不阻擋下一里程碑。
- 發布 CI／合併狀態以 v0.9.29 發布 PR 的實際結果為準。

## 2026-11-22 · v0.9.30 M4 雙 factor

- Node：472/472 通過；靜態 build／首頁同步成功。
- 72/72 正式 DOM/CSS 版面幾何組合通過；合成 UI 成功載入正式 workload module，獨立 CPU／GPU 壓力分別產生 0.75 降載，手動 CPU 0.5 在停用自動後仍保留、GPU 回 1。
- 合成 1800 秒控制器基準：三段過載，自動需求 44415 render frames vs 固定 54000，因子降至 .25 後恢復 1；課程 68 秒完成。這是模擬輸入下的需求總量，不是實際 FPS、效能／節電提升或裝置長時間測試。
- iPhone／MacBook 真實幀率、發熱、記憶體與 30 分鐘穩定性尚未驗證，續追 #11，不阻擋後續工作；發布 CI／合併以 v0.9.30 PR 為準。

## 2026-11-22 · v0.9.31 M5 首版

- Node 新增個人化模型與 UI 回歸；最終測試數量 483。build／首頁同步檢查。
- 72/72 瀏覽器幾何組合通過；正式 module／既有測試照片 JPEG decode、preview、IndexedDB transaction 完成後保存、重載恢復與刪除後重載還原均成功。另確認保存前立即重載不視為保存完成，介面以 transaction 完成訊息為準。
- 實際 GLB 下載 793620 bytes、5 skins × 22 joints、一張 PNG、Head 個人網格；重新解析後 inspectHumanoidRig compatible。只記錄結構／數量，不提交個人模型或新照片。
- 靜態 geometry 比較見 benchmarks/avatar-resources.json；它不是手機 FPS／記憶體／發熱基準。此瀏覽器無 WebGL，GPU 外觀與 iPhone Safari／真人相似度／30 分鐘裝置驗證尚未完成，留 #11。
- 發布 CI／合併以 v0.9.31 PR 實際結果為準。

## 2026-11-22 · v0.9.32

- `npm run check`：489 tests passed；`npm run build`：passed。
- 實際三張私人全身照片：生成／暫時預覽／IndexedDB 保存／重載／重新編輯／GLB 下載完成。輸出骨架可回讀；照片與生成檔案未公開。
- Blender CPU 三視角渲染完成：模型不再因透明背景造成肢體缺損，但仍有接縫／腿部貼圖拉伸與模板比例差異。非精確重建。
- 瀏覽器 WebGL 不可用；本項不宣稱實際 GPU／iPhone Safari／長時間效能通過。品質與裝置驗證保持 #11／#18 非阻擋追蹤。
- 72/72 瀏覽器 Debug／Hint 版面組合通過（零失敗）。

## 2026-11-23 · v0.9.36 場景啟動

私人 v0.9.34 除錯包顯示 scene-load 未開始、WebGL model-load-before 無紀錄、scheduler blockedReason=scene-error、相機後續 WORK_CANCELLED。不能據此斷言裝置不支援 WebGL 或記憶體不足。原始除錯包與圖片未公開。

新增嚴格 Window 計時器 receiver 回歸：修正前 scene-load 在 clearTimeout 階段重現 TypeError、init 不執行；修正後場景 admission 及 TTL cleanup 可完成。修正 globalThis 呼叫並保留啟動階段／錯誤碼診斷。iPhone 實機恢復仍需觀察，不阻擋發布。v0.9.35 比例修正 PR #22 已在 CI 通過後合併。

## 2026-11-23 · v0.9.37

- 配對場景回歸覆蓋前／側／背／任意環繞角度：兩人方向一致、螢幕水平方向間距一致。
- 三視圖輪廓區間對位覆蓋雙腿分離、UV 區域與既有 rig／蒙皮／retarget／取景。
- 使用私人原始三圖，透過正式裁切／atlas／UV 模組（Node native canvas 作 Canvas 介面）生成內嵌貼圖 GLB，Blender CPU 離線渲染三方向；不是瀏覽器 WebGL 或 iPhone 驗收。腿部條紋已明顯改善，模板幾何／短褲邊緣及局部接縫仍可能可見。原圖／生成模型／渲染不公開。

## 2026-11-23 · v0.9.38

使用者 v0.9.37 斜側／背面截圖顯示皮膚斑駁，前次三角度預覽不足。改為取樣膚色／服裝配色及模板服裝區域，只在中央正面臉部保留照片細節。實際三圖經完整來源模板（含材質）生成 GLB，Blender CPU 五視角檢查肩膀、側臉、手臂、腰線與腳踝；不是瀏覽器／iPhone 驗收。私人檔案未提交公開 repo。

## 2026-11-23 · v0.9.39

- 501 Node tests／build 通過；含連續上衣與肩帶、兩人相同矩形墊、學員 castShadow／receiveShadow、站姿／展臂／側面墊間距、不對稱 UI 安全區的像素邊界回歸。
- 使用實際標準教練及私人三圖學員 GLB，1536×710、top=86／bottom=138 安全區的站姿計算：前版人物約 350.08 px，新版約 437.25 px；站姿中心距約 2 m 收攏至 0.92 m。這是可重現幾何計算，並非裝置 FPS／主觀驗收。
- 完整上衣五角度與雙人墊子／無圓盤／陰影場景已以 Blender CPU 離線渲染檢查；不是 Safari WebGL 截圖，私人素材未公開。

## 2026-11-23 · v0.9.40

自備 GLB 學員：507 Node tests／production build 通過，包含真實模型匯出後重新匯入、骨架對照、動作驅動與同一套保存／取消還原流程。內嵌圖檔在解碼前檢查預算，避免匯入時讀取外部資源。本機 Chromium socket 被執行環境阻擋，版面檢查交由 CI；非實機驗收。私人試作模型與照片未提交。

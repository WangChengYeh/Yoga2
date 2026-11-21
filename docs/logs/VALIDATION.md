# 驗證執行日誌

日期採台灣時間；下表只記錄已有證據的執行結果。不將替身測試視為手機驗收，也不將本機通過視為已發布。

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

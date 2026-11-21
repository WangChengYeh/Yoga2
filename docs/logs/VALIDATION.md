# 驗證執行日誌

日期採台灣時間；下表只記錄已有證據的執行結果。不將替身測試視為手機驗收，也不將本機通過視為已發布。

## 2026-11-22 · v0.9.14

- 讀取第二份使用者 v0.9.13 ZIP 與 scene.png。確認語音事件與相機結果更新，截圖含下載介面遮擋；未由包內證據定位 crash。
- `npm run check`：308 項通過，0 失敗／跳過；含麥克風事件／計數、無內容、回音／手動區分、晚到及截圖 clone。
- `npm run build` 通過、素材雜湊驗證完成；CI／Pages 待提交後確認。尚未取得新版手機收音事件。

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

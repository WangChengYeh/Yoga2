# CPU／GPU task loading（v0.9.23）

設定區展開「CPU／GPU 長時間效能監測」；全螢幕在「⋯」。面板收起仍收集、每秒彙整；展開後表格每秒、曲線每五秒更新。可選最近 1／5／15／30 分鐘，資料不跨重新整理保存。

## 計算方式

依使用者要求，以 task 大致開始／結束時間、CPU／GPU 歸類計算 loading；GPU 結束改採完成通知，沒有加入硬體計數器或改動 SDK 的 GPU 裝置配置。

| 分類 | task | 計時範圍 |
| --- | --- | --- |
| CPU 主緒 | 3D 動畫、構圖、人物更新 | 本幀更新開始到繪圖提交前 |
| CPU 辨識 | 骨架、去背、影格複製、遮罩 | 各同步 CPU/WASM 呼叫區段，worker 回傳 duration |
| CPU 主緒 | 效能面板更新 | 展開時表格／曲線更新耗時 |
| GPU task | LLM GPU 完成通知 | queue 工作提交開始至 onSubmittedWorkDone 的 Promise 回呼，checkpoint 批次合併，包含載入與推論的可觀測 GPU 提交 |
| GPU task | 3D GPU 完成通知 | render 呼叫開始至 fence 首次確認完成，最多約每 8 ms 輪詢；瀏覽器延遲可能更長 |
| GPU 另列 | 提交 API／LLM 載入／回覆往返 | 保留原耗時供對照，不納入確認 GPU loading |
| 往返／排隊 | 相機整體、載入、排隊 | 單獨呈現，不再加進 CPU／GPU 總 loading |

CPU loading = 所有 CPU task 前景耗時相加 ÷ 前景觀測時間。允許平行時間 double counting：一秒內兩個 worker 各一秒為 200%，是 task 執行緒時間近似值，不是整台多核心 CPU 用量。圖表縱軸可自動超過 100%。

GPU loading = GPU task 起訖區間聯集 ÷ 前景觀測時間。同類重疊只算一次；LLM 全歸 GPU，以收到完成通知為結束。因此是 GPU **完成通知區段占用**，包含排隊與主執行緒／worker 回呼延遲，不是純 GPU execution，也不宣稱硬體 GPU 核心忙碌率。CPU 與 GPU 可同時運作，不將兩者相加成 100%。

計時只統計前景區段；背景時間不進分母，跨背景的 task 也裁掉該部分。一般 task 已完成才入統計；尚未結束的重任務顯示在目前狀態，完結後補入時間軸。worker 子階段以 duration、收到結果時刻逆序重建大致起訖，可能含排程／傳遞誤差，無法精確對齊每個 CPU 核心。

## 看什麼、如何調整

1. 先觀察一段固定動作，按「記錄基準」。
2. 調整上方一個 FPS 選項，保持其他條件接近，繼續觀察。
3. 對照 CPU／GPU loading、近五秒與區間平均的 3D／相機影格回呼／成功辨識 FPS、各 task 平均耗時差。
4. 自動降規仍可能改變有效值，面板同時列選擇值、生效值、協商值與級別。必要時手動關閉自動降規做固定配置比較。

相機影格回呼不是每秒推論數，也不是保證的感光元件擷取 FPS。不支援回呼或該視窗尚無樣本時顯示未知；沒有把協商 FPS 假裝成實際數值。最近起訖表每類列最後一次，並列提交秒、完成秒與提交後延遲；沒有 submitted 的 CPU／往返 task 顯示未知。時間單位為頁面 performance 時間軸的秒；worker GPU 通知以 performance.timeOrigin + now 對齊後轉回本頁時間。

「清除統計」只重設監測與基準，不改動課程、相機／麥克風或 FPS。切換視窗／調整 FPS 保留基準；重新整理清除。指標不判斷姿勢安全，也不自動改變課程。

## 容量與匯出

- 每秒 bucket，最多最近三十分鐘（含邊界約 1801 格）。每種 task 記累積時間、次數、最大耗時、最早開始／最晚結束。
- 最近原始起訖每種類最多 24 筆；完整長時間資料使用每秒匯總，不保留每一個 render frame 的逐筆紀錄。
- 每秒 GPU 聯集最多 64 段；極密集時合併最小間隔，loading 可能略高估。一般 FPS 配置下通常不需合併。
- task 視窗邊界的累積值／次數以一秒 bucket 近似，GPU 聯集則依區間裁切。短時間／部分 task 跨視窗時平均值需謹慎判讀。
- `diagnostics.json.taskPerformance` 包含視窗、基準、recentSpans 及 buckets。`memory-diagnostics.json` 的 taskPerformance 僅匯總，不反覆放明細。
- 只收數值／固定 task 名稱；不收語音文字、音訊、影像。面板自身更新亦記在 CPU；手機監測額外負載與三十分鐘穩定性待實機驗收。

## 完成通知與降級

- WebGL2：render 後 fenceSync + flush；clientWaitSync(flags=0,timeout=0) 非阻塞檢查，不呼叫 gl.finish。最多四個 pending fence；滿額略過並記數，十秒仍未完成、context lost／wait failed 不生成完成區間。背景／pagehide 刪除 fence 並取消計時，回來可重新收集。
- WebGPU：包裝可寫的 GPUQueue submit／writeBuffer／writeTexture／copyExternalImageToTexture，保留原參數、receiver、回傳與例外；每 queue 一個 checkpoint，期間的新提交合併待下一個 checkpoint。完成後沒有新提交即移除 queue 強參照，不長期保留 device／queue。
- 最多四個 pending queue 狀態；通知每 250 ms 批次送回主緒，最多 64 段。超出批次容量時合併區段並記 mergedGaps，可能略高估。十秒逾時／Promise reject 停止該 queue 的追蹤，模型執行不因觀測失敗而中斷。
- GPUQueue hooks 不可寫或 API 不支援時標未知；部分 hooks 失敗顯示 hook-unavailable，hooks 欄位指出可取得範圍。沒有通知的區段不以 submit 返回或 SDK 回覆補作成功。
- 面板「GPU 已確認 task」只算已回報區間；若部分來源未知、pending 或略過，不能視為整機完整占用。缺資料曲線留空，不填零。原 LLM 回覆期限、inference-done 排程釋放、語音及 CPU 雙算規則維持原行為；完成追蹤不增加同步等待。
- schema 升為 2，新增 render.gpu／ai.gpu，原 render.submit／ai.wall／ai.load 改為另列。不同定義的歷史 v0.9.22 loading 不直接和 v0.9.23 比較。

# 排程與效能（v0.9.30）

設定在相機卡片，全螢幕收在「⋯」，本機保存。CPU／GPU factor 各自可選 100%／75%／50%／25%，預設 100%。有效 factor 取手動上限與各自自動值的較小者；關閉自動降規會恢復手動上限。

| 任務 | 基準 | Factor 與退讓方式 |
| --- | --- | --- |
| 3D 提交／骨架 retarget／自動取景 | 使用者 3D 上限，預設 30 FPS | 乘 min(CPU, GPU)，最低 5 FPS；每次只處理當前課程／最新學員姿勢，不補跑漏幀 |
| 3D 畫素密度 | min(裝置 DPR, 1.75)，省電上限 1 | 再乘 sqrt(GPU factor)，以降低 framebuffer 畫素需求 |
| 相機 | 使用者上限，預設 20 FPS | 乘 CPU factor，再向下選可協商的 5／10／15／20／24／30／60 FPS，最低 5 |
| Pose／Evaluation | 使用者辨識上限，預設 3 FPS | 乘 CPU factor；逐幀以最新有效結果評估，不重播舊結果 |
| 辨識輸入長邊 | 512 px | CPU 低於 1 時 384，25% 時 256；不宣稱模型內部 tensor 會同比縮小 |
| Hint 文字／數值 | 獨立 4 Hz | 重複狀態的數值間隔 250 ms / CPU factor；語意改變、unknown、錯誤及過期立即處理 |
| 自動 LLM 補充 | 預設最短冷卻 20 秒 | 冷卻 / GPU factor；CPU 或 GPU 低於 50%、或兩筆以上 3D fence pending 時不啟動新的補充 |
| 本機課程／糾正 TTS、使用者提問與控制 | 原本語音規則 | 不受自動 LLM gate 限制；提問維持正常等待上限，預設 8 秒 |

AI 載入或較高優先的推論排隊／執行時，3D 仍最高 15 FPS；省電模式最高 24 FPS，均不會超過使用者選擇。相機 applyConstraints 不重新索取權限、不開第二條串流；不支援／失敗保留串流並顯示實際協商值。上限與要求值不代表實際 FPS。25% 預算可能不足以在短停留時間確認姿勢，此時維持未知而不猜測。

## 雙控制器與防震盪

`workload-budget.js` 的 `DualWorkload` 取代 app 舊單一等級控制。每秒取樣一次，CPU／GPU 各自有 1、0.75、0.5、0.25 四階：

- CPU：本機已量到的主緒渲染更新／提交與 worker 子步驟耗時累加超過窗口 70%、事件迴圈計時延遲超過 150 ms、或可取得的 JS heap 比例超過 85%。缺少 heap API 就是未知。
- GPU：完成通知延遲超過 max(100 ms, 兩個渲染幀預算)，或 3D pending 最老一筆超過 max(250 ms, 三個幀預算)。LLM 與 3D 完成通知都提供壓力證據。GPU API／完成證據缺失時不假設健康或忙碌。
- 一般連續三次壓力才降一階，降載至少間隔 5 秒。超過一秒的辨識延遲、LLM 回覆期限、明確 GPU allocation/device-lost 錯誤可要求立即降一階，仍受 5 秒限制。
- 至少十次健康取樣、距最後壓力與上次變更皆滿 30 秒，才回升一階。GPU 恢復需近期完成證據且沒有 pending。背景清空取樣窗口；超過五秒的取樣中斷不當成健康資料。

這些是應用程式需求控制與耗時代理，不是硬體 CPU／GPU utilization，也不是實際 DRAM／溫度。GPU 完成通知含排隊與 host 回呼延遲；呈現間隔不能指認是哪個資源忙碌。縮圖與降 FPS 不保證降低常駐 LLM 記憶體。策略數值仍需裝置量測調校。

## 優先級、latest-wins 與取消

重任務一次只放行一項，依序為場景載入、使用者 AI／AI 載入、相機載入／辨識、自動解釋。已執行的原生工作不搶占；渲染另設 FPS 預算。

`WorkloadScheduler.acquire` 可指定 key／TTL。同 key 新工作替換尚未執行的舊工作；timer 與放行前各檢查期限，不能因 JS timer 延遲誤放行。相機排隊最多一秒，過期取消後安排下一次最新影格，不能讓相機靜默停止。取得通道後才讀當下影格與 timestamp，推論結果仍需在 1.5 秒內。

自動解釋使用 `ai-guidance` 低優先通道與一秒排隊 TTL。使用者問題保持 `ai-inference` 及既有回覆期限；M3 Hint 的 scope／generation／capture TTL 規則繼續淘汰遲到內容。診斷列出 drop 次數、起訖及有界歷史。課程牆鐘時間、使用者命令、錯誤與追蹤未知狀態不進可丟棄工作佇列。

已送出的 AI 取消／逾時後，仍等待 worker `inference-done` 才釋放通道；五秒未結束會先終止 worker。背景取消排隊、關相機、釋放 AI；前景不自行重開相機／麥克風。致命場景錯誤仍封鎖新工作。

## 診斷、基準與未驗證項目

`diagnostics.json`／`memory-diagnostics.json` 的 `scheduler.adaptive` 保存 CPU/GPU factor、上限、每側原因／樣本、最近窗口及最多 32 次轉換；scheduler 歷史最多 64。效能面板顯示兩個 factor，記錄基準時一併保存，方便前後比較。3D fence 額外列出 oldestPendingMs。

`node scripts/benchmark-workload.mjs` 可重現 [合成結果](benchmarks/m4-synthetic.json)：1800 個一秒窗口包含三段各 90 秒過載，固定需求 54000 個渲染幀，自動控制需求 44415；兩側可降到 0.25 並恢復 1，課程仍在 68 秒結束。這些是固定輸入下的模擬需求，**不是達成 FPS、速度提升、節電或裝置 30 分鐘驗收**。

iPhone 13／MacBook Air M1 的真實 FPS、延遲、記憶體、發熱與持續練習留在 #11，未完成前不得宣稱通過；依擁有者指示不阻擋發版或下一里程碑。

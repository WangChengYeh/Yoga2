# 記憶體診斷 · v0.9.20

目的：為 iPhone 崩潰提供可對照的時間與配置證據，不宣稱已確認 OOM，也不將可觀測估算誤當實際 RAM。

## 除錯包

完整與精簡 ZIP 都有獨立 `memory-diagnostics.json`，包括 `samples`、任務 `events`、`lastError`、`lastSnapshot`、`previous` 與可取得程度說明。為相容目前線上後端，新增 JSON 只放在 ZIP 裡，不增加頂層上傳表單附件，也不膨脹原有 diagnostics.json。語音辨識／播放路徑不改，只檢查既有回歸。

前景要求每 5000 ms 採樣，最多 60 筆，按實際時間淘汰超過 300000 ms 的紀錄；瀏覽器節流、背景或剛進頁面時可能不足 60 筆。任務快照同樣保留五分鐘，另限制最多 180 筆；高頻事件時可能先觸及容量上限。最後錯誤快照獨立保留，不會隨時間窗淘汰。不在每個相機影格保存全套快照。

## 數值意義

| 模組 | 已取得 | 限制 |
| --- | --- | --- |
| JavaScript | 支援 performance.memory 時的 used／total／limit | JS heap 不是系統或 GPU 記憶體；Safari 不支援則 available=false、數值 null |
| WebLLM | 模型、階段、選擇／載入／啟用 window、已收到的 shard bytes、可用 usage tokens | shard bytes 是已觀察到的資料傳輸量，非權重常駐 GPU 大小；快取載入時可能沒有 fetch bytes |
| KV | 依 context 或 usage 的 FP16／FP32 dense KV 容量情境 | 假設 Qwen2.5-0.5B 的 24 層、2 KV heads、64 head dim；不是執行器實際配置 |
| WebGPU | worker 內可攔截的 createBuffer／destroy 次數、未 destroy 的宣告 size、峰值、配置拋錯、device lost／uncaptured error 類別 | 不含 texture、driver、其他 worker、回收延遲；未 destroy 的宣告容量不是實體存活量。prototype 不可寫則 supported=false |
| WebGL | renderer.info 資源數、JS 幾何／材質／陰影資源、drawing buffer 尺寸、容量估算 | 圖片以 RGBA8+mipmap 估算；typed texture 依背後資料大小；depth/MSAA/driver 與不可見 render targets 不全可得。不呼叫 readPixels 或同步 GPU 查詢 |
| MediaPipe | 階段、推論耗時／在途狀態、去背載入、觀察到的去背模型 bytes、處理 canvas 尺寸 | 內部 WASM allocator 與完整常駐模型記憶體沒有公開讀取，記 null |
| Camera | 解析度、協商 FPS、單一 RGBA 影格容量估算、已知保留 RGBA arrays 的 byteLength | 協商 FPS 不是實測來源 FPS；不知相機 decoder／OS 緩衝數量 |
| 系統 DRAM | available=false、bytes=null | 不以 GPU 單一 buffer 上限或手機規格推算目前可用 RAM |

**上述資料互相重疊，不得相加為總 DRAM。** KV 假設來自 [官方 MLC 模型設定](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/blob/main/mlc-chat-config.json)。

## 關鍵任務與時間

記錄 WebLLM 模型載入前後、每次實際送出的推論前後、worker 終止前後、3D 模型載入前後、相機狀態與 MediaPipe 去背模型載入前後。錯誤記錄 JavaScript 類別、WebGL context lost、可觀察的 WebGPU 配置／device lost 以及 AI 失敗代碼；不保存錯誤原文、stack、問答、影像或骨架座標。

WebGPU 統計在 worker 回報並於前景五秒採樣時要求更新。`gpu.at` 與 `gpuSnapshotAgeMs` 可辨識主頁看到的統計是否較舊。driver 或 OS 強制終止時可能沒有回報，不能假造最後快照。正常 device.destroy 的 lost reason=destroyed 以生命週期事件記錄，不判作 OOM。

每三十秒保存小型數值摘要，模型載入邊界、每次模型啟動的首次推論、錯誤、背景、前景與 worker 完成釋放時另保存；key=`yoga2.memory.v1`。下一次讀取只接受已知摘要欄位，含最後數值與獨立錯誤摘要。active=true 未清除僅是異常結束線索，不能證明 crash；重新整理也可能留下相同線索。LocalStorage 被拒／容量不足不阻止 app，診斷標示 persistence=false。

## 實機驗證

同一台手機、相同場景／相機位置，分別測 1K／4K／16K。確認 selected 與 active 一致才開始比較；先下載精簡 ZIP，避免圖片打包本身的額外負擔。iPhone 13 連續三十分鐘不崩潰仍是待驗收目標；單元測試通過不代表已達標。此版僅加入診斷，不調整 FPS、人物比例或自動降級。


v0.9.21：每份記憶體快照另含 `scheduler`，記錄排程 active／queued、renderFPS、設定偏好與 adaptive 級別／原因／最近辨識與畫面延遲。`webllm.response` 記錄等待上限、結果及耗時；`camera.effective` 與 `pipeline.fps` 分開記錄選擇／生效／協商值。詳見 [排程與效能](PERFORMANCE.md)。

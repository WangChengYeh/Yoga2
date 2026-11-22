# 個人化男性 Avatar 首版 — v0.9.31

用一張正面照建立照片臉部貼圖，配上參數化 3D 頭型與標準運動身體。這一版手動裁切／對位，不宣稱自動 Face Landmark、Blendshape、逼真側臉或完整頭部重建。

## 操作

1. 「建立／編輯 Avatar」；全螢幕可由 ⋯ 的「個人化學員照片／外觀」退出到設定卡。
2. 確認有權使用照片並同意本機處理，再選 JPEG／PNG／WebP（最多 12 MB、128 px 以上、4000 萬畫素以內）。照片先縮至長邊最多 1536 px。
3. 將臉對齊裁切橢圓、眼睛對齊虛線，可調頭寬／高、膚色、髮色／髮型與上衣。
4. 「預覽到右側」建立暫時模型，不寫入儲存；練習會先暫停。看完可用浮動返回按鈕回到照片設定。
5. 「本次套用」只用於本次；若原有保存資料，下次仍沿用原保存角色。「保存並套用」才替換本機存檔。取消／關閉編輯／撤回處理同意／離開頁面會清除未確認預覽，還原先前角色。
6. 「刪除並還原預設」移除本站 IndexedDB 記錄與當前外觀；儲存區刪除失敗會明確提醒，可重試或清網站資料。
7. 可準備並下載含完整骨架／蒙皮／內嵌貼圖的 GLB；不提供未驗證的 VRM 匯出。

## 技術與資料邊界

`avatar-profile.js` 驗證並裁切為 512×512 JPEG；`student-model.js` 建立原創曲面頭部（含簡單鼻部起伏），臉部網格 725 頂點，蒙皮至既有 Head，身體不換骨架。`personal-avatar.js` 維持 Yoga2-Humanoid-1 的 22 骨骼／skin，使用已有 Three.js 與 GLTFExporter，不新增雲端服務或生成 AI。建立／編輯／載入時才處理照片，練習期間只 retarget 和 render。

持久資料在**目前網站 origin 的 IndexedDB `yoga2.avatar.v1` / `profiles` / `current`**：只含 schema、受限外觀參數與衍生 JPEG Blob，不存原始照片、檔名、EXIF、Face Landmarks 或 GLB 副本。下次以這些資料重建同一標準骨架；輸入 canvas、取消的 texture／geometry、圖片與下載 Object URL 會釋放。Preview 不保存；保存以 IndexedDB transaction complete 為準。

沒有自動照片上傳、付費 API、跨裝置同步或練習時人像生成。正常網站素材下載與既有媒體功能照原規則。診斷只記模式／大小／建立耗時／錯誤數，不附照片、裁切座標或外觀參數。GLB 與場景截圖本身會含個人臉部；使用者主動公開回報時需留意原有相機／場景公開上傳說明。刪除本站資料不會刪除已另存的 GLB、截圖或使用者自行公開的回報。

## 方案選擇與授權

本版沿用已使用的 Three.js（MIT）與 Yoga2 原創標準男性幾何，不加入新的模型授權依賴。個人照片不因匯出而取得 CC0 授權；匯出 metadata 區分原創幾何與 user-provided appearance。

[#8](https://github.com/WangChengYeh/Yoga2/issues/8) 的 [face-to-blendshape-3d](https://github.com/arturwyroslak/face-to-blendshape-3d) 與 [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web) 仍是未採用候選；沒有把其 README 宣稱當成本專案已完成的 Safari／授權／rig 整合驗證。若後續做自動對位／幾何擬合，再驗證所採程式與模型資產授權、輸出骨架及手機 PoC。手動參數化版本不需要這些 runtime 依賴。

## 證據與限制

- `personal-avatar.test.js`：有界輸入／資料模型、實際加權曲面、22-bone 契約、Head 旋轉、retarget／根節點與自動取景包覆、尺寸失敗釋放、儲存 transaction。
- `avatar-panel.test.js`：同意 gate、preview／cancel、保存／重載／刪除、session-only 保留原存檔、quota／刪除失敗、遲到 restore、關閉／離開／撤回同意。
- 瀏覽器使用既有測試照片完成真實 JPEG decode → preview → IndexedDB 保存 → reload → GLB → 刪除 → reload。下載 GLB 為 793620 bytes，5 個 skins、每個 22 joints、一張內嵌 PNG；重新解析後 rig 相容。檔案大小依照片內容變動，這不是最大值承諾。
- [靜態資源比較](benchmarks/avatar-resources.json) 可用 `node scripts/benchmark-avatar.mjs` 重製：預設 6 meshes／3159 vertices／4536 triangles；個人化 5／3182／4872，另加 512² RGBA 貼圖估算。貼圖估算不是實際 GPU／DRAM 使用量。
- 此環境無法啟用 WebGL，操作、骨架與檔案證據不代表真實 GPU 臉部外觀已驗收。iPhone Safari 圖片方向／色彩／隱私儲存、側臉品質、GLB 外部軟體、30 分鐘 FPS／熱／記憶體與真人相似度續追 #11，非阻擋。

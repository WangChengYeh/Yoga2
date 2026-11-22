# 雙 Avatar 自動取景 — v0.9.29

預設啟用「自動取景」（全螢幕在 ⋯），依兩個 Avatar 當前姿勢讓人物盡量大，並保留完整模型與介面邊界。取消後可手動縮放；旋轉視角仍保留。

`auto-framing.js` 於載入時把每個 skin influence 的頂點範圍預算成骨骼局部盒。逐幀僅更新盒角，再以透視投影解出容納所有點的最小距離；不逐幀重算三萬多個 Luna 頂點。非負正規化 skin blend 位於這些點的凸包內；無效權重、非 skin mesh 或超出預算範圍的 morph 會用精確 bounds fallback。教練平台、地板與瑜伽墊不列入人物取景。

預設投影填滿率 92%，另以 ResizeObserver 快取目前按鈕／提示／播放列的邊界；Debug 在獨立區域，已從 viewport 排除。鏡頭中心平順追隨兩個模型，距離擴張立即生效，收縮以指數插值靠近。人物站位與身體比例不變。窄畫面或寬動作受橫向邊界限制，仍可能無法佔滿高度；這是完整人物可見的必要取捨。

`autoFraming` 診斷含目前／所需距離、點數、幀數與填滿率，CPU 工作另記 `framing.cpu`。實際 GLB 頂點包覆、姿勢切換、轉向、橫直向、UI 邊界與 morph fallback 由 `tests/auto-framing.test.js` 驗證。投影檢查是數學與合成姿勢證據，不是 MacBook 實機截圖或 GPU 效能數據；裝置驗證繼續追蹤 #11。

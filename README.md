# Yoga2 · 3D 瑜伽練習室

手機網頁的 3D 女性教練原型。完整分期規劃見 [3D_Yoga_Web_Plan.md](./3D_Yoga_Web_Plan.md)。

## 第一版功能

- 現成女性 GLB 人物、燈光、瑜伽墊與基本場景。
- 手指拖曳旋轉、雙指縮放，正面／側面／背面及視角重設。
- 自製 16 秒雙臂上舉示範，支援播放、暫停、重播、進度拖曳及播放速度。
- 模型載入與失敗提示、重試、WebGL 不支援或 context lost 提示。
- 省電模式降低像素比及繪製頻率，切到背景時暫停播放。
- 無攝影機、麥克風、帳號或 AI API；本階段沒有外部 AI 執行費。

角色為臨時素材，服裝與動作仍待後續調整。示範為骨架動作原型，尚未經瑜伽教練校正。素材來源與使用條件見 [THIRD_PARTY_ASSETS.md](./THIRD_PARTY_ASSETS.md)。Git 不收錄原始人物素材；首次建置會從固定上游版本下載，並驗證 SHA-256。

## 本機執行

需求：Node.js 22 以上。

```sh
npm ci
npm run check
npm run build
python3 -m http.server 8080 --directory dist
```

打開 `http://localhost:8080`。請使用 HTTP 伺服器，不能直接以 `file://` 開啟 HTML。正式部署須提供整個 `dist/`；所有執行資源使用相對網址，可部署於子路徑。

## GitHub Pages

網站路徑：`https://wangchengyeh.github.io/Yoga2/`。沿用儲存庫現有的 **Deploy from a branch → main → / (root)** 設定，GitHub 自動發布根目錄 `index.html`，不需要改成 GitHub Actions 部署來源。

Pages 入口使用固定版本的 jsDelivr Three.js 模組與上游人物 GLB，首次開啟需要連網。`npm run build` 另產生所有執行素材放在同一網站的 `dist/` 版本，適合其他靜態主機。`scripts/sync-pages.mjs` 由共用 HTML 產生 Pages 首頁，避免兩版介面不同步；修改介面後執行建置並一併提交更新的 `index.html`。

`.github/workflows/pages.yml` 執行語法、建置、動作及模型測試；網站發布由 GitHub 原有的 Pages 流程處理，避免兩個部署工作互相覆蓋。

## 檔案結構

| 位置 | 用途 |
| --- | --- |
| `src/index.html`、`src/style.css` | 繁體中文介面、手機排版 |
| `src/app.js` | Three.js 場景、角色載入、骨架控制、播放器 |
| `src/motion.js`、`src/rig.js` | 伸展時間軸、提示規則與骨架方向控制 |
| `public/models/` | GLB 人物素材 |
| `scripts/build.mjs` | 複製網頁、模型及必要的 Three.js 模組到 dist |
| `tests/` | 動作時間軸、真實模型骨架與手腳位置測試 |

## 第一版驗收

- [x] 實作女性角色、視角切換及示範播放。
- [x] 實作載入、錯誤與重試介面。
- [ ] 目標 iPhone／Android 實機：確認全身與上舉手臂可見。
- [ ] 實機記錄首次載入秒數、播放是否流暢、連續 5 分鐘的發熱情況。

桌面瀏覽器檢查不能取代手機實機驗收。模型就緒時間會顯示在開發者主控台 `Yoga2: model ready in …s`。

目前檢查紀錄：程式語法、建置、時間軸與真實 GLB 骨架測試通過；雲端測試瀏覽器的 WebGL 被停用，已確認失敗提示正常，但未完成 3D 渲染與觸控互動實測。

## 下一階段

Milestone 2：挑選並校正三個瑜伽動作，加入順序帶練與課程倒數。

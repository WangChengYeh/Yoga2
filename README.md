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

儲存庫包含 `.github/workflows/pages.yml`。在 GitHub 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**（首次啟用需要管理員操作）。之後每次推送到 `main` 都會檢查、建置並部署。

網站路徑：`https://wangchengyeh.github.io/Yoga2/`。首次設定後，可到 **Actions → Build and deploy Yoga2 to GitHub Pages → Run workflow** 手動觸發；部署成功前這個路徑可能尚無網站。

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

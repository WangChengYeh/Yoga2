# Yoga2 M8 回報服務

Pages 維持主入口；這個 Worker 是只有專案擁有者可登入的回報視窗。

- 正式端點：https://yoga2-studio-wcy.workspace-540288.chatgpt.site
- 來源只接受 `https://wangchengyeh.github.io` 的 opener；核對視窗、origin 與隨機回報 ID。不要把本機測試 origin 加進正式 allowlist。
- Worker 的 API 只接受同源 POST、平台驗證的 `oai-authenticated-user-id`、明確上傳同意及最多 8 MB 的附件。私有存取由 Sites 平台執行。
- GitHub 連線來自該次請求的 `ctx.props.CONNECTORS`，不使用前端 token、作者連線快照或服務存取 token 冒充訪客。
- 固定目標為 `WangChengYeh/Yoga2`。檔案保存在 `debug-reports/<visitor+report hash>`，Issue 使用不可變 commit URL 引用圖片與 ZIP。main 不包含回報附件。
- GitHub create-ref 原子操作是送 Issue 前的唯一認領鎖。並行／不確定結果不自動重播 create_issue；重試先檢查最新 100 筆 Issues 的標記。回報已認領但 Issue 未確認時，顯示不確定狀態供查詢，保留分支，不聲稱成功。若舊 Issue 超過查詢範圍，仍不會建立第二筆。
- 部分上傳失敗可能留下未引用 blob，或已認領而未建立 Issue 的分支。保留供除錯，需維護者查看 GitHub 確認結果。此實作優先避免重複 Issue。
- 回報視窗登入／GitHub 初次授權由平台處理。若驗證流程切斷 opener，需回到練習頁按「重試回報」，保留原來的回報 ID 與影像；不會偷偷重拍新圖。

## 部署

這份目錄是可審查的後端來源副本；正式版本使用獨立 Sites source checkout。沿用既有 Site ID `appgprj_6b0108eeefec819197af972806ca03a9` 與 owner-only 權限，不能把 Yoga2 主站 checkout 覆蓋成 Worker。

在 Sites source 的 `.openai/hosting.json` 宣告 GitHub plugin/connector（以當前 eligibility 回傳 ID 為準），`action_selection_mode: all`，移除 `static`。由 `bash scripts/build.sh` 產生 `dist/server/index.js`，`node scripts/validate-artifact.mjs` 驗證，再使用 Sites 的 source/package/deploy 流程。無環境密鑰。

## 驗證界線

`tests/report.test.js` 涵蓋打包、擷取、入口驗證、provider result、並行、重試與限流。模擬 connector 測試不證明已完成訪客 GitHub 授權。必須從 GitHub Pages 在手機登入後實際回報，確認 Issue 中兩張圖、JSON、ZIP 正確；雲端測試瀏覽器無 WebGL，不能替代手機的合成畫面驗收。

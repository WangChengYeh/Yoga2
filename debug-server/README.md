# Yoga2 匿名回報：專用 GitHub App（v0.8.2）

一般訪客不用 GitHub／ChatGPT 帳號或 repo 權限。Pages 的「回報問題」會擷取、打包，再由這個 Worker 用專用 App 上傳附件和建立 Issue。固定 repo：`WangChengYeh/Yoga2`。

- 回報服務：https://yoga2-studio-wcy.workspace-540288.chatgpt.site
- 一次性管理者設定：https://yoga2-studio-wcy.workspace-540288.chatgpt.site/setup
- 設定完成狀態：`GET /api/status`（僅回傳 ready／mode，不洩漏憑證）

## 擁有者只需設定一次

1. 開啟 `/setup`，使用擁有這個專案的 ChatGPT 帳號登入。這是管理者設定，一般訪客不會遇到登入要求。
2. 按「準備專用 GitHub App」，再按「在 GitHub 建立專用 App」，以 **WangChengYeh** 在 GitHub 核准建立。
3. 回到設定頁，按「在 GitHub 安裝至 Yoga2」。選 **Only select repositories → Yoga2**，核准 Contents: write、Issues: write；不需要 user OAuth、組織管理或其他 repo 權限。
4. GitHub 返回設定頁時自動檢查安裝；若沒有返回，按「檢查安裝結果」。顯示「已啟用」後，匿名回報即啟用。

不用手動下載、貼上或傳送私鑰。GitHub manifest callback 由後端交換一次性 code，僅保存 App ID、client ID、slug、私鑰與安裝 ID；不保存多餘的 OAuth client secret。私鑰使用 AES-GCM 加密保存在私有 R2。設定前 API 回傳 503，不會假裝已建立 Issue。

## 憑證與邊界

- Secrets：`REPORT_ENCRYPTION_KEY`（base64 32 bytes）、`REPORT_ADMIN_EMAIL`（專案擁有者）。透過 Sites 環境密鑰設定，禁止放 source／manifest／前端。既有 App 設定存在時不可任意旋轉加密金鑰，否則無法解密；需要另外安排受控遷移。
- `.openai/hosting.json` 使用 `r2: "BUCKET"`，移除 `plugins`／`connectors`。本版本不再使用訪客的 GitHub 連線，也不會借用作者的 ChatGPT token。
- Sites audience 為 public，回報頁與 API 不要求身分。只有 `/setup*` 需要平台驗證的管理者身分與指定 email；POST 必須有綁定管理者、路徑與期限的簽章表單驗證碼；相容 iPhone Origin:null，明確外站 Origin 仍拒絕。HTML 採 same-origin referrer policy，設定失敗顯示 UTF-8 中文頁。GitHub callback 綁定 HttpOnly nonce cookie、同一管理者及一次性 R2 設定記錄。
- App 以 RS256 JWT 換短效 installation token，每次明確限制 `repositories: ["Yoga2"]` 與 Contents／Issues write。權杖只存在該次後端請求，不傳回前端、不寫 log。
- 回報 API 只收同源 POST、固定附件名稱、明確公開上傳同意，最多 8 MB、PNG 最大邊 2048 px。主站與回報視窗的 postMessage 核對 origin、opener、隨機 report ID。
- 匿名請求要先通過綁定 cookie、回報 ID、附件摘要的五分鐘 HMAC challenge 和 16-bit SHA-256 計算。這是自動驗證，不是 CAPTCHA 或真人身分保證。每個瀏覽器 cookie 每小時最多 3 次送出；全服務每天最多 20 次新上傳嘗試。限額以 R2 CAS 跨請求原子執行；清 cookie 不能繞過全域日限額。時段使用 UTC，前端依 retryAfterMs 等待。
- 不收集／持久保存 IP、訪客 GitHub 帳號或使用者 email；管理者 email 僅存在後端 secret。
- 檔案保存在 `debug-reports/<report-id>`，Issue 引用不可變 commit URL；不合入 main。

## 不重複送出

R2 儲存 report ID、附件 digest 與處理狀態。相同 ID 不能替換內容。上傳 lease 與進入 issuing 的狀態轉移使用 etag CAS；舊 lease 不能建立 Issue 或覆蓋新工作。五分鐘前中斷的 uploading 可接手；issuing／uncertain 只查最近 100 筆 Issues 標記，不盲目重播 create_issue。成功 Issue 超出查詢頁時也不會因而建立第二筆。若確定 Issue 未建立但狀態不明，需管理者確認後才解除對應紀錄。

## 部署與測試

此目錄是 GitHub 上可審查的後端來源副本；正式 Worker 仍沿用原 Sites source checkout、project ID `appgprj_6b0108eeefec819197af972806ca03a9`，不覆蓋 Pages checkout。`bash scripts/build.sh`、`node scripts/validate-artifact.mjs` 建置並驗證，再用 Sites source/package/deploy 流程發布。

`npm run check` 包含真實 RSA 簽章驗證、PKCS#1／PKCS#8、AES-GCM、防篡改、manifest state／身分、防 CSRF、完整匿名 HTTP 流程（模擬 GitHub）、範圍縮減、並行／lease、防重複、限流與原有場景擷取測試。

實際 GitHub App 註冊／安裝必須由擁有者在 GitHub 核准。測試不冒充實際安裝；正式驗收要在啟用後，用未登入的手機按回報，核對 App bot 所建 Issue 的兩張圖、JSON 和 ZIP。

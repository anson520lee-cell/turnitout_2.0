# 本地模型 worker(接 Open WebUI)

這個小程式在你的電腦上運行,把網站的工作交給你在 Open WebUI 的本地模型:

- **免費掃描**:電腦開著時,掃描結果下面會多一張「Writing feedback」卡,是模型寫的寫作建議(清晰度、結構、文法)。電腦沒開就不顯示,原本的分析照常。
- **Writing Refinement**:客人付款確認後,模型自動寫一份初稿。你在管理頁打開訂單,按「Load draft into editor」載入,自己檢查修改後按「Save revision」,再完成訂單,客人才會看到。模型的初稿不會自動送給客人。

你的電腦只會「主動去問」網站有沒有工作,不用開 port、不用設定路由器,外面連不進你的電腦。

## 第一次設定(大約 10 分鐘)

1. **產生密碼**:在這個資料夾打開終端機,執行
   `node worker.mjs --new-secret`
   會印出一串亂碼,這就是 `MODEL_WORKER_SECRET`。
2. **Vercel**:專案 > Settings > Environment Variables,新增 `MODEL_WORKER_SECRET`,貼上同一串亂碼,然後重新部署(Redeploy)。
3. **Supabase**:SQL Editor 貼上並執行 `supabase/migrations/0003_local_model_jobs.sql`(只需做一次)。
4. **Open WebUI API 金鑰**:
   - 管理員設定 > 一般(General)> 開啟「啟用 API 金鑰」(Enable API Key)
   - 左下角頭像 > 設定 > 帳號 > API 金鑰 > 建立新金鑰,複製它
5. **安裝 Node.js**:到 nodejs.org 下載 LTS 版安裝(已安裝就跳過)。
6. **填設定**:把 `.env.example` 複製一份改名為 `.env`,填好 `SITE_URL`、`MODEL_WORKER_SECRET`、`OPENWEBUI_API_KEY`、`OPENWEBUI_MODEL`。
7. **測試**:`node worker.mjs --check`
   全部是 ✓ 就可以了。模型名稱不確定的話,這一步會列出可用的名稱。
8. **開始**:Windows 雙擊 `start-worker.bat`,Mac 雙擊 `start-worker.command`(或執行 `node worker.mjs`)。
   視窗顯示「已連上網站,等待工作中…」就代表在線。網站管理頁 > Settings 的「Local writing model」會顯示 Online。

## 平時使用

- 想網站用你的模型,就開著 Open WebUI 和這個視窗,電腦不要休眠。
- 關掉視窗(或 Ctrl+C)就停止。免費掃描會自動改回只顯示原本分析。
- 電腦關機期間付款的 Refinement 訂單,草稿會排隊等你開機後再寫(14 天內)。寫失敗的話,在訂單頁按「Ask for a new draft」重試。
- 草稿寫好時,如果你設定了 Telegram 或 email 通知,會收到「Model draft ready to review」。

## 私隱

- 這個程式不會把文章或模型回覆顯示在畫面或寫進檔案,只顯示工作編號、字數和用時。
- 免費掃描的文字在模型拿走時就從資料庫刪除;評語給客人看過後即刪除,最遲 10 分鐘。
- 網站的私隱政策寫明「模型在我們自己的設備上運行,文字不會送到外部 AI 供應商」。**所以 `OPENWEBUI_MODEL` 必須是你電腦上的本地模型**(例如 Ollama 模型)。如果你在 Open WebUI 接了 OpenAI、Gemini 等雲端模型,請不要用它,或先告訴我修改私隱政策。
- Open WebUI 如果開了聊天紀錄或記憶等功能,請確認它不會保存經 API 送來的內容。

## 模型建議

- 選中英文都好的模型(例如 Qwen 系列)。7B 左右已經可以寫評語;Refinement 初稿用大一點的模型效果更好。
- 模型的 context 比較小的話,把 `.env` 的 `CHUNK_CHARS` 調低(例如 2500),長文章會分更多段寫。
- 一次只處理一份工作。寫長篇初稿時,程式每寫完一段會先處理等待中的免費掃描評語,客人不用等整篇寫完。

## 常見問題

| 訊息 | 原因 |
| --- | --- |
| MODEL_WORKER_SECRET 和 Vercel 上的不一樣 | 兩邊的字串要完全一樣;改了 Vercel 要 Redeploy |
| 網站未開啟本地模型 | Vercel 還沒設定 `MODEL_WORKER_SECRET`,或設定後未重新部署 |
| 網站還沒有這個功能 | 網站仍是舊版本,等最新版本部署完成 |
| 連不到 Open WebUI | Open WebUI 沒開,或 `OPENWEBUI_URL` 的 port 不對(Docker 通常 3000,pip 通常 8080) |
| HTTP 401 / 403(Open WebUI) | API 金鑰錯,或管理員設定未開啟 API 金鑰 |

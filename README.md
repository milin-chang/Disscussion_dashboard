# Discussion Desk

`milin-chang` 的 GitHub Discussions 看板，使用公開 repository 的標準 GitHub Actions runner 定時更新，並部署到 GitHub Pages。無第三方套件、無 AI API、無資料庫。

## 一次性設定

1. 在此 repo 的 **Settings → Secrets and variables → Actions → New repository secret** 新增 `DISCUSSIONS_TOKEN`。
   - 建議使用 **fine-grained personal access token**，Resource owner 選 `milin-chang`，僅授權需要追蹤的 repositories，Repository permissions 的 **Discussions: Read-only**；Metadata 會自動附帶。
   - 如果使用 classic PAT，私人 repositories 需要 `repo` scope（這種 Token 權限較廣）。組織若啟用 SSO，另須完成該組織的授權。
   - 內建 `GITHUB_TOKEN` 只涵蓋目前 repository，無法用它讀取帳號下其他私人 repo。
   - **不要把 Token 貼進程式、網頁、issue 或聊天。** 只填入 GitHub 的 Secret 欄位，並設定適當到期日。
2. **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. 到 **Actions → Update discussion dashboard → Run workflow** 執行一次。
4. 成功後開啟 <https://milin-chang.github.io/Disscussion_dashboard/>。

第一次 push 會觸發 workflow；尚未設定 Secret 時同步會明確失敗。設定後重新執行即可。未設定憑證前，頁面提供空白初始狀態和明確標示的版型預覽，沒有假造即時資料。

## 同步範圍與公開內容

- 預設查詢 `involves:milin-chang sort:updated-desc`，涵蓋**作者、留言者、被提及者**，首頁預設顯示「我建立的」。
- 這不是 GitHub 的所有 Subscribe 訂閱清單。單純訂閱但未建立、留言或被提及的討論，不會自動出現。書籤是這個頁面自己的本機收藏。
- Token 只能回傳它有權限存取、GitHub 搜尋已索引的討論；回傳 0 筆不代表該帳號沒有任何討論。權限被限制的 repo 可能不出現在搜尋結果中。
- 依使用者選擇，**包含私人 repo 的標題、repo 名稱、分類、標籤、作者帳號、討論編號、統計、日期與連結，都會公開在網站及 `data/discussions.json` 中**。討論全文與回覆內文沒有抓取。原始 GitHub 私人討論仍需權限才能開啟。
- 可將 workflow 裡的 `INCLUDE_PRIVATE` 改為 `'false'`，只發布公開 repo 的資料。
- GitHub 搜尋最多回傳 1,000 筆，程式逐頁取得最近的結果，超過時頁面明確提示。
- API/網路/GraphQL 錯誤會使 workflow 失敗，**不會部署空白或部分資料覆蓋原網站**。

## 頻率與額度

排程為 `17 */3 * * *`（UTC），每天約 8 次；GitHub 排程可能延遲，沒有精確時間保證。可隨時使用 Run workflow 手動同步。

此 workflow 使用 `ubuntu-latest` 標準 runner，在**公開 repo** 執行時，標準 Actions 運算免費；它所讀取的來源 repo 可以是私人 repo。沒有使用大型 runner、cache 或另外上傳長期保存的資料 artifact。Pages artifact 保留 1 天。

網站的「重新讀取」只讀取已部署的 JSON，不會啟動 workflow，也不是即時重新查詢 GitHub。開啟中的頁面每 5 分鐘重新讀取一次。資料超過 6 小時未更新時會顯示提醒。

## 本機執行

需要 Node.js 22 以上，無需 `npm install`：

```powershell
npm test
npm run dev
```

開啟 <http://127.0.0.1:4173>。可點「預覽版型」測試範例清單。

要同步真實資料，在 shell 以安全方式設定 `GH_TOKEN` 環境變數，再執行：

```powershell
npm run sync
npm run build
```

`.env.example` 僅列出名稱，程式不會自動載入 `.env`。`dist/` 是部署輸出，只複製網站必需的檔案；Token 不會出現在前端。`data/discussions.json` 在 Actions 工作目錄產生，不會被自動 commit 回 repository。

## 介面

首頁先顯示專案總覽，以近 7／30 天內有更新的討論數排序，相同數量時依最近更新時間排序；每則討論在期間內計一次，不代表使用者實際投入時間。點專案可直接篩出相關討論，所有 repo 使用一致的藍色強調。

手機優先的 GitHub 深色清單，支援標題／repo／標籤搜尋、repo 篩選、未解答、未讀、排序、收藏和批次已讀。已讀、收藏只儲存於目前瀏覽器；不會修改 GitHub 的訂閱或通知狀態，也不會跨裝置同步。討論更新後會再次顯示未讀。

## 參考

- [GitHub Discussions GraphQL API](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)
- [Discussion 搜尋語法](https://docs.github.com/en/search-github/searching-on-github/searching-discussions)
- [GitHub Actions 計費](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [透過自訂 workflow 部署 Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

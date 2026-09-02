# FAQ 集成 + 布局优化 实现计划

## Repository Research

### 当前架构（已确认）

**1. Product Lookup 面板数据管线**

- [ProductLookupPanel.tsx](file:///c:/Users/yufeng.liang/Documents/econote/src/components/ProductLookupPanel.tsx) 从 `productData.ts` 读取索引，当前 5 个 Tab：
  `Tabs = ['Specs', 'Error Codes', 'Selling Points' /* Pitch */, 'Scientist Codes', 'All Search']`

- [\_productMdImports.ts](file:///c:/Users/yufeng.liang/Documents/econote/src/utils/_productMdImports.ts) 采用**静态显式 import**（非 `import.meta.glob`，因中文/空格/括号文件名 Miaoda 环境返回 `{}`），当前从 `/products/` 加载 58 个 MD 文件。

- [productData.ts](file:///c:/Users/yufeng.liang/Documents/econote/src/utils/productData.ts) 按类型构建索引：规格对比表（parseGfmTable + Jaccard 模型匹配）、错误代码（3\~4 位数字段）、卖点（### Selling Points 节词对）、科学家代号（Code/Alt Code 正则）、故障快查（06号文档）、All Search（跨文档全文）。

**2. Template 匹配结果管线（模板框 → FAQ 徽章已有）**

- [amr-templates.ts](file:///c:/Users/yufeng.liang/Documents/econote/src/lib/amr-templates.ts) 已支持 4 种 `kind`: `amr` / `tbs` / `err` / `faq`。

  - 当前 `faqModules` glob 路径是 `/QNA/FAQ/*.md`（老路径，已有 \~60 个 MD）。

- [FlowNode.tsx](file:///c:/Users/yufeng.liang/Documents/econote/src/components/FlowNode.tsx#L594-L642) 已为 `kind === 'faq'` 渲染 `FAQ` 徽章（`bg-warning/25 text-warning` 橙色）。

- `searchTemplates()` 用 IDF + 同义词 + bigram 对 TemplateEntry 打分。

**3. 画布布局（SOP vs PRODUCT 位置与连线）**

- 宽屏 (≥1320px) 下 4 个面板堆叠于左栏，顺序在 [FlowchartCanvas.tsx](file:///c:/Users/yufeng.liang/Documents/econote/src/components/FlowchartCanvas.tsx#L195-L200)：
  `LEFT_COL_IDS = [TRANSCRIPT_PANEL, TEMPLATE_MATCHES, SOP_PANEL, PRODUCT_LOOKUP]`
  → 当前 SOP 在 PRODUCT 上面。

- 窄屏 (NODE\_LAYOUT\_ROWS) 顺序在 [data/ticket.ts](file:///c:/Users/yufeng.liang/Documents/econote/src/data/ticket.ts#L1163-L1167)：
  `[SOP_PANEL]` → `[PRODUCT_LOOKUP]` → `[HANG_UP]`
  → SOP 仍在 PRODUCT 前面。

- 连线各自独立到 HANG\_UP，交换顺序时**连线不用改**，只改 SVG connection `NODE_CONNECTIONS` 中 SOP↔PRODUCT 的前后流向即可（但用户只要求"位置"交换，所以无需改）。

- 节点 SVG 连线在 [FlowchartCanvas.tsx](file:///c:/Users/yufeng.liang/Documents/econote/src/components/FlowchartCanvas.tsx#L487-L532) `renderConnections()` 生成 — 每条 `NODE_CONNECTIONS` 对应一条贝塞尔曲线。

- 节点重叠防止：`computeDefaultLayout()` 按行贪心打包，`lineHeight = Math.max(lineHeight, heightOf(n))`，理论上不会重叠。但若用户已拖拽保存了旧位置 (positions override)，新窗口首次加载时**旧 drag 位置可能冲突**，此时 `handleLayoutReset` (clear positions) 会生效。

**4. FAQ Excel 盘点（66 有效文件）**

- 产品线分布：DEEBOT 45、GOAT 8、WINBOT 11、ULTRAMARINE 2。

- **多版本型号**（挑新版本，重复的旧版本跳过不转换）：

  | 型号               | 候选                                                                                  | 处理                                     |
  | ---------------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
  | ULTRAMARINE P1   | V2.6 / V2.5                                                                         | ✅ KEEP V2.6                            |
  | X8 Series        | 【FAQ】ECOVACS X8 Series V2.0 / 【Multi-Language FAQ】ECOVACS X8 Series                 | ✅ KEEP V2.0                            |
  | X12 Series       | FAQ2.0\_13 langs / （CN\&EN） / （多语言）                                                 | ✅ KEEP 13 langs（最大最全，344KB），其余英文纯文本可并入 |
  | WINBOT W3 OMNI   | 多语言 (255KB) / V260213 (245KB)                                                       | ✅ KEEP 多语言版（体积更大，更新日期更晚）               |
  | WINBOT MINI 2    | FAQ2.0\_19langs / FAQ2.0                                                            | ✅ KEEP 19langs（212KB）                  |
  | WINBOT MINI      | FAQ 2.0（中文） / FAQ 1.5（中英文）                                                          | ✅ KEEP FAQ 2.0                         |
  | T90 Series       | 1.14 终版 (30.5KB) / 无日期 FAQ2.0 (31.2KB)                                              | ✅ KEEP 1.14 终版（显式版本号）                  |
  | N20e & N20e Plus | 中英文 (27.2KB) / multi-language (46.9KB)                                              | ✅ KEEP multi-language                  |
  | N30 OMNI         | **V2.0 海外** (5127KB)                                                                | ✅ KEEP V2.0                            |
  | T50 降配版          | CN\&EN (36.5KB) / 海外中英 (36.5KB) / FAQ\_T50 (非降配, 56.5KB)                            | ✅ KEEP CN\&EN + FAQ\_T50（**独立型号**）     |
  | GOAT O Series    | 4 份（O SERIES 2.0 / O Mar 2025 / O600\&O800 25.12.31 / O1200\&O1600\&A3000 25.12.31） | ✅ 全部保留（覆盖不同子型，后两份日期更新）                 |
  | GOAT A Series    | Mar. 2025 (204.9KB)                                                                 | ✅ KEEP                                 |
  | GOAT GX          | 2024.06.06 (108.7KB) + HQ support 20230214                                          | ✅ KEEP FAQ 2024.06.06                  |
  | W2S\&W2S OMNI 海外 | WINBOT目录下 + DEEBOT目录下 重复                                                            | ✅ KEEP 1份（WINBOT/W2S子目录版）              |
  | X5 Series        | 常见问题 1.0 (1100KB) / FAQ 2.0 (24.9KB)                                                | ✅ KEEP FAQ 2.0                         |
  | X2 COMBO         | MSH\&FABE 1.5 CN.xlsx + FAQ 1.0 CN.pdf                                              | ✅ 都保留（文档类型不同）                          |

**5. FAQ 文件内容类型（对 MD 转换策略很关键）**

- **FAQ Q\&A (51份，主类)**：典型问答结构 — 多 Sheet：每个 Sheet 名 = 主题，每行 = 一个问题 + 一个答案（Question列/Answer列），含中英/多语言列

- **Basic Data / Comparison Table (11份)**：规格对比表，每 Sheet 是一组参数，跟 products/ 下已有 01\~04 结构相同

- **Selling Points / 区别 / Mapping / 错误码**：各 1\~2 份，结构已存在对应 products/ MD 类型

- **非表格文档 (DOCX×5 + PDF×1)**：DEEBOT 601 FAQ.docx, N79区别.docx, Goat-G1only.docx, DEEBOT Mapping.docx, OZMO T8 FAQ.xls, X2 COMBO FAQ.pdf

***

## Files and Modules

| 文件                                             | 变更类型 | 说明                                                                                                                                                                                                  |
| ---------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/products/FAQ/`（**新目录**）                      | 新建   | FAQ 拆分后 Markdown 存放位置（单一真源）。每个 FAQ 问答条目 → 独立 MD；对比表 → 独立 MD（GFM 表格）                                                                                                                                 |
| `scripts/build-faq-md.mjs`（**新脚本**）            | 新建   | 用 `xlsx` (npm包，已在 node\_modules) 读取 FAQ/*.xlsx/*.xls，docx/pdf 走 mammoth/pdf-parse，按上述版本去重逻辑输出到 /products/FAQ/。生成格式兼容产品对比表/FAQ问答两种 MD 模板                                                             |
| `src/utils/_productMdImports.ts`               | 修改   | 追加静态 import 所有 `/products/FAQ/*.md` 文件（保持 ASCII slug 命名，避开 Vite glob unicode bug）                                                                                                                   |
| `src/utils/productData.ts`                     | 修改   | (a) 新增 FAQ 索引类型，按 "Model匹配 + 全文Jaccard" 构建 FAQ entries 列表；(b) 新增 `searchFaqs(model, query, limit)` 方法；(c) `searchAllFree` 扩展包含 FAQ entries                                                          |
| `src/components/ProductLookupPanel.tsx`        | 修改   | (a) 新增 `FAQ` Tab（放在 Specs/Error Codes 之后，Selling Points 调到末尾）→ 顺序：`Specs → Error Codes → FAQ → Scientist Codes → All Search → Selling Points`；(b) FAQ Tab 渲染 FAQ Q\&A 条目（问题、答案、型号标签）                |
| `src/lib/amr-templates.ts`                     | 修改   | `faqModules` glob 路径 从 `/QNA/FAQ/*.md` → `/products/FAQ/**/*.md`（单目录双索引），kind 继续为 `faq`。保持 `searchTemplates` 和 `parseMarkdown` 行为不变（MD 格式已兼容）                                                       |
| `src/data/ticket.ts`                           | 修改   | (a) `NODE_LAYOUT_ROWS`：交换 `[SOP_PANEL]` 与 `[PRODUCT_LOOKUP]` 行的前后顺序 → PRODUCT 在上、SOP 在下；(b) NODE\_CONNECTIONS 不用改（两个都指向 HANG\_UP）                                                                   |
| `src/components/FlowchartCanvas.tsx`           | 修改   | (a) `LEFT_COL_IDS`：从 `[TRANSCRIPT, TEMPLATES, SOP, PRODUCT]` → `[TRANSCRIPT, TEMPLATES, PRODUCT, SOP]`（交换后两个）；(b) **删除 SVG 连线层**：注释掉 `<svg>` + `renderConnections()` 渲染，保留 connection 数据结构不删（将来可恢复） |
| `src/components/ProductLookupPanel.tsx`（badge） | 修改   | FAQ Tab 结果条目显示橙色 **FAQ** 徽章（复用 amr-templates 同款色：`bg-warning/25 text-warning`），与模板框徽章视觉一致                                                                                                           |

***

## Implementation Steps（依赖顺序）

### 阶段 A：FAQ Excel → Markdown 数据转换（先跑，产出 MD 文件）

1. **检查 xlsx 是否已可用**（当前 package.json 没直接依赖 `xlsx` / `mammoth` / `pdf-parse`；但如果 node\_modules 里没有需要 `npm install xlsx mammoth pdf-parse --no-save --no-audit` 作为 build 工具依赖；也可临时用 devDependencies 加入）
2. 写 `scripts/build-faq-md.mjs`：

   - 版本去重函数：按 `[category + model slug]` 分组，保留 version 最高、体积最大、日期最新的那一份

   - `.xlsx/.xls` 读取每个 sheet：遍历 sheet 每一行，识别 header 列关键字（Question/问题、Answer/答案、Spec/规格、机型/Model …）

     - FAQ问答：每行生成 `/products/FAQ/{N}_{SlugModel}_{QShortId}.md`，front-matter 含 `model` / `lang` / `category`；正文 `# {问题}` → `## 问题` → `## 答案`

     - 对比表：sheet → `### {section heading}` + `|...| GFM table |` 块（跟 products/01..04 一致）

     - Basic Data：整表走对比表 MD 格式

   - `.docx`：mammoth 提取纯 Markdown 直接写入

   - `.pdf`：pdf-parse 抽取文本，按空行分段写为 `#`/`##` heading + 段落
3. 脚本执行 → 生成 `/products/FAQ/` 目录 \~ 估计 800\~1500 个 MD 文件（每行 Q\&A 一个；对比表每个 sheet 一个）
4. 清理 4 个 `~\$*.xlsx/docx` 临时锁文件

### 阶段 B：ProductLookupPanel 接入 FAQ 数据

1. 扩写 `_productMdImports.ts`：把 `/products/FAQ/*.md` 以静态 import 方式追加（走 Node 脚本生成 import 行，避免手写出错），同步更新 `ALL_PRODUCT_MD` 记录
2. 扩写 `productData.ts`：

   - 新 interface `FaqEntry { id, sourcePath, model, category, lang, question, answer, tokens }`

   - 新函数 `buildFaqIndex(mdRecords)`：正则切 MD frontmatter + 正文，normalizeTokens 建索引

   - 新导出 `searchFaqs(model, query, limit)`：model match Jaccard + query token 匹配 question/answer，同 product spec 的打分方式

   - 修改 `searchAllFree()`：把 FAQ entries 加入结果（携带 kind='faq'）
3. ProductLookupPanel.tsx：

   - TABS 数组重排为 `['Specs', 'Error Codes', 'FAQ', 'Scientist Codes', 'All Search', 'Selling Points']`

   - 新增 `renderFaqTab()` 组件体：搜索框沿用 All Search 的模糊匹配；结果渲染为卡片（📋 型号 badge + FAQ badge + 问题粗体 + 答案折叠）

   - Selling Points Tab 调到最后一位（Pitch 即 Selling Points）

### 阶段 C：Template 搜索 + FAQ badge（保证模板框也出 FAQ）

1. `amr-templates.ts` 修改 `faqModules` glob：`/products/FAQ/**/*.md`，替换原先 `/QNA/FAQ/*.md`

   - 保持 `kind='faq'`、`category='FAQ'` 不变

   - `parseMarkdown()` 可直接处理（FAQ 问答 MD 用 `## 问题` / `## 答案` 结构 → parseMarkdown 会取首 heading 为 title，后续内容作为 lines）

   - 保留 `/QNA/FAQ` 路径里已存的旧 MD（为兼容可暂时复制一份过去，或让 glob 两条路径都吃）——**本次实现优先单一真源 /products/FAQ/**
2. FlowNode.tsx 的 templates 空状态文案已经包含 "FAQs"，无需修改

### 阶段 D：布局优化（SOP↔PRODUCT 位置互换 + 删连线 + 防重叠）

1. `data/ticket.ts` → `NODE_LAYOUT_ROWS`：把 `[NODE_IDS.SOP_PANEL]` 与 `[NODE_IDS.PRODUCT_LOOKUP]` 两行互换 → PRODUCT 先、SOP 后
2. `FlowchartCanvas.tsx` → `LEFT_COL_IDS`：把 `SOP_PANEL` 与 `PRODUCT_LOOKUP` 位置对调 → 宽屏左栏顺序为 Transcript → Templates → **Product** → **SOP**
3. **删除节点 SVG 连线层**：

   - 在 `renderConnections()` 函数调用处直接不渲染（return `<></>` 或注释掉 `<svg>` 那整块 DOM，保留 filter/glow defs 不删可复现）

   - **不删除** `NODE_CONNECTIONS` 数组 + 函数本身（方便将来还原），只去掉画布上的视觉 `<path>` 输出
4. **防止盒子重叠**：`computeDefaultLayout()` 本身不会重叠。但用户保存在 localStorage 的 drag overrides 可能让 SOP 和 Product 盒子（高度都在 460\~480px，宽度都 760px）叠在一起：

   - 首次渲染时如果检测到 positions 里 SOP\_PANEL 与 PRODUCT\_LOOKUP 的 y 间距 < 460 或 x 完全重合 → 自动 clear 掉 SOP\_PANEL 和 PRODUCT\_LOOKUP 这两个 id 的 override（不影响其他节点的自定义拖动位置）

   - 在 FlowchartCanvas `useMemo` 计算 effectivePositions 之前加一个 "sanitizePositions" 轻修复

   - 同时 `TicketNotesPage` 顶部 GRIDBOX\_VISIBILITY\_TOGGLES 中 SOP/Product 的顺序也建议跟实际显示一致：把 "Product lookup" 移到 "SOP box" 前面

### 阶段 E：验证 & 收尾

1. 启动 Vite dev server，确认：

   - FAQ Excel → MD 文件数量正确、无乱码

   - ProductLookupPanel 6 个 Tab（Specs/Error Codes/**FAQ**/Scientist Codes/All Search/Selling Points）全部可切，FAQ 有搜索结果+FAQ badge

   - Matching Templates 节点输入 "no water" / "wifi off" 等能出 FAQ 类型的模板 chip（橙色 FAQ badge）

   - 宽屏画布 PRODUCT 盒子在 SOP 盒子上方，窄屏 Product 行也在 SOP 行前面

   - 画布上所有贝塞尔曲线连线消失，节点拖拽后高度变化不重叠

***

## Dependencies and Considerations

- **`xlsx`** **/** **`mammoth`** **/** **`pdf-parse`**：脚本期工具依赖，转换完 MD 后不进入生产 bundle（不会拖构建产物）。如果 devDependencies 要加它们，记得改完 package.json 后跑 `npm install`。

- **\_productMdImports.ts 静态 import 限制**：如果 FAQ 产生 >200 个 MD 文件，import 语句仍然可行（Vite 对 1000 条 static import 都可接受），但 build 时间会轻微增加。建议 FAQ 文件最终控制在 \~500 以内，超长内容裁剪为摘要。

- **文件名命名规范**：`/products/FAQ/{N}_{Category}_{ModelSlug}_{Type}_{Lang}_{DigestId}.md`，全是 ASCII、下划线、数字，完全避开空格/中文/括号。

- **`amr-templates.ts`** **旧路径** **`/QNA/FAQ`**：若转换后 QA 不希望保留两份，可在 build-faq-md 脚本里把旧文件删掉。但建议保留一段时间作为 fallback。

- **`scripts/dev.mjs`** **已打 Windows 兼容补丁**（上一轮），本次不改。

- **NO git push**：仓库还没有正式 .gitignore，注意 FAQ 生成的大量 MD 应纳入版本控制（它们就是要打包进前端的）。

- **中文 FAQ 内容**：之前的 synonyms 表是全英文（SYNONYM\_GROUPS），在 FAQ 中文搜索里效果会退化。本次实现会把中文 FAQ question/answer 原文放在 UI 里直接展示；全文搜索靠 CJK 字符 normalizeTokens（已经支持 `\u4e00-\u9fff`），所以不会全失效。

***

## Validation

| 检查项                     | 通过标准                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| FAQ MD 产物               | 每个型号至少 1 份 FAQ MD 输出；重复型号仅最新版本存在；文件名 ASCII slug                                                  |
| ProductLookupPanel Tabs | 顺序为 Specs → Error Codes → **FAQ** → Scientist → All → Selling；FAQ badge 橙色                       |
| Matching Templates FAQ  | Issue Description 输 "stuck" / "wifi" / "app连接" 能看到 FAQ 标记 chip                                   |
| SOP/PRODUCT 位置          | 宽屏左栏：产品框在 SOP 框上方；窄屏 grid：PRODUCT 行于 SOP 行之前                                                     |
| 节点连线                    | 画布上不渲染任何贝塞尔曲线（SVG path 全部为空），同时隐藏 BOX 功能仍工作（隐藏不画线 → 本来就不画）                                       |
| 防重叠                     | 刷新页面时，即使 localStorage 里有旧 drag override，Product/SOP 盒子视觉上也不重叠（自动sanitize）                        |
| 构建                      | `node -e "require('./node_modules/vite/bin/vite.js').build()"` 不报错（\_productMdImports 所有路径都真实存在） |

***

## Risks

| 风险                                                             | 处理                                                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FAQ Excel 中文 sheet 名 / 表头关键字千差万别 → 脚本漏转                        | 脚本里做宽匹配：问题/Question/问答/Q 列为一；答案/Answer/A 列为二；对比表检测任意 4 列以上且首行 2 个以上表头含 Model/机型/Spec/规格关键字                                                               |
| **大文件** 20.6MB (美国 N7N8) + 4个 5MB 级 FAQ → 内存爆                  | xlsx 默认读整个文件入内存；处理大文件时启用 streaming 模式或拆分 chunk；若失败就降级为只抽取前 100 行 Q\&A（也是绝大多数真实有用的）                                                                       |
| 超大量 FAQ MD (>500) → \_productMdImports 文件 200KB +，首屏 bundle 变大 | FAQ MD 文件内容都是简单 ASCII + 普通中文文本，gzip 后实际体量很小（\~单条 FAQ 500B gzip → 500 条 \~250KB）。构建已启用 manualChunks，products 数据可进独立 vendor chunk 后续懒加载（若后面发现卡再优化，本次不做懒加载） |
| 连线删除后，节点激活态视觉缺少上下文（高亮线条消失）                                     | 保留 `isActive` 节点自身的 glass-active 发光效果，不影响激活识别；如用户反馈缺失，再加回箭头连接                                                                                            |
| 用户自定义拖拽位置被 sanitize 后，用户可能觉得 "我调过的位置被重置了"                      | sanitize 只处理 **SOP\_PANEL + PRODUCT\_LOOKUP** 两个 id 的重叠冲突；其他节点 drag override 完全保留。且只在 y 差 < (480+10) 或 x 相同 时才动，不重叠就尊重用户设置                               |


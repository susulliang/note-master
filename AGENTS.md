# Ecovacs Ticket Notes - 需求拆解文档

## 产品概述

- **产品类型**: 客服工单记录工具（流程图式信息收集应用）
- **场景类型**: <scene_type>prototype-app</scene_type>
- **目标用户**: Ecovacs 北美客服坐席（agent），需要在通话中按流程收集客户信息并生成格式化工单备注
- **核心价值**: 通过可视化流程图引导客服按标准话术和信息节点完成通话，结束后一键生成可复制的规范化工单备注，提升信息收集完整性和效率
- **界面语言**: 英文（工单内容、节点标签、按钮文案均为英文，符合 Ecovacs NA 业务场景）
- **主题偏好**: user_specified（GitHub Dark 风格深色主题 + Glassmorphism 玻璃拟态效果）
- **导航模式**: 无导航（单页工具应用，顶部工具栏 + 主画布 + 右侧边栏）
- **导航布局**: 无

---

## 页面结构总览

**页面文件**: `TicketNotesPage.tsx`（单页应用，所有功能在同一页面完成）

| 区域 | 说明 |
|-----|------|
| Top Bar（顶部工具栏） | 左侧：应用标题 "Ecovacs Ticket Notes" + 图标；右侧：Reset 按钮 + Theme Toggle |
| Flowchart Canvas（流程图画布，左侧 70%） | 可滚动的 SVG 画布，承载所有流程节点与连接线，节点可拖拽 |
| Quick Reference Sidebar（右侧边栏，30%） | 常用话术/短语面板，点击可插入当前激活的输入框 |
| Output Modal（输出弹窗） | 点击 Hang Up 后弹出的玻璃拟态模态框，展示格式化工单备注 + Copy 按钮 |

---

## 页面布局建议

- **布局模式**: 左右分栏（左侧流程图画布 + 右侧快捷参考面板）+ 顶部工具栏 —— 用户在通话中需要一边按流程图节点逐步填写信息，一边参考常用话术，左右对照效率最高
- **视觉重心**: 流程图画布（左侧 70%）—— 核心交互发生在节点填写与流程推进上
- **结果承载区**: 玻璃拟态模态弹窗（Output Modal）；初始态为隐藏，点击 "Hang Up & Generate Note" 后出现，展示格式化工单备注文本 + Copy to Clipboard 按钮
- **源材料承载区**: 右侧 Quick Reference 面板常驻，提供可点击插入的常用短语，辅助左侧输入

---

## 数据来源声明

| 数据/操作 | 来源类型 | 实现要求 | mock 兜底 |
|---|---|---|---|
| 工单表单数据（所有节点输入值） | local-persist | localStorage key=`__app_ecovacs_ticket_form_data`，实时自动保存所有输入字段，页面刷新后恢复 | 无（空表单为初始态） |
| 节点位置（拖拽后的坐标） | local-persist | localStorage key=`__app_ecovacs_ticket_node_positions`，保存用户拖拽后的节点坐标 | 无（使用默认布局坐标） |
| 工单备注复制 | import-export | 使用 `navigator.clipboard.writeText` 将格式化文本写入剪贴板，成功后显示 toast 反馈 | 无 |
| 常用短语列表 | demo-mock | 内置静态常用话术数组（如问候语、结束语、常见问题回复） | ✅ 本身就是 mock 静态数据 |
| 下拉选项（机型/问题类型） | demo-mock | 内置静态选项数组（Deebot 机型列表、Issue Type 列表） | ✅ 本身就是 mock 静态数据 |
| 故障排查步骤预设 | demo-mock | 内置 4 条默认步骤：Restarted the device / Cleaned sensors / Checked brush assembly / Reset Wi-Fi connection | ✅ 本身就是 mock 初始值 |

> 类型选择 + 兜底约束见上方"数据来源声明方法论"段。

---

## 功能列表

- **页面/区块**: 顶部工具栏 (Top Bar)
  - **页面目标**: 提供应用标识和全局操作入口
  - **功能点**:
    - **应用标题展示**: 显示 "Ecovacs Ticket Notes" + 品牌图标，使用 JetBrains Mono 等宽字体
    - **重置表单**: 点击 Reset 按钮弹出确认，清空所有输入字段和 localStorage 中的表单数据，节点位置恢复默认
    - **主题切换**: Theme Toggle 按钮（用户明确要求），在 GitHub Dark 主主题与可选浅色主题间切换（默认深色）

- **页面/区块**: 流程图画布 (Flowchart Canvas)
  - **页面目标**: 以可视化节点流形式引导客服按顺序收集客户信息
  - **功能点**:
    - **节点渲染与类型系统**: 支持 4 种节点类型——Start Node（固定绿色描边问候语）、Agent Node（固定蓝色描边话术）、Input Node（可编辑文本/多行文本/下拉选择）、Dynamic List Node（可增删步骤的动态列表），所有节点使用玻璃拟态卡片样式
    - **SVG 贝塞尔曲线连接线**: 节点间用平滑的 SVG bezier curves 连接，随节点拖拽实时更新路径
    - **节点拖拽**: 所有节点支持鼠标拖拽重新定位，位置自动保存到 localStorage
    - **当前节点高亮**: 当前激活（聚焦输入）的节点有 glow 发光效果 + 微妙 pulse 动画，引导用户注意力
    - **自动滚动定位**: 当用户通过 Tab 或点击进入下一节点时，画布平滑滚动使该节点居中可见
    - **键盘导航**: 支持 Tab 键在所有输入框间顺序跳转，符合表单操作习惯

- **页面/区块**: 流程节点内容 (Node Content)
  - **页面目标**: 按业务流程完整收集客户与工单信息
  - **功能点**:
    - **客户基本信息收集**: 包含 Customer's First Complaint（多行）、Customer Name（单行）、Contact Number（单行+电话格式）、Email Address（邮箱格式）、Shipping Address（多行）
    - **设备信息收集**: 机型下拉选择（Deebot X2 Omni / T30 Omni / T20 Omni / N8 Pro+ / Ozmo 950 / Other）、SKU Number、Serial Number，三个字段横向并排
    - **问题信息收集**: Issue Type 下拉选择（10 种常见问题 + Other）、Detailed Issue Description 多行文本
    - **故障排查步骤动态管理**: 预填充 4 条常用步骤，支持添加新步骤、删除已有步骤，每条为独立文本输入
    - **解决与备注**: Resolution Summary（多行）、Additional Notes（多行）
    - **实时自动保存**: 所有输入字段 change 时防抖写入 localStorage，刷新不丢失

- **页面/区块**: 右侧快捷参考面板 (Quick Reference Sidebar)
  - **页面目标**: 提供常用话术快捷插入，减少客服重复输入
  - **功能点**:
    - **常用短语分类展示**: 按类别（问候/确认/安抚/结束语等）展示可点击的短语卡片
    - **一键插入**: 点击短语自动插入到当前聚焦的输入框光标位置
    - **可折叠面板**: 支持收起/展开，在小屏设备上为流程图让出空间

- **页面/区块**: 输出生成与弹窗 (Output Panel / Hang Up)
  - **页面目标**: 通话结束后生成格式化工单备注并支持一键复制
  - **功能点**:
    - **Hang Up 触发**: 底部大红色 "📞 Hang Up & Generate Note" 按钮，点击后收集所有节点数据生成格式化文本
    - **玻璃拟态结果弹窗**: 模态展示生成的工单备注，使用 Markdown 风格代码块样式呈现
    - **一键复制**: "Copy to Clipboard" 按钮调用 Clipboard API 复制全文，成功后显示 "Copied!" toast 反馈
    - **格式化模板**: 严格按用户指定格式输出（Customer Name / Contact number / Email address / Shipping address / Serial Number / Deebot Model / SKU / Issue/s / Resolution/s / Additional information）

---

## 数据共享配置

本应用为单页工具，所有数据在同一页面内管理，无需跨页面数据共享。

本地存储键名统一规范：
- 表单数据：`__app_ecovacs_ticket_form_data`（对象，键为节点 ID，值为输入内容）
- 节点位置：`__app_ecovacs_ticket_node_positions`（对象，键为节点 ID，值为 {x, y} 坐标）
- 主题偏好：`__app_ecovacs_ticket_theme`（字符串，`dark` / `light`）

```ts
interface TicketFormData {
  firstComplaint: string;
  customerName: string;
  contactNumber: string;
  deebotModel: string;
  skuNumber: string;
  serialNumber: string;
  issueType: string;
  detailedIssue: string;
  troubleshootingSteps: string[];
  emailAddress: string;
  shippingAddress: string;
  resolutionSummary: string;
  additionalNotes: string;
}

interface NodePosition {
  x: number;
  y: number;
}
```

---

## 技术选型说明

> 用户明确要求使用 vanilla HTML/CSS/JS 单文件实现，以下为技术约束确认：

- **渲染层**: 原生 HTML + CSS + JavaScript（单 HTML 文件，不使用 React/Vue 等框架）
- **连接线**: 原生 SVG + bezier curves，节点位置变更时重绘路径
- **布局**: CSS Grid + Flexbox 实现左右分栏和节点内部布局
- **持久化**: 浏览器 `localStorage` API
- **复制功能**: `navigator.clipboard.writeText` Clipboard API
- **字体**: JetBrains Mono（等宽字体，通过 Google Fonts 或 CDN 引入）
- **响应式**: 桌面端左右分栏，平板端上下堆叠，画布始终可滚动
- **动效**: CSS transitions + keyframes（节点 hover、active glow pulse、弹窗淡入）

-------

<scene_type>prototype-app</scene_type>

# UI 设计指南

## 1. 设计推导依据

- **参考意图**: Mood Reference —— 用户明确要求 GitHub 深色美学 + Glassmorphism 作为风格参考，不涉及具体成品复刻
- **核心情绪 / 应用类型**: 客服工单记录工具，冷静、精准、像代码编辑器一样高效，让坐席在通话中快速跟随流程收集信息
- **独特记忆点**: 自上而下的流程图节点像 Git 提交历史一样用 SVG 贝塞尔曲线串联，当前节点带绿色辉光脉冲，整体呈现"工单即代码"的终端质感

## 2. Art Direction

- **方向名**: 玻璃终端 · GitHub Dark
- **Design Style**: Terminal Dark 终端感 + Frosted Glass 毛玻璃 —— 等宽字体与代码风排版契合开发者工具气质，玻璃卡片柔化深色背景的生硬感
- **DNA 参数**: 圆角 subtle (rounded-md) / 阴影 layered (soft glow + subtle border) / 间距 compact (gap-3 / p-4) / 字体方向 等宽 monospace / 装饰手法 SVG 贝塞尔连线 + 节点辉光 + backdrop-blur
- **应用类型**: Workflow —— 左侧 70% 流程图画布为主，右侧 30% 快捷参考面板为辅

## 3. Color System

**色彩关系**: GitHub Dark 深空底 + 半透明玻璃卡片 + 绿色主交互 + 蓝色辅助强调 + 红色终止动作
**配色设计理由**: 主色绿对应 GitHub 成功/提交语义，承担主行动与激活节点；蓝色用于辅助节点与链接；红色专用于 Hang Up 终止按钮；背景采用 #0d1117 深空色，玻璃卡片叠加 backdrop-blur 营造层次
**主色推导**: 以 GitHub Green #238636 为锚点，衍生同色系深浅用于 hover/active；中性色完全沿用 GitHub Dark 调色板，确保开发者工具的熟悉感
**使用比例**: 65% 中性深色 / 25% 玻璃与边框层次 / 10% 强调色（绿主 + 蓝辅 + 红终止）；primary 只用于 CTA 与激活节点，不铺满 tab、icon、边框

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|---|---|---|---|---|
| bg | `--background` | `bg-background` | hsl(210 18% 8%) | 页面画布背景，GitHub Dark #0d1117 |
| card | `--card` | `bg-card` | hsl(215 21% 11%) | 玻璃卡片底，叠加 backdrop-blur-md 与 30% 透明度 |
| text | `--foreground` | `text-foreground` | hsl(210 17% 79%) | 正文与输入文字，#c9d1d9 |
| textMuted | `--muted-foreground` | `text-muted-foreground` | hsl(212 9% 55%) | 标签、占位符、辅助说明，#8b949e |
| primary | `--primary` | `bg-primary` / `text-primary` | hsl(137 55% 36%) | GitHub Green #238636，主按钮与激活节点辉光 |
| primaryForeground | `--primary-foreground` | `text-primary-foreground` | hsl(0 0% 100%) | 主色上的文字，纯白高对比 |
| accent | `--accent` | `bg-accent` | hsl(212 92% 62%) | GitHub Blue #58a6ff，辅助节点、链接、focus 环 |
| accentForeground | `--accent-foreground` | `text-accent-foreground` | hsl(0 0% 100%) | accent 上的文字 |
| border | `--border` | `border-border` | hsl(215 12% 27%) | 卡片与输入框边界，#30363d |

**语义色提示**:
- 成功（完成节点 / 复制成功 toast）：bg hsl(137 55% 20%) / border hsl(137 55% 36%) / text hsl(137 60% 70%)，与 primary 同色温
- 警告（必填缺失）：bg hsl(38 90% 20%) / border hsl(38 90% 50%) / text hsl(38 90% 70%)，饱和度与 primary 对齐
- 错误（Hang Up 终止 / 校验失败）：bg hsl(0 75% 25%) / border hsl(0 75% 55%) / text hsl(0 80% 75%)，GitHub Red #f85149 系，饱和度高于 primary 约 20% 以突出终止语义

## 4. 字体与节奏

- **font-display**: JetBrains Mono —— 等宽字体强化代码/GitHub 工具感，用于标题、节点标签、输出面板
- **font-body**: JetBrains Mono —— 全文等宽，营造终端编辑器氛围；输入框与正文统一字体降低视觉切换成本
- **字号**: H1 text-xl ~ text-2xl（顶栏标题）；节点标签 text-sm；输入正文 text-base；输出面板 text-sm。
- **圆角**: 小 (rounded-md) —— 呼应 GitHub UI 的克制圆角，避免过度圆润削弱工具感

## 5. 全局布局契约

- **Reference Layout Use**: 按需求结构推导，左画布 + 右侧栏 + 顶栏的三栏工作台布局
- **Page / Section Order**: 顶栏（标题 + 重置 + 主题切换）→ 主区域（左侧流程图画布 70% / 右侧快捷短语面板 30%）→ 底部 Hang Up 按钮 → 输出面板（模态弹出）
- **Standard Content Zone**: 画布区 `w-full` 自由滚动，节点最大宽度 `max-w-sm`；右侧栏 `max-w-xs`；顶栏全宽
- **Shell / Frame Alignment**: 独立滚动 —— 流程图画布独立纵向滚动，顶栏与侧栏固定
- **Padding & Rhythm**: 顶栏 `px-4 py-3`；画布 `p-6`；节点间距 `gap-6`（纵向）/ `gap-4`（横向分支）；8px 倍数节奏
- **Full-bleed Zones**: 流程图画布全宽滚动，SVG 连线贯穿整个画布宽度
- **Local Narrowing**: 输入节点内表单宽度受节点容器约束，textarea 自适应高度
- **Overflow Strategy**: 画布区 `overflow-y-auto`，横向分支节点多时 `overflow-x-auto`；侧栏短语列表 `overflow-y-auto`
- **Flexibility Boundary**: 允许移动端将侧栏收起为底部抽屉，节点纵向单列排列；不允许改变主色、圆角、字体与玻璃质感

## 6. 视觉与动效

- **装饰**: SVG 贝塞尔曲线连线 + 节点辉光 + 玻璃半透明层
- **阴影/边界**: 中 —— 玻璃卡片带 `shadow-lg` 软阴影 + 1px 半透明边框；激活节点额外加 `0 0 20px` primary 色辉光
- **动效**: 精致克制 —— 节点 hover 轻微上浮 + 边框提亮；激活节点 subtle pulse（辉光呼吸）；页面切换与面板滑入用 200ms ease；连线随节点拖拽实时重绘

## 7. 组件原则

- 节点分三类：固定话术节点（玻璃卡片 + 彩色左边框）、输入节点（含 label + input/textarea）、选择节点（label + select）
- 按钮三档：Primary（绿底白字，Hang Up 用红底）、Secondary（玻璃透明 + 边框）、Ghost（仅文字 hover 出浅底）
- 输入框：玻璃底 + 细边框 + focus 时蓝色外环，placeholder 用 textMuted
- 所有交互元素必须有 `:focus-visible` 轮廓（accent 色 2px ring）
- 空状态与加载态沿用玻璃卡片 + 等宽占位符线条，不跳出整体语言

## 8. Image Direction

- **Image Role**: 无强制图片需求，优先通过等宽排版、玻璃材质、SVG 连线与节点辉光建立视觉记忆点
- **Image Art Direction**: 无强制图片需求
- **Image Prompt Keywords**: 无
- **Image Avoidance**: 避免卡通客服插图、商务人物素材图、无意义科技渐变背景；保持工具的克制与专业感

## 9. Anti-patterns

- **Split personality**: 节点样式、按钮圆角、玻璃透明度在不同区域不一致；全站统一玻璃参数（backdrop-blur-md + 30% opacity + 1px border）
- **Phantom tokens**: 编造不存在的 GitHub 色阶；只使用定义的 9 个基础 token + 3 个语义色
- **Default SaaS drift**: 回到默认蓝紫渐变卡片；坚持 GitHub Dark 调色板与等宽字体的终端气质
- **Invisible interaction**: 只做 hover 辉光，漏掉 focus-visible 环；每个可交互节点与按钮都要有键盘可见状态
- **Mono-hue tyranny**: 绿色同时用于主按钮、激活节点、图标、边框、链接；primary 只给 CTA 与当前激活节点，蓝色承担辅助与链接，红色专用于 Hang Up
- **Glass overdose**: 所有元素都加 backdrop-blur 导致层次混乱；只有卡片、节点、模态面板用玻璃效果，输入框与按钮保持实底或微透
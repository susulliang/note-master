# ECOVACS HOME App Updates

> Source: Ecovacs NA 查询宝典 · App Updates sheet · pulled 2026-09-30

ECOVACS HOME App version history. App 版本更新记录。App feature suggestions can be directed to app.pm@ecovacs.com. 遇到 App 页面显示异常或功能兼容性问题时，优先建议用户更新至最新版本 — For App display or compatibility issues, first guide users to update to the latest version.

### 3.0.0 · 2024/09/10

**What's New:**

1. Robot-related Functions
   - Upgraded the device list page (App homepage) — 升级了设备列表页（App 首页）
   - Optimized the cross-region display logic of the Manage Home feature — 优化了管理主页功能的跨区域展示逻辑
   - T30/X5 series: Added rating pop-up feature in the Robot Control Page — T30/X5 系列：机器人控制页面新增评分弹窗功能
2. App Other Functions
   - Store: Optimized coupon-related features — 优化优惠券相关功能；Optimized the payment method display on the order detail page — 优化了订单详情页的支付方式展示
   - Upgraded Wi-Fi network configuration feature (for T50) — 升级 Wi-Fi 网络配置功能（适用于 T50）
   - Added Disconnection Diagnosis feature (for X8) — 新增断线诊断功能（适用于 X8）
   - Added login Device Management feature — 新增登录设备管理功能
   - Fixed the issue that Apple Watch does not show the DEEBOT — 修复 Apple Watch 不显示 DEEBOT 的问题
   - Fixed the abnormal display issue of some languages for widget and Dynamic Island on iOS — 修复了 iOS 上小部件和灵动岛部分语言显示异常的问题

### 3.0.1 · 2024/10/18

1. Robot-related Functions
   - Device page: Hid "Call AIRBOT" button for Air Quality Monitor — 设备页对空气质量监测器隐藏"Call AIRBOT"按钮
   - Device page: Added the feature of entering the device through the robot image — 新增通过机器人图片进入设备的功能
   - Optimized multiple control features of T30 series — 优化 T30 系列多项控制功能
   - Added a Simplified robot control page for T8/T9/N8 series single robot — T8/T9/N8 系列单机新增简化操控页
2. App Other Functions
   - Optimized re-network configuration feature — 优化重新配网功能
   - Optimized naming logic of shared robot — 优化共享机器人命名逻辑
   - [APAC] Switched customer service system from Zendesk to Salesforce — 亚太区客服系统由 Zendesk 切换为 Salesforce
   - Upgraded adaptation to Android 14 — 升级适配 Android 14

### 3.1.0 · 2024/12/03

1. 新增双重登录校验功能 — Added two-step login verification.
2. App 底导文字可配置自定义颜色 — Bottom navigation text color is now customizable.
3. 升级阿里 SDK 解决飞燕机器离线和视频问题 — Upgraded the Alibaba SDK to fix offline and video issues on certain robots.
4. 修复 Android 系统 App 图标底部白线问题 — Fixed the white line under the app icon on Android.

### 3.2.0 · 2025/01/13（原表记为 2024/1/13，疑为笔误 / listed as 2024/1/13 in the source, likely a typo）

**1. 机器人 / Robot**
- DEEBOT:
  - N10/N20 系列：新增土耳其语 — Turkish voice added for N10/N20 series.
  - T50/X8 系列：新增视频状态提醒的"全部打开"选项 — "Turn all on" option for video status reminders on T50/X8 series.
  - X2/T20/N30/N20 系列：新增操控页内场景化评分弹窗运营位 — Scenario-based rating popup promo slot in the control page for X2/T20/N30/N20 series.
- Bug Fix:
  - X2/Z2/X8 系列：修复视频管家语音通话的麦克风静音问题 — Fixed the mic-mute issue in Video Manager voice calls on X2/Z2/X8 series.
  - X2/Z2/X8 系列：修复视频管家中部分折叠屏手机网络类型提示错误问题 — Fixed wrong network-type prompts on some foldable phones in Video Manager.
  - T50/X8 系列：修复设备列表定制清洁功能无数据问题 — Fixed the custom-cleaning no-data issue on the device list for T50/X8 series.

**2. 公共模块 / Common modules**
- 优化会员积分商城推荐商品数量 — Optimized the number of recommended products in the membership points mall.
- 新增备用邮箱设置功能 — Backup email setup added.
- 新增通过备用邮箱进行身份验证功能 — Identity verification via backup email added.
- 新增语音改进计划设置开关 — Voice improvement program toggle added.
- 新增配网机型不全的反馈功能 — Feedback entry for missing models in network setup added.
- 新增帮助与反馈页面的联系方式功能 — Contact info added to Help & Feedback page.
- 修正国家地区列表 — Country/region list corrected.

### 3.3.0 · 2025/03/06

Known bugs fixed — 修复已知问题。

### 3.4.0 · 2025/05/20

**1. Robot-related Functions**
- DEEBOT:
  - X8 and its subsequent video-related models: Video Manager now supports RED certification; Video Manager now correctly displays animations for dust collection and mop washing — X8 及后续视频相关机型：视频管家支持 RED 认证，正确显示集尘与洗拖布动画.
  - Fixed a loading screen flicker bug on some Android phones — 修复部分安卓手机加载画面闪烁.
  - Fixed a bug where the "Pause Cleaning" shortcut command incorrectly executed "End Task" — 修复"暂停清洁"快捷指令错误执行"结束任务"的问题.
- GOAT: New error message for the failed network configuration of the GOAT — GOAT 配网失败新增错误提示.

**2. App Other Functions**
- Store: Campaign Tasks; Referral Program — 商城：活动任务；推荐计划.
- Device List - Negative One Screen Optimization — 设备列表负一屏优化.
- Device List Network Setup Entry Optimization — 设备列表配网入口优化.
- Added a feedback entry for network configuration failures — 新增配网失败反馈入口.

### 3.5.0 · 2025/07/07

新增功能 New features：
- 【X8、X9 系列、T50 系列、T50 Max 系列及后续新品】视频管家页面新增当前使用视频显示的人数 — [X8, X9, T50, T50 Max series and newer] Video Manager shows the current number of video viewers.
- 【蓝牙、AP 配网】新增全栈 YIKO 消息提示及功能入口，并提供实时帮助引导 — [Bluetooth / AP network setup] Full-stack YIKO message prompts and entry with real-time guidance.
- 修复已知问题，提升用户体验 — Known-issue fixes and experience improvements.

### 3.6.0 · 2025/08/01

本次更新内容说明 — Update notes:
1. 修复已知问题 — Fixed known issues.
2. 优化界面与功能兼容性，持续提升用户体验 — Improved UI and feature compatibility.

重要提示：如有遇到 App 页面显示异常或功能兼容性问题，优先建议用户更新至 V3.6.0 后再次尝试 — For App display or compatibility issues, recommend updating to V3.6.0 first and retrying.

### 3.7.0 · 2025/08/27

**1. 机器人 / Robot**
- DEEBOT:
  - 优化智能体模式里偏好管理样式 — Agent mode preference-management styling optimized.
  - 全栈 YIKO：话术增加自动消失机制 / 输入框样式调整 / 多机用户增加机器切换入口 — Full-stack YIKO: auto-dismissing messages, input box styling, robot switcher for multi-robot users.
- Bug Fix:
  - 修复设备列表进入机器页白屏问题 — Fixed the white screen when entering the robot page from the device list.
  - 修复安卓手机兼容性问题（顶部和底部按钮被遮挡问题居多）— Fixed Android compatibility (top/bottom buttons being cut off).

**2. 公共模块 / Common modules**
- 商城会员：【国际】新增国际秒送活动 — Membership store: international flash-delivery campaign (international).
- 其他功能：【国际】新增捷克语、斯洛伐克语切换，优化荷兰语文案翻译 — Czech and Slovak added, Dutch translations improved (international).
- 【国际】登录注册密码强度升级（面向新注册用户 & 老用户修改密码时）— Password strength upgrade for new registrations and password changes (international).

上架状态 / Release status：Apple Store 已上架，Google Play 审核中（预计 1–2 天）— Live on the App Store; Google Play under review (~1–2 days).

### 3.8.0 · 2025/09/25

新老 AP、蓝牙配网，配网失败页面新增复制按钮，点击可以复制对应的错误码和机型 — For both new/legacy AP and Bluetooth network setup, the failure page adds a copy button that copies the error code and model.

### 3.9.0 · 2025/12/01

1. Agent Mode and Yiko: Separate preference settings entry points for independent operation — 语音助手 YIKO 与 AI Agent 模式偏好设置分离，操作更清晰。
2. Optimized interaction when scanning QR codes without permissions — 优化权限未获取时的二维码扫描页面交互。
3. Added personalized atmosphere features to Home and Control pages, with toggle switches in Personal Settings — 新增个性化氛围功能（首页与操控页），可在个人设置中开关。
4. Enhanced overseas store content — 海外商城内容增强；修复已知问题，优化界面与功能兼容。

### 3.9.1 · 2025/12/05

内部信息ℹ️【市场问题反馈与解决方案】关于升级 APP 后，T8 AIVI 无法使用视频管家的应对：请指引用户更新 APP 至 V3.9.1 版本 — Internal: for T8 AIVI unable to use Video Manager after an App upgrade, guide users to update the App to V3.9.1.

### 3.10.0 · 2025/12/30

内部信息ℹ️ Internal:
1. X8 及后续机型支持切换视频清晰度，默认高清（需适配每款机器的最新固件版本使用）— X8 and newer models support video quality switching, HD by default (requires each model's latest firmware).
2. 智能体模式下的偏好设置在恢复出厂设置后未清空问题 — Agent mode preferences not cleared after factory reset (fixed).
3. 地宝增加机型不在所售区域配网的判断 — Added check for pairing robots outside their sales region.
4. Winbot 网络设置现支持折叠屏 — Winbot network setup now supports foldables.
5. 新型号的割草机取消老版两个入口，改为右下角一个"进入设备"入口（部分之前的产品仍保留老版两个入口的形式）— New GOAT mowers replace the legacy dual entries with a single "Enter Device" entry at the bottom right; some earlier products keep the legacy layout.
6. 家庭管理——家庭成员"角色"不再限制设置数量，可同时设置多个相同角色 — Family member "roles" are no longer limited in count; duplicates allowed.

### 3.10.1 · 2026/01

iOS fixes: international pre-sale product details lacked a purchase button, preventing users from placing orders; YIKO feature share button crash issue — iOS 修复国际预售商品详情缺购买按钮无法下单、YIKO 功能分享按钮崩溃问题。
Compatible with iPhone with iOS 14.0 or later — 兼容 iOS 14.0 及以上。

iOS (follow-up patch): Fixed network configuration failure issue for WINBOT on certain models — iOS 修复部分机型 Winbot 配网失败问题。

### 3.11.0 · 2026/02/03

内部信息ℹ️ ECOVACS HOME App V3.11.0 Update Highlights:

1. **Manual Pairing Page 手动配网页** — Added category navigation: DEEBOT, WINBOT, GOAT, MORE. In the DEEBOT category, added X, T, and N series tags for quick jumping — 新增品类导航（DEEBOT/WINBOT/GOAT/更多），DEEBOT 品类下增加 X/T/N 系列标签快速跳转.

2. **Cross-Region Usage Restrictions 跨区域使用限制** — If the region selected during the robot's initial pairing differs from the current App login region, it will be flagged as a "Region Abnormality". Usage will be restricted, and users will be unable to access the device control page — 初次配网时选择的区域与当前登录区域不一致时，标记为"区域异常"，无法进入设备操控页。Solutions:
   a. Guide the user to switch the App login region back to the original region selected during the first pairing — 引导用户将 App 登录区域切回首次配网时选择的区域。
   b. Alternatively, re-pair the robot within the current App login region — 或在当前登录区域下重新配网。

3. **Account Verification Change 账号验证变更** — Verification method for changing bound phone numbers or emails changed from "Password Verification" to "Verification Code". Users must successfully verify using a code sent to the original phone number/email before binding a new one — 更换绑定手机号/邮箱的验证方式由"密码验证"改为"验证码"，需先通过原手机号/邮箱的验证码校验。

4. **Login Device Management 登录设备管理** — This feature is only available in select countries. Fixed inaccurate device information display; added a "Two-Factor Authentication (2FA)" entry on the Login Device Management page — 仅在部分国家可用；修复设备信息显示不准确问题；新增二次验证（2FA）入口。

### 3.12.0 · 2026/03/30

1. 视频管家异常弹框增加复制错误代码功能 — Video Manager error popups add a copy-error-code button.
2. 设备列表新增文字弹窗运营位（弹窗支持多语言；内容若为可跳转内容则显示跳转按钮）— Device list adds text-popup promo slot (multi-language, with jump button for linkable content).
3. 修复已知问题，优化界面与功能兼容性，持续提升用户体验 — Known-issue fixes and compatibility improvements.

### 3.13.0 · 2026/05/18

系统最低版本提示 / Minimum system version requirement:
Devices running Android below 7.0 or iOS below 15.1 will not be able to install the ECOVACS HOME APP — Android 低于 7.0 或 iOS 低于 15.1 将无法安装 ECOVACS HOME App。
修复了已知问题，增强用户体验 — Known-issue fixes and experience improvements.

### 3.14.0 · 2026/07/03

本次更新内容说明 / Update notes:

1. 氛围主题新增：地宝模型是否沿路径滚动的配置项，实现像"球"一样的滚动效果 — Ambient themes add a toggle for whether the DEEBOT model rolls along its path like a "ball".
2. 新增：开机/释放热点/重新搜索页，增加确认弹窗 — Confirmation dialogs added for power-on / hotspot release / re-search pages.
3. 新增 | 备用登录方式：动态口令 — New backup login method: device dynamic passcode. 功能目的：为用户提供不依赖邮箱/手机号的备用验证方式，解决邮件送达率低、手机号不可用等问题；口令码仅限已登录、已验证的可信设备接收 — Provides verification independent of email/phone number (low email deliverability, unavailable phone numbers); passcodes are only issued to trusted, verified devices. 设置路径：我的 → 设置 → 账户与安全 → 备用验证方式 → 设备动态口令。
4. 新增 | "登录记录"页面 & 异地登录的消息提示 — Login history page plus alerts for remote logins. 路径：我的 → 设置 → 账户与安全 → 登录记录（位于"登录设备管理"下方）。
5. 新增 | 登录场景引入位置判断 & "用户中心"风险判断 — Login risk assessment via IP, device fingerprint, frequency; low-risk logins pass directly, medium/high-risk logins get verification steps.
6. 新增 | 分享有礼赠送亚马逊礼品卡（仅欧洲地区）— Referral rewards now include Amazon gift cards (Europe only).
7. 欧洲新增 | 退货/退款入口 — Europe: new return/refund entry.

其他：修复已知问题，优化界面与功能兼容性，持续提升用户体验 — Other fixes and compatibility improvements.
系统最低版本提示：Android 低于 7.0、iOS 低于 15.1 将无法安装 ECOVACS HOME App，请知晓 — Minimum OS requirement applies.

### 3.15.0 · 2026/08/03

该版本于 8 月 3 日在各大 App 商城陆续上架，Google Play 最先上架，iOS 版本延迟 2–3 天 — Rolled out across app stores from Aug 3; Google Play first, iOS 2–3 days later.

**1. 机器人 / Robot**
- DEEBOT:
  - 修复 | 视频管家一系列页面重叠等兼容性问题 — Fixed Video Manager page-overlap compatibility issues.
  - 修复 | 蓝牙配网一系列协议异常问题 — Fixed Bluetooth pairing protocol exceptions.

**2. 公共模块 / Common modules**
- 【国际】全新升级 | 发现页面升级为服务频道，补充自助服务功能、IKO 入口、使用指南等功能 — Discover page upgraded to a Service channel with self-service, IKO entry, and usage guides (international).
- 【国际】新增 | 账号异常登录提醒 — Abnormal login alerts (international).
- 【国际】新增 | 支持从 Alexa app 快捷调起 ECOVACS Home 进行授权 — Quick authorization hand-off from the Alexa app (international).
- 新增 | 营销广告黑名单功能 — Marketing ad blacklist.

### 3.16.0 · 2026/09/07

最新版本 V3.16.0 的上架进度：iOS 已上架，Google Play 和俄罗斯 Rustore 审核中 — iOS is live; Google Play and Russia Rustore under review.

本次更新内容说明 / Update Notes:

1. 视频管家稳定性提升（Bug Fix）：修复视频管家页面内预约变更导致固件异常数据崩溃的问题；修复视频偶现绿屏缺陷 — Video Manager stability: fixed a crash triggered by schedule changes on the Video Manager page; fixed occasional green-screen issues.
2. 新增：韩国市场新增网络连接模式切换（仅 X12S）：支持局域网模式、标准模式、混合模式三种模式切换 — New: network mode switching for South Korea (X12S only): LAN mode, Standard mode, and Hybrid mode.
3. 新增：数据清单下载入口（欧洲数据法案）：设置页新增"产品与服务数据"下载入口，支持用户导出个人数据。操作路径：设置 → 产品与服务数据 → 输入邮箱并提交 → 邮箱验证 → 查收邮件下载数据 — New: data export entry for the Europe Data Act: Settings → Product & Service Data → enter email → verify → download from the email.
4. 海外新增三种语言支持：新增爱沙尼亚语、保加利亚语、匈牙利语 — New overseas languages: Estonian, Bulgarian, Hungarian.

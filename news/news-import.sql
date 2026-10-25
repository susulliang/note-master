CREATE TABLE IF NOT EXISTS news_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-01-ultramarine-p1-nose-lift-while-moving', '2026-08-01', 'UltraMarine P1 Frequently Lifts Its Nose While Moving', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-01

**Issue 问题：** 为什么 UltraMarine P1 在行走时频繁翘头（前部抬起）？
**Question:** Why does the UltraMarine P1 frequently lift its nose while moving?

目前分析原因可能有以下几个，根据用户描述针对性回复 / Based on the user''s description, respond with the matching cause:

**1、程序崩溃 / Program crash**
现象 / Symptom: 机器在行走时频繁翘头，捞出后滤篮没有东西 / Robot frequently lifts its nose while moving; debris basket is empty when taken out.
措施/话术 / Action: 程序崩溃，确认机器固件版本为最新（V5.33.0），让用户重启后再次启动即可解决 / Program crash — confirm the firmware is the latest (V5.33.0); restarting the robot resolves it.

**2、滤篮堵塞 / Clogged debris basket**
现象 / Symptom: 机器行走过程中频繁翘头，捞出后滤篮被堵住/塞满 / Robot frequently lifts its nose while moving; the basket is clogged/full when taken out.
措施/话术 / Action: 泳池内污渍过多，超过了机器滤篮的承受能力，导致滤篮堵塞。及时捞出并清洗滤篮即可。若正处于开池季或泳池长时间未清理，池底积有厚重泥沙、落叶或药粉残留，建议先人工清理大块杂物，再由机器人完成后续的精细维护 / Too much debris in the pool has overloaded the basket. Remove and clean the basket promptly. If it is pool-opening season or the pool has not been cleaned for a long time, manually remove large debris (sand, leaves, chemical residue) first, then let the robot finish the fine cleaning.

**3、水泵不转 BUG / Water pump not spinning (bug)**
现象 / Symptom: 水泵不转，驱动电机正常运行、灯光蓝灯常亮 / Water pump does not spin; drive motors run normally and the blue light stays on.
措施/话术 / Action: V5.29.0 版本已解决，引导用户升级至最新固件版本 V5.33.0 / Fixed in V5.29.0 — guide the user to upgrade to the latest firmware V5.33.0.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-04-ecovacs-home-app-v3-15-0-release', '2026-08-04', 'ECOVACS HOME App V3.15.0 Release', 'Hoi', '
> Source: General · Hoi · 2026-08-04

**Notice 通知：** 【ECOVACS HOME App 3.15.0 版本】该版本将于 8 月 3 日起在各大 APP 商城陆续上架，Google Play 最先上架，iOS 版本延迟 2-3 天。
**ECOVACS HOME App 3.15.0** rolls out to app stores starting August 3 — Google Play first, iOS following 2-3 days later.

新版本功能清单 / What''s new:

**1. 机器人 / Robots — DEEBOT**
- 修复 | 视频管家一系列页面重叠等兼容性问题 / Fixed page-overlap and other compatibility issues in Video Manager
- 修复 | 蓝牙配网一系列协议异常问题 / Fixed Bluetooth pairing protocol issues

**2. 公共模块 / Common modules**
- 【国际】全新升级 | 发现页面升级为服务频道，补充自助服务功能、IKO 入口、使用指南等 / Discover page upgraded into a Service channel with self-service, IKO entry and user guides
- 【国际】新增 | 账号异常登录提醒 / New alert for abnormal account logins
- 【国际】新增 | 支持从 Alexa app 快捷调起 Ecovacs Home 进行授权 / Quick-launch ECOVACS HOME from the Alexa app for authorization
- 新增 | 营销广告黑名单功能 / Marketing-ad blacklist feature', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-05-ai-chat-assist-preview', '2026-08-05', 'AI Chat Troubleshooting Assist — Preview', 'Hoi', '
> Source: General · Hoi · 2026-08-05

**Notice 通知：** AI Chat 模块——大家届时可以 enable 这个功能，试用和反馈。
**AI Chat module — please enable it when available, try it out and share feedback.**

AI Chat 功能各场景节点测试工作已全部完成，预计本周四 8.6 正式上线。该功能落地后，将作为海外客服工单排障场景的智能辅助工具，提供标准化回复话术。

All scenario-node testing for AI Chat is complete; official launch expected Thursday, August 6. Once live it will act as an intelligent assistant for overseas after-sales troubleshooting, providing standardized reply scripts.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-05-us-site-featured-product-change-t90-pro-omni', '2026-08-05', 'US Site Featured Product Change — T90 PRO OMNI', 'Hoi', '
> Source: General · Hoi · 2026-08-05

**Notice 通知：** US 官网主推商品调整。
**US webstore featured-product adjustment.**

- 由于 T90 PRO OMNI CARE 已售罄，目前库存已清空，暂不作为主推商品 / T90 PRO OMNI CARE is sold out and its stock is cleared — it is temporarily removed from the featured slot.
- T90 PRO OMNI 已到仓，统一调整主推商品为 T90 PRO OMNI / T90 PRO OMNI has arrived at the warehouse; the featured product is now unified as T90 PRO OMNI.
- 但请各位注意两个品的功能差异，尤其是自动加液功能 / Note the feature differences between the two models, especially the auto solution-refill function.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-06-goat-ao-mowing-task-48h-auto-terminate', '2026-08-06', 'GOAT A&O Series — Mowing Tasks Auto-Terminate After 48h Pause', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-06

为避免 2026 年 A&O 系列与计划表中的割草任务产生冲突，当割草任务暂停超过 48 小时时，系统/App 将自动终止该任务。

To avoid conflicts between the 2026 A&O series and scheduled mowing tasks, when a mowing task is paused for more than 48 hours, the system/app will automatically terminate that task.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-06-goat-battery-exchange-logic-restored', '2026-08-06', 'GOAT Battery Issue Resolved — Exchange Logic Restored', 'Alexia', '
> Source: 流程相关 · Alexia · 2026-08-06

**Notice 通知：** GOAT A2500 RTK 和 A2000 LiDAR PRO 的电池问题仓库那边排查完了，恢复正常换机逻辑。
**The battery issue for GOAT A2500 RTK and A2000 LiDAR PRO has been investigated by the warehouse — normal exchange logic is restored.**

但是，若用户明确要求备用电池，请咨询 Tier 2 和 TL 再给用户解决方案。

However, if a user explicitly requests a spare battery, consult Tier 2 and the TL before offering a solution.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-07-ultramarine-p1-online-faq-updated', '2026-08-07', 'UltraMarine P1 — Online FAQ Updated', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-07

UltraMarine P1 FAQ 在线版本有更新，请大家积极主动多多参考。

The UltraMarine P1 online FAQ has been updated — please refer to it actively.

**注意：只有阅读权限，请勿外传 Read-only access — do NOT share externally.**
在线 FAQ Online FAQ: https://ecovacs.feishu.cn/sheets/WCJ0sqcb1hx1nStogZocKYnznHc?sheet=lKcOWZ', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-08-w2s-pro-materials-faq-htu-video', '2026-08-08', 'W2S PRO & W2S PRO OMNI — New Product Materials, FAQ & HTU Video', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-06 / 2026-08-08

**W2S PRO 新品产品资料及 FAQ 已上传至共享盘 W2S PRO product materials & FAQ uploaded to the shared drive:**

- 产品资料/培训课件：`K:\Guangzhou\Ecovacs\Agent\Ecovacs NA\产品资料\培训课件\窗宝\W2S PRO & W2S PRO OMNI`
- FAQ：`K:\Guangzhou\Ecovacs\Agent\Ecovacs NA\产品资料\FAQ\WINBOT\W2S PRO OMNI`

**HTU 视频更新 HTU video updated (2026-08-08)：** W2S PRO & W2S PRO OMNI 窗宝新品 HTU 视频已更新至共享表格和 "Email Template" 模板库 — The new WINBOT W2S PRO & W2S PRO OMNI HTU video has been added to the sheet and the Email Template library:
https://lmgx8md8u1.feishu.cn/sheets/OTfAsEyjkhPw46teTexcOjIZn2c?sheet=pR2GQ3

*(Screenshots are available in the original Feishu message — image export was not authorized for these attachments.)*', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-10-ai-chat-assist-official-launch', '2026-08-10', 'AI Chat Assist — Official Launch', 'Hoi', '
> Source: General · Hoi · 2026-08-10

**Notice 通知：** AI CHAT 已经测试完毕，正式上线。
**AI CHAT has finished testing and is now officially live.**

如果业务需要，请大家在实时 CHAT 中打开 AI Assist，用以帮助生成排障相关的 FAQ；如果发现故障，可以及时反馈给当值 Tier 2 / Team Leader。

If needed, enable AI Assist in live chat to help generate troubleshooting FAQs. Report any issues to the on-duty Tier 2 / Team Leader promptly.

- Tier 2: 李书蒙Steve / 蒋志聪 / 凌键杨
- TL: Alexia / Harrison', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-10-fcc-act-customer-faq', '2026-08-10', 'FCC Act — Customer FAQ', 'Hoi', '
> Source: General · Hoi · 2026-08-10

**Notice 通知：** 关于 FCC 法案对科沃斯品牌是否存在影响的 FAQ，请各位知悉。有疑问请咨询当值 TL / Tier 2。
**FAQ on whether the FCC Act affects the ECOVACS brand. For questions, consult the on-duty TL / Tier 2.**

完整 FAQ 文档 / Full FAQ document: https://ecovacs.feishu.cn/wiki/FfwnwiGR2iOfQ8kcuPscG3Jbnnc

**1. 现有的机型是否会被封禁？其售后和质保是否会受影响？**
No, your robot is not being banned. Products currently on the market remain fully supported by ECOVACS, and your warranty and after-sales service are completely unaffected. If your unit falls within FCC requirements, it complies with applicable regulations. Please rest assured—nothing changes for you today.

**2. 软件（APP）升级是否受影响？**
No. Our APP continues to receive regular updates and full support as usual. Software services are not affected.

**3. 固件升级是否受影响？后续是否会支持用户自行刷固件，脱离我们服务器本地运行？**
Firmware updates will continue to be provided as normal. Please note, however, that flashing or modifying the firmware to run the unit independently of our servers is not officially supported. Using unauthorized firmware may compromise safety, performance, and your warranty coverage. We always recommend keeping your robot on the official, supported software.

**4. 明年（2027）是否还可以在美国购买当年新款机器人？售后和质保方面是否可以保证？**
We''re excited about our upcoming products, though we''re not able to confirm specific release dates or market availability in advance. What we can assure you is that every product we sell comes with our standard warranty and after-sales support. We''ll share official announcements as soon as they''re available.

**5. 哪些型号属于 FCC 范围内？**
All models currently on sale, as well as new models planned for 2026, are developed and managed in accordance with applicable regulatory requirements.

**6. 公司要退出美国市场了吗？**
We understand your concern. We can confirm that we remain committed to serving our customers in the US, and we''ll continue to provide support and service. For any official updates, please keep an eye on our official channels and announcements.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-11-deebot-x12-series-ota-v1-79-1', '2026-08-11', 'DEEBOT X12 Series OTA v1.79.1', 'Hoi', '
> Source: General · Hoi · 2026-08-11

**OTA Notification OTA 通知 — DEEBOT X12 Series**

X12 系列将进行固件普更，新固件版本为 1.79.1；APP H5 同步上线，预计 8 月 13 日完成全量推送。（本次更新涵盖 Yeedi S20 infinity Ultra）
Firmware upgrade will be rolled out for the X12 series with the new firmware version 1.79.1. The corresponding APP H5 page will go live simultaneously, and full-scale push is expected to be completed on August 13. (This update also covers the Yeedi S20 infinity Ultra.)

【新功能 / New Features】

1. **区域灵渍深洁 / Jet Mop by Zone** — 可在「地宝高级设定 → 灵渍深洁设置 → 区域灵渍深洁」中自定义清洁区域。默认针对厨房区域执行「先清扫浮尘 → 灵渍深洁喷溶去顽渍 → 双次拖地」三段式深度清洁，顽固污渍清洁效果显著提升。/ Customize clean zones in Advanced Robot Settings → Jet Mop Settings → Jet Mop Areas. Defaults to the kitchen area, performing a 3-step deep clean cycle — Sweep → Stain Spray Dissolve → Double Mop — for significantly better results on stubborn stains.

2. **地图坡道设置 / Ramp Setup on Map** — 地图支持手动添加坡道，帮助地宝更顺畅地通过爬坡板与坡道地形。/ Manually add ramps to your map to help the robot navigate threshold ramps and sloped surfaces more smoothly.

上述新功能的使用方法以及截图将在 OTA 推送完成后同步更新至共享盘课件。/ Instructions and screenshots for the new features will be updated to the shared-drive courseware after the OTA push completes.

【体验优化 / Experience Upgrade】
修复已知问题，整体使用体验更流畅。/ Bug fixes and overall performance enhancements for a smoother experience.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-11-deebot-x9-series-ota-v1-64-0', '2026-08-11', 'DEEBOT X9 Series OTA v1.64.0', 'Hoi', '
> Source: General · Hoi · 2026-08-11

**OTA Notification OTA 通知 — DEEBOT X9 Series**

X9 系列八月 OTA 普更将于以下时间推送完成，请知悉。
X9 Series August OTA regular update will be pushed as scheduled below, please be informed.

- 产品型号 / Product Model: DEEBOT X9 Series
- 固件版本 / Firmware Version: v1.64.0
- 推送日期 / Release Date: 2026/08/11
- 推送范围 / Scope: 国际 100% / Global 100%

【体验优化 / Experience Optimization】
修复已知问题，提升整体使用体验。/ Fixed known issues to improve overall user experience.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-12-august-promotions-us-ca', '2026-08-12', 'August Promotions — US & Canada', 'Alexia', '
> Source: General · Alexia · 2026-08-12

**Notice 通知：** 官网 8 月折扣活动。
**August webstore promotions.**

**美国 — 夏季大促尾声活动（8.4 - 8.17）/ US — Summer Sale finale (Aug 4 - Aug 17)**
- 地宝 / DEEBOT: X12 Omni Cyclone、T90 Pro Omni、T80s Omni
- 窗宝 / WINBOT: Mini 2、W3
- 割草机 / GOAT: A2000 LiDAR Pro

**雷霆上新 / Flash new arrival:** 8/14 官网预热 X12S Omni Cyclone；8/28-8/31 预计上新 X12S Omni Cyclone。

**加拿大 — 夏季大促尾声活动（8.14 - 8.30）/ CA — Summer Sale finale (Aug 14 - Aug 30)**
- 地宝 + Buddy Kit: X12 Omni Cyclone、T90 Pro Omni Package
- 窗宝: Mini 2 Package、W3 Omni
- 割草机: O1000 RTK Care Kit + 遮阳棚

**美加以旧换新（8.1 - 8.31）/ US & CA Trade-in (Aug 1 - Aug 31)**，两种形式 / two options:
1. 原价拿下新机先，DTC 给 Label 把旧的寄回来，然后再退差价给客人 / Buy the new unit at full price first; DTC issues a return label for the old unit, then refunds the difference.
2. 拿 SN 直接就抵扣了，旧机也不用寄回来 / Trade in by SN for an instant discount — no need to send the old unit back.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-12-roller-mop-tangled-email-templates', '2026-08-12', 'Roller Mop Tangled — Updated Email Templates by Model Group', 'Alexia', '
> Source: 知识点分享群 · Alexia · 2026-08-12

最新两个滚筒缠绕相关的邮件模板已由 Hoi 老师更新完毕。请按实际对应机型选用模板，避免误用。

Two updated email templates for roller-mop tangling issues are now live (updated by Hoi). Please select the template matching the actual model group to avoid misuse:

- **内置污水盒型号 Models with built-in dirty-water tank**（T90 / X12）→ 请选用 **Roller Mop Tangled - T90/X12**
- **污水盒可拆卸型号 Models with removable dirty-water tank**（X8 / T80 / X9 / T80S / X11）→ 请选用 **Roller Mop Tangled - X8/T80/X9/T80S/X11**

感谢配合！Thank you for your cooperation!

*(Screenshots are available in the original Feishu message — image export was not authorized for these attachments.)*', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-13-goat-free-battery-inquiry-handling', '2026-08-13', 'GOAT Free-Battery Inquiries — Handling Rule', 'Alexia', '
> Source: 流程相关 · Alexia · 2026-08-13

**Process 流程要求：** 关于割草机用户询问是否能够得到免费电池，但并未表示电池/充电存在问题的用户：

**For GOAT users asking about a free battery without reporting any battery/charging problem:**

- 请确认 Serial Number 后，与 Tier 2 / Team Lead 确认进一步操作。/ Confirm the Serial Number first, then check with Tier 2 / Team Lead before proceeding.
- 切勿直接拒绝用户，也不得在未确认的情况下直接答应，来问过先。/ Never refuse outright, and never promise anything before confirmation — ask us first.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-14-goat-ao-lidar-pro-ota-v1-13-10', '2026-08-14', 'GOAT A/O LiDAR PRO Series OTA V1.13.10', 'Hoi', '
> Source: General · Hoi · 2026-08-14

**OTA Notification OTA 通知 — GOAT A/O LiDAR PRO Series**

GOAT A/O LiDAR PRO 系列最新 OTA 信息更新如下 / Latest OTA update for GOAT A/O LiDAR PRO Series:

- 产品型号 / Product Model: A LiDAR PRO / O LiDAR PRO
- 固件版本 / Firmware Version: A LiDAR PRO V1.13.10 / O LiDAR Pro V1.13.10 & V2.13.10
- 推送日期 / Release Date: 2026/08/14
- 推送范围 / Scope: 20%（随后根据市场反馈陆续推送 / further rollout based on market feedback）

【体验优化 / Improvements】
- 优化沿边漏割现象 / Better edge mowing — fewer missed spots along edges
- 修复 E659 频繁告警 / Fixed frequent E659 alerts
- 手动遥控体验优化 / Smoother manual remote control
- 卡困点逻辑调整：删除卡困点后，卡困障碍物即刻消失 / Stuck-point update: deleting a stuck point now removes the obstacle right away
- A LiDAR PRO 建图边长限制调整为 150m / A LiDAR PRO map size limit changed to 150m
- 其他 bug 修复 / Other bug fixes', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-14-t30s-pro-scheduled-start-targeted-push-registration', '2026-08-14', 'T30S PRO Scheduled Start Issue — Targeted Push 1.50.0 Registration', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-14

**Issue 问题：** DEEBOT T30S PRO 系列预约启动异常的临时处理方案。
**Question:** Temporary handling for the DEEBOT T30S PRO series scheduled-start issue.

若升级到 1.49.0 后依然有预约启动异常，请联系 Alexia / Harrison / Hoi 重新登记，机器将定推 1.50.0 版本固件。

If the issue persists after upgrading to 1.49.0, contact Alexia / Harrison / Hoi to re-register the unit for a targeted push of firmware 1.50.0.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-15-t30s-ota-150-scheduled-cleaning-fix', '2026-08-15', 'T30S Series — OTA 1.50.0 Rollout & Scheduled-Cleaning Fix', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-15

**通知 / Notice**

T30S 系列海外全区域 OTA 1.50.0 版本开启 30% 普推。
T30S Series: OTA version 1.50.0 starts 30% general rollout for all overseas regions.

**处理要点 Handling：**
- 遇到预约不按时问题：先核查固件版本，引导用户升级；尚未收到 1.50.0 版本的，正常登记定推 — For scheduled-time mismatch issues: check the firmware version first and guide users to upgrade. For users who haven''t received 1.50.0, register for targeted push as normal.
- 1.50.0 版本下出现预约清洁异常问题，请继续在群内反馈 — For abnormal scheduled-clean issues occurring on 1.50.0, keep reporting in the group.

**临时处理方案 Temporary handling (related, 2026-08-14)：** 关于 DEEBOT T30S PRO 系列预约启动异常：若升级到 1.49.0 后依然有异常的，可联系 @Alexia @Harrison @Hoi 重新登记，将定推 1.50.0 — For T30S PRO series scheduled-start anomalies: if issues persist after upgrading to 1.49.0, contact Alexia / Harrison / Hoi to re-register the device for a targeted 1.50.0 push.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-18-call-handling-available-and-case-notes-reminder', '2026-08-18', 'Call Handling — Availability & Case Notes Reminder', 'Harrison', '
> Source: General · Harrison · 2026-08-18

**Reminder 温馨提醒：**

- 接完电话请及时 available / Set yourself available promptly after finishing a call.
- 接电话途中做好 note，维护好 case info / Take good notes during the call and keep case info up to date.
- 如果需要邮件跟进，请和客户说明我们一般会在 30 分钟左右发出邮件（视情况减少或者延长）。

If email follow-up is needed, tell the customer we normally send the email within about 30 minutes (shorter or longer depending on the situation). Thank you for your cooperation.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-19-download-latest-gbu-package', '2026-08-19', 'Download the Latest GBU Package', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-19

**Notice 通知：** 请大家移步下载最新的 GBU（全球业务指南）资料包。
**Please download the latest GBU package.**

路径 / Path: K:\Guangzhou\Ecovacs\Agent\Ecovacs NA\产品资料\GBU', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-20-hands-on-assessment-hq-observations', '2026-08-20', 'Hands-On Assessment — HQ Observations', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-20

**Notice 通知：** 今明两晚的实操为直接考核。目前 HQ 老师们观察到的常见问题如下，请大家对照自查。
**Tonight''s and tomorrow''s hands-on sessions count as direct assessments. Common gaps observed by HQ so far:**

1. **零部件认识不足 / Part identification** — 有同事把割草机的雷达 LiDAR 当成 AIVI 3D TOF 摄像头；不清楚割草机电极片的位置 / Some agents mistake the mower''s LiDAR radar for the AIVI 3D TOF camera, or cannot locate the mower''s electrode plates.
2. **产品使用/维护 / Usage & maintenance** — 泳池滤篮不可单独使用；W3 清洗边刷的方法；X12 滚筒遮蔽盖拆卸 / The pool robot''s debris basket cannot be used alone; how to clean the W3 side brush; how to remove the X12 roller cover.
3. **安装问题 / Installation** — 打草模块内置螺丝同样需要拧紧 / The trimmer module''s built-in screws must also be tightened.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-20-hands-on-assessment-topic-list', '2026-08-20', 'Hands-On Assessment — Topic List', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-20

**Notice 通知：** 实操题目清单如下，还没有参与实操的同事请提前预习。
**Hands-on assessment topics below — if you have not done your session yet, please prepare in advance.**

## DEEBOT 地宝

| 类别 / Category | 题目 / Topic |
|---|---|
| 清理拆装 | 如何拆装滚筒遮蔽罩？/ How to remove and refit the roller cover? |
| 清理拆装 | 拆装边刷 & 滚刷 / Remove and refit the side brush and roller brush |
| 清理拆装 | 如何更换基站集尘袋？/ How to replace the base station dust bag? |
| 清理拆装 | 如何拆装污水箱上盖的密封圈？/ How to remove and refit the dirty-water tank lid seal? |
| 清理拆装 | 如何清洁污水盒？/ How to clean the dirty-water box? |
| 指导使用 | 为什么地宝出去工作了基站还在响？/ Why is the base station still beeping after the robot leaves? |
| 指导使用 | 为什么地宝经常在桌子底下打转不出来？/ Why does the robot keep spinning under the table and fail to get out? |
| 指导使用 | 什么时候会建议用户打开"无水强制工作"？/ When to suggest enabling forced operation without water? |
| 指导使用 | 打开 AI 污渍识别功能后，机器检测到重污渍会怎样工作？/ How does the robot behave when AI stain detection finds heavy stains? |
| 指导使用 | 谷点充电怎样开启，充电逻辑是怎样的？/ How to enable spot-area charging and how does the charging logic work? |
| APP 类 | 机器的 SN 和固件版本在哪里看？/ Where to find the SN and firmware version? |
| APP 类 | APP 提示更换尘袋，我该如何处理？/ What to do when the app prompts to replace the dust bag? |
| APP 类 | AIVI 3D 功能打开和关闭有什么区别？如何在 APP 中开关？/ What does toggling AIVI 3D change, and where is the switch? |
| APP 类 | 机器老是撞玻璃门应该怎样解决？/ How to fix the robot bumping into glass doors? |
| APP 类 | 如何查看机器的报障记录？/ Where to check the robot''s error history? |
| 故障类 | 机器人完成任务的速度太慢，中途总是返回基站，如何处理？/ Robot works too slowly and keeps returning to base — how to handle? |
| 故障类 | 用户说：机器搞完地上是干的，根本没有出水 / User says the floor is dry, no water was released |
| 故障类 | 拖地的时候地面留下很多水渍，如何处理？/ Floor left with lots of water streaks after mopping |
| 故障类 | 机器人播报故障：清洁槽异常，如何处理？/ Robot reports cleaning-tray error |
| 故障类 | 用户说：地图上有一块漏扫了 / User reports a missed area on the map |
| 故障类 | X12 的熔渍喷水功能为什么不生效？/ Why is the X12 stain-spray function not working? |
| 故障类 | 用户说：集尘功能坏了，基站集尘声音很大但垃圾全在尘盒里 / User says auto-empty is broken: loud suction but all debris stays in the robot bin |
| 故障类 | 用户说：机器拖地时有异味/发臭 / Robot smells bad while mopping |

## WINBOT 窗宝

| 类别 / Category | 题目 / Topic |
|---|---|
| 清理拆装 | 窗宝驱动轮履带打滑，怎么清理履带？/ Tracks slipping — how to clean them? |
| 清理拆装 | 窗宝抹布（抹布 & 支架）怎么正确贴合？/ How to attach the cleaning cloth and holder correctly? |
| 清理拆装 | 窗宝 W3 基站内的刷子拆装与清理 / Remove, clean and refit the W3 station brush |
| 指导使用 | 窗宝 W3 基站洗拖布如何操作？/ How does the W3 station wash the pads? |
| 指导使用 | 窗宝的边刷如何清洁？/ How to clean the WINBOT side brush? |
| 指导使用 | 窗宝擦不干净窗户怎么办？有什么建议？/ WINBOT leaves streaks — any advice? |
| APP 类 | 为什么窗宝没办法自己返回原点？怎么让它回到原点？/ Why won''t the WINBOT return to its origin, and how to send it back? |
| APP 类 | 我家有很大的落地窗，窗宝可以清洁吗？如何清洁？什么模式？/ Can WINBOT clean large floor-to-ceiling windows? Which mode? |
| APP 类 | 窗宝语音播报的内容太多了，可以不让它播报吗？/ Too many voice announcements — can they be turned off? |
| 故障类 | 单机版窗宝刚到手，为什么插电不能用，提示电量不足？/ New standalone WINBOT won''t start, reports low battery |
| 故障类 | 没把窗宝放在窗户边缘，它为什么报障"避开窗户边缘"？/ Why does it warn "avoid window edge" when not near the edge? |
| 故障类 | 窗宝报警气压不足怎么办？/ WINBOT reports insufficient air pressure |
| 故障类 | 窗宝打滑怎么办？/ WINBOT is slipping |
| 故障类 | 窗宝工作时不会喷水了怎么办？/ WINBOT stopped spraying water |
| 故障类 | 窗宝漏擦了怎么办？（三种场景：打滑 / 大障碍物 / 其他）/ Missed spots (three scenarios: slip / large obstacle / other) |

## GOAT 割草机

| 类别 / Category | 题目 / Topic |
|---|---|
| 清理拆装 | 演示刀片更换全流程并口述刀盘差异（A 系列 vs O 系列）/ Demonstrate blade replacement and explain blade-disc differences (A vs O series) |
| 清理拆装 | 演示导航 & 避障模组清洁全流程及注意事项 / Demonstrate cleaning the navigation and obstacle-avoidance modules |
| 清理拆装 | 演示拆卸并安装打草模块（包含打草毛刷）/ Remove and refit the trimmer module including the trimmer brush |
| 指导使用 | 演示/口述 RTK 基站安装全流程、选址与使用注意事项 / Demonstrate RTK station installation, siting and usage notes |
| 指导使用 | 演示如何调整割草高度和打草高度 / Demonstrate adjusting mowing and trimming height |
| 指导使用 | 说明安全使用规范（急停、避障、防水）/ Explain safety rules: e-stop, obstacle avoidance, waterproofing |
| 指导使用 | 演示配网全过程 / Demonstrate the Wi-Fi setup flow |
| APP 类 | 演示如何建图；前后院场景如何建图 / Demonstrate mapping, including front/back yard scenarios |
| APP 类 | 地图编辑与禁区设置 / Map editing and no-go zones |
| APP 类 | 如何设置预约功能？/ How to schedule mowing tasks? |
| 故障类 | "机器人没电了停在外面回不去充电"排查 / Robot ran out of battery outside and cannot return |
| 故障类 | "墙边和花坛边缘老是割不干净"排查 / Edges along walls and flower beds are not cut clean |
| 故障类 | "机器人在花园里乱跑，地图都乱了"排查 / Robot wanders randomly and the map is messed up |
| 故障类 | "忘记 PIN 码了"处理 / Forgot the PIN code |
| 故障类 | "打草模块不工作"排查 / Trimmer module not working |

## 泳池机 Pool Robot

| 类别 / Category | 题目 / Topic |
|---|---|
| 清理拆装 | 演示双层滤网清洁全流程及注意事项 / Demonstrate cleaning the dual-layer filter |
| 清理拆装 | 演示四个滚刷的拆卸、检查、缠绕物清理与安装 / Remove, inspect, de-tangle and refit the four rollers |
| 清理拆装 | 演示更替攀爬环全过程及注意事项 / Demonstrate replacing the climbing ring |
| 指导使用 | 演示首次使用的全流程 / Demonstrate first-time setup |
| 指导使用 | 演示/口述工作模式的差异性 / Explain the differences between working modes |
| 指导使用 | 演示/口述如何选择并使用滤篮 / How to choose and use the debris baskets |
| APP 类 | 演示设置单次 & 周期性预约任务 / Set up one-time and recurring schedules |
| APP 类 | 用户反馈找不到语音设置在哪里？/ User cannot find the voice settings |
| APP 类 | 用户说已更换滤篮，但 APP 还一直提醒 / App keeps prompting to replace the basket after replacement |
| 故障类 | "机器人吸不上来东西，吸力变小了"排查 / Weak suction — robot is not picking up debris |
| 故障类 | "机器人没工作多久就没电了"排查 / Battery drains quickly |
| 故障类 | "机器人老在同一个地方转圈，大片地方没扫到"排查 / Robot keeps circling the same spot, large areas missed |', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-20-overseas-login-forced-verification', '2026-08-20', 'Overseas Login — Forced Verification & Alternative Methods', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-20

**海外新设备登录强制验证 Overseas new-device login forced verification**

如果用户称邮箱无法收到验证码，可以建议用户尝试 **other verification methods**：
- 扫码机器的 SN — Scan the robot''s SN QR code
- 手动输入机器的 SN — Manually enter the robot''s SN
- One-time passkey

**What should I do if I don''t receive the email verification code?**
*We understand how frustrating it is when you''re waiting for a code that doesn''t arrive. Please try these steps to troubleshoot:*

**无法收到邮箱验证码的排障步骤：**

1. **检查邮箱地址 Check Email Address：** 确保屏幕上显示的邮箱是您当前正在使用且能访问的邮箱。若该账号已停用，需要走账号找回流程更换绑定 — Ensure the email displayed on screen is the one you currently use and can access. If that account is deactivated, you will need to start our account recovery process to change your bindings.
2. **检查垃圾邮件文件夹 Check Spam/Junk Folder：** 邮件可能被误过滤，请检查垃圾邮件、促销等文件夹 — The email might have been mistakenly filtered. Check your spam, junk, or promotions folder.
3. **检查邮箱过滤规则 Review Email Filters：** 确认没有设置自动转发、黑名单或域名过滤器拦截我们的邮件 — Make sure you don''t have auto-forwarding, block lists, or domain filters set up that could prevent our emails from reaching your inbox.
4. **重新请求 Request Again：** 稍等片刻后在验证界面点击 "Resend code" 按钮，检查网络连接后重试 — Click the "Resend code" button on the verification screen after a moment, check your internet connection and try again.

*(Screenshots are available in the original Feishu message — image export was not authorized for these attachments.)*', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-25-extended-warranty-cancellation-incident', '2026-08-25', 'Extended Warranty Cancellation Notice Incident (Aug 24)', 'Hoi', '
> Source: General · Hoi · 2026-08-25

**Incident 事件说明：** 2026-8-24 美东时间遇到的"延保服务被取消"事件。
**Regarding the "extended warranty cancelled" notices seen on August 24 (ET).**

经 DTC 确认，目前是延保服务商的服务器数据进行迁移导致系统误触发了通知，客户的延保订单依然有效。客户咨询的时候我们先人为进行安抚。同时客户也可以联系延保公司确认延保订单的有效性。

Confirmed by DTC: the warranty provider''s server data migration caused the system to mistakenly trigger cancellation notices. Customers'' extended warranty orders remain valid. Reassure customers when they inquire, and let them know they may also contact the warranty company directly to confirm their order is still valid.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-25-t90-omni-sold-out-us-site', '2026-08-25', 'US Site — T90 OMNI Sold Out / Delisted', 'Hoi', '
> Source: General · Hoi · 2026-08-25

**Notice 通知：** US 官网 T90 OMNI 下架通知。T90 OMNI 库存已全部售罄。
**US webstore: T90 OMNI has been delisted — stock is fully sold out.**

如有客户咨询购买，请告知暂时无货，可推荐在售的同类机型。

If customers ask about buying it, advise that it is temporarily out of stock and recommend an available alternative model.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-26-x11-omnicyclone-sold-out-us-site', '2026-08-26', 'US Site — X11 OmniCyclone Sold Out / Delisted', 'Hoi', '
> Source: General · Hoi · 2026-08-26

**Notice 通知：** US 官网 X11 OmniCyclone 下架通知。由于 X11 OmniCyclone 全部售罄，当前已做下架处理。
**US webstore: X11 OmniCyclone has been delisted — stock is fully sold out.**', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-26-x12s-49mm-obstacle-crossing-spec', '2026-08-26', 'X12S 49mm Obstacle-Crossing Spec Clarification', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-08-26

**Issue 问题：** X12S 能越障 49mm？
**Question:** Can the X12S cross 49mm obstacles?

"至高越障 49mm" 指科沃斯地宝 X12S 家族在第一层高低 ≤25mm、第二层高度 ≤24mm 的情况下，最高实现双层合计 49mm 的越障。数据来源为科沃斯实验室，具体以家庭实际使用为准。

"Up to 49mm obstacle crossing" means the DEEBOT X12S family can cross a two-step obstacle totalling up to 49mm — first step ≤25mm and second step ≤24mm. Figure sourced from the ECOVACS lab; real-world results depend on the home environment.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-08-29-x12s-omnicyclone-us-launch', '2026-08-29', 'X12S OmniCyclone — US Launch', 'Harrison', '
> Source: General · Harrison · 2026-08-29

**Notice 通知：** 美国站 X12S OmniCyclone 今日开售！
**X12S OmniCyclone goes on sale today on the US site.**

US：DEEBOT X12S OmniCyclone 上架通知 / listing:

1. **X12S OmniCyclone**
   https://www.ecovacs.com/us/shop/deebot-robotic-vacuum-cleaner/deebot-x12s-omnicyclone
2. **X12S OC + 重污清洁液×1 + 普通清洁液×1（bundle）**
   https://www.ecovacs.com/us/shop/deebot-robotic-vacuum-cleaner/bundle-deebot-x12s-omnicyclone-cleaning-solution-kit
   X12S OmniCyclone 的适配耗材预计 11 月有货 / Compatible consumables for X12S OmniCyclone expected in stock around November.
3. **X12S OC + W3 OMNI（bundle）**
   https://www.ecovacs.com/us/shop/deebot-robotic-vacuum-cleaner/bundle-deebot-x12s-omnicyclone-winbot-w3-omni', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-01-winbot-tilt-angle-capability-update', '2026-09-01', 'WINBOT Tilt-Angle Cleaning Capability Update (Multiple Models)', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-01

**产品逻辑变更通知 — 窗宝多型号支持清洁的倾斜角度调整**

各位同事好，跟大家同步窗宝倾斜角度适配范围的更新：

**变更前 Before：** 以垂直地面的玻璃面（90°）为基准，可清洁角度范围为 90°±45°；除 W3 以外，其余型号不支持水平面玻璃作业。
Referenced to a vertical glass surface (90°), the supported cleaning angle was 90°±45°. Except for W3, other models could not clean horizontal glass surfaces.

**变更后 After：** 以垂直地面的玻璃面（90°）为基准，**正挂状态**可支持角度扩大至 90°±90°（支持水平面之上的清洁）；**倒挂状态**的限制条件维持不变。
Referenced to a vertical glass surface (90°), the supported angle for the **normal-hang state** is expanded to 90°±90° (cleaning above horizontal is supported). Restrictions for the **inverted-hang state** remain unchanged.

**简单理解：** 窗宝现在可支持更大的玻璃倾斜角度。/ In short: WINBOT now supports a wider range of glass tilt angles.

**OTA 推送计划 Rollout schedule:**
- **W3：** 已完成 OTA 推送 — OTA completed
- **W2S PRO 系列：** 8 月 31 日 OTA 推送 — Aug 31
- **mini 2：** 9 月 24 日 OTA 推送 — Sep 24

**⚠️ 重要注意事项 Important Notes：**
1. 在水平面玻璃作业时，不支持沿边清洁模式，APP 内会弹出对应提示 — Edge-cleaning mode is unavailable for horizontal-surface cleaning, with in-app notification provided.
2. 实际是否可清洁，以窗宝识别判断为准；如果窗户角度不满足条件，设备会弹窗提醒并报警 — Always follow WINBOT''s on-device judgement; it will alert and alarm if the angle is unsupported.
3. 即便人工判定角度处于支持区间，最终仍以机器自身检测结果为准 — Even if manual check shows the angle is within range, the robot''s self-detection result takes priority.

*(Screenshots are available in the original Feishu message — image export was not authorized for these attachments.)*', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-02-service-languages-english-french-only', '2026-09-02', 'Service Languages — English & French Only', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-09-02

**Policy 政策提醒：** 请大家注意，目前我们的服务语言有且只有英语和法语。我们不提供西语服务，除非用户情绪激动或有差评等风险。

**Our service languages are English and French only.** We do not provide Spanish service, unless the user is highly agitated or there is a risk of a bad review or similar.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-02-x12s-series-planck-s-plus-new-features', '2026-09-02', 'X12S Series (Planck S Plus) — New Features Deep Dive', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-02

**机型 Models：** X12S PRO (TW)、X12S OmniCyclone、X12S PRO OMNI、X12S PRO with Auto Refill And Drain (TW&KR)

**主要功能 Key features：** 灵渍深洁、灵缠 4.0、灵隙 3.0、AGENT YIKO 3.0、基站增压活水净洗、污水箱加热抑菌（新）、巨浪（新）、真空除螨腔（新）、尘盒烘干（新）

## 1. 吸力概念变更 Pa → AW Suction unit change

Air-Watt（空气瓦特）是吸尘器的**有效吸入功率**单位，表达**风量 (L/s)** 和**真空吸力 (Pa)** 的综合效率，是吸尘器行业公认的衡量吸尘能力的最准确指标。

Air-Watt is the unit of **effective suction power**, expressing the combined efficiency of **airflow (L/s)** and **vacuum suction (Pa)**. It is the industry-recognized, most accurate measure of vacuuming capability.

## 2. 瞬时超充 Plus Instant Flash Charging Plus (cannot be disabled 不可关闭)

**① 标准补电逻辑 Standard top-up logic：** 约剩余 15%–89% 电量会触发瞬时超充任务，机器每次执行回洗抹布任务时正常触发超充。若机器电量低于 40% 且不足以完成本次清扫任务时，底层将补电模式自动转换为自适应模式，出现纯补电任务，每 15 分钟回去补电一次，每次默认执行 5 分钟补电，其它不变（如非纯补电任务，还按照标准档位执行）。注：仅扫地模式（高频集尘）下不触发超充，除非触发自适应超充。
- Triggered between 15%–89% battery during mop-wash returns. Below 40% battery when the task cannot be completed, the firmware auto-switches to adaptive mode: pure top-up tasks every 15 minutes, 5 minutes each. Sweeping-only mode (high-frequency dust emptying) does NOT trigger flash charging unless adaptive charging kicks in.

**② 自适应补电逻辑 Adaptive top-up logic：** 扫拖模式下机器人根据设定的回洗抹布间隔自动规划返回基站补电。10 分钟回洗间隔：工作约 10 分钟后返回洗抹布同时超充；15 分钟间隔：约 15 分钟后回洗+超充；**25 分钟间隔：为保障续航，最长工作约 15 分钟后即返回进行超充（只超充不回洗）**。
- In sweep+mop mode the robot returns per the configured mop-wash interval. With the 25-min interval, to protect battery life it returns for charging only after at most ~15 minutes of work.

**③ 超充散热逻辑 Cooling logic：** 散热由机器内置温度感应器判断执行，每次散热时间为 25min；清扫任务结束后主机会提前结束散热任务。
- Cooling is triggered by the internal temperature sensor, 25 minutes per cycle, ended early when the cleaning task finishes.

## 3. 真空除螨腔 Vacuum Dust-Mite Chamber (with mite-removal report 有除螨报告)

把原主刷盖板上的三处贴地毛毡改为**超薄橡胶导轮**，帮助滚刷腔体下压的同时在地面滚动前行，深入地毯，减小滚刷与地毯间的缝隙，提升吸尘性能。
- The three felt pads on the main-brush cover are replaced by **ultra-thin rubber guide wheels** that press the brush chamber down while rolling, reaching deep into carpet and reducing the gap between roller and carpet for better suction.

注意 Notes：导轮易缠绕毛发，清洁导轮需要拆下主刷盖背面三颗螺丝；前期导轮备件在地毯上可能出现异音，后续备件更新升级会改善 — The wheels tangle with hair easily; cleaning requires removing three screws on the back of the brush cover. Early spare wheels may squeak on carpet; an updated spare part will fix this.

## 4. 原生越障 2.5cm Native 2.5cm obstacle crossing

取消辅助轮设计，改用 7.6cm 超大直径驱动轮，实现原生越障 2.5cm、连续越障 4.9cm。
- Auxiliary wheels are removed in favor of 7.6cm oversized drive wheels: 2.5 cm native crossing, 4.9 cm continuous crossing.

## 5. 巨浪 "Big Wave" station self-clean

替代原本的基站自清洁功能，高压喷水冲洗清洁槽接水托盘。
- Replaces the old station self-clean: high-pressure water jets flush the cleaning-tray water pan.

1. 巨浪会在**末次**清洗完拖布后自动触发 — Auto-triggers after the FINAL mop wash.
2. 手动点击 APP 自清洁按钮可手动触发 — Or trigger manually via the app''s self-clean button.
3. 巨浪触发需要机器在基站内待机，不涉及出基站 — Requires the robot to be docked and idle; the robot never leaves the station.

## 6. 污水箱加热 Dirty-water-tank heating

污水箱按设定时间开始加热，抑制异味滋生。采用 Gore-Tex 防水透气膜阻隔异味扩散。
- The dirty-water tank heats at the scheduled time to suppress odor, with a Gore-Tex breathable membrane blocking odor diffusion.

1. 加热温度 70°C，不会煮沸污水 — Heats to 70°C, never boils.
2. 70°C 加热持续 20 分钟 — The 70°C phase lasts 20 minutes.
3. 从室温加热到 70°C 大约需要 2-3 小时 — Room temperature to 70°C takes ~2–3 hours.
4. 触发需主机满电待机；**工作中 & 电量不足会导致加热不触发** — Requires the robot fully charged and idle; working or low battery prevents heating.

## 7. 尘盒烘干 Dust-bin drying

基于 BLAST 技术的静音送风能力，基站内自动烘干时同步烘干尘盒在内的吸尘风道，使灰尘干燥蓬松、减少异味。
- Using BLAST quiet-air technology, station drying also dries the dust bin and suction duct so dust stays dry and fluffy with less odor. **与基站烘干任务同时触发，持续 40min，噪音比普通烘干大，约 45-50 分贝** — Runs together with station drying for 40 minutes, louder than normal drying at ~45–50 dB.

## 附图 Screenshots

![X12S feature 1](assets/x12s-planck-features-01.jpg)
![X12S feature 2](assets/x12s-planck-features-02.png)
![X12S feature 3](assets/x12s-planck-features-03.png)
![X12S feature 4](assets/x12s-planck-features-04.jpg)
![X12S feature 5](assets/x12s-planck-features-05.png)
![X12S feature 6](assets/x12s-planck-features-06.jpg)

## 区域特性 Regional differences

- **仅 AMR & KR 配备隐私挡片**，可物理遮挡摄像头 — Privacy shutter (physical camera cover) only on AMR & KR units.
- **海外仅 AMR 不配备污水箱加热抑菌功能**，外观与原 X12 Series 清污水箱相同 — Overseas, only AMR lacks dirty-water-tank heating;外观与原 X12 系列水箱相同 (same appearance as the original X12 Series tanks).', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-03-login-verification-code-not-received', '2026-09-03', 'Login Verification Code Not Received — Handling & Whitelist Option', 'Alexia', '
> Source: 知识点分享群 · Alexia · 2026-09-03

如果遇到**无法收到登录验证码**的问题，请先完成基础"无法收到验证码"排障。

If a customer **cannot receive the login verification code**, first complete the basic verification-code troubleshooting flow.

**若问题持续，请与用户沟通以下两种方法哪种能接受：** If the issue persists, discuss which of the two options the customer accepts:

① **直接重新注册一个账号**，作为新用户绑定这台机器，但过往这台机器的数据会丢失 — Register a brand-new account and bind the robot to it as a new user; however, historical data for this robot will be lost.

② **可申请加入白名单**。白名单账号后续换设备登录 App 将免除验证 — Apply to add the account to the whitelist. Whitelisted accounts will no longer require verification when logging in from a different device.
- 但请务必提醒：账号安全性保障下降，建议用户确保登录密码足够复杂且不与其他平台重复 — But be sure to remind the customer: account security is reduced; use a sufficiently complex password and never reuse passwords from other platforms.

若用户选择方法②，请收集用户 APP 账号关联邮箱（及注册国家 US/CA），升级给 Tier 2 / Team Lead — If the customer picks option ②, collect the email address associated with the app account (and country of registration US/CA) and escalate to Tier 2 / Team Lead.

**参考确认话术 Reference scripts (English):**

**Method One:** You may consider registering a new account and then connecting your Deebot to the newly created account.

**Method Two:** If verification is still unsuccessful, we may apply to have the current account added to the whitelist. Once whitelisted, the account will no longer be required to complete verification when logging into the app from a different device. *However, please note that this reduces the level of account security. We recommend using a sufficiently complex password and, most importantly, avoiding reuse of the same password across other platforms.*

*If you are open to the whitelisting option, please confirm the information below:*
- *Email address associated with your account: xxxxxxx*
- *Country of registration: US/CA*

*(Screenshots are available in the original Feishu message — image export was not authorized for these attachments.)*', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-04-call-business-hours-restoring-9am-9pm', '2026-09-04', 'Call Business Hours Restoring to 9AM-9PM (from Sep 7)', 'Alexia', '
> Source: General · Alexia · 2026-09-04

**Notice 通知：** 雷霆快报：下周一 9.7 北美 call 业务营业时间将正式恢复 9AM-9PM。
**Flash update: from Monday, September 7, the North America call business hours officially return to 9AM-9PM ET.**', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-05-x12s-vs-x12-comparison', '2026-09-05', 'X12S vs X12 Series — Comparison', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-05

## 1. 吸力表现 Suction Performance 吸尘性能

- X12S: **27 L/s 风量 airflow**，最高 **27,000 Pa 吸力 suction power**，可深层吸除地毯深处灰尘与地面缝隙中的碎屑 — deep extraction of embedded dust from carpets and debris from floor crevices.
- X12: **22 L/s airflow**，最高 **22,000 Pa suction power**。

## 2. 越障能力 Obstacle Crossing 越障

- X12S: 无辅助轮可越障 **2.5 cm (0.98 in)**；带辅助轮可越障 **5 cm (1.97 in)** — up to 2.5 cm without auxiliary wheels, up to 5 cm with auxiliary wheels.
- X12: 门槛越障 **24 mm (0.94 in)**；可跨越最高 **4 cm (1.57 in)** 的推拉门滑轨 — 24 mm threshold crossing; sliding-door tracks up to 4 cm.

## 3. 基站烘干 Base Station Drying 基站烘干

- X12S: 滚刷、尘盒和风道均为 **63°C 烘干**，整体烘干更彻底 — 63°C drying for the roller brush, dust bin, and air duct for more thorough overall drying.
- X12: 滚刷 **63°C 烘干**，帮助防异味抑菌 — 63°C roller-brush drying to help prevent odors and bacteria.

## X12S 新功能 New Features 新增功能

1. **真空除螨 Dust Mite Removal 真空除螨：** 主刷盖板上新增 3 个小辅轮，配合加厚刷条实现高频拍打，加上 **53 AW 强吸力**，实现吸尘式除螨，清洁更健康 — 3 new small auxiliary wheels on the main-brush cover combine with thickened brush strips for high-frequency tapping, and together with 53 AW of suction enable vacuum-based dust-mite removal for a healthier clean.
2. **FocusJet 2.0：** 相比 X12 的 FocusJet，FocusJet 2.0 新增高压交叉喷淋清洁液，快速覆盖污渍区域，有效渗透溶解顽固污垢 — Compared to the FocusJet on X12, FocusJet 2.0 adds high-pressure cross-spray cleaning fluid that quickly covers stained areas, effectively penetrating and dissolving stubborn dirt.

*(另有 X11 vs T90 vs X12 vs X12S 对比图，见飞书原消息 — A X11 vs T90 vs X12 vs X12S comparison chart is available in the original Feishu message.)*', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-07-deebot-x12-series-ota-v1-85-0', '2026-09-07', 'DEEBOT X12 Series OTA v1.85.0', 'Hoi', '
> Source: General · Hoi · 2026-09-07

**OTA Notification OTA 通知 — DEEBOT X12 Series**

X12 系列将启动新版本推送，推送版本为 1.85.0。版本推送计划为普更 / general rollout:

- 2026/09/04 推送 30%
- 2026/09/08 推送 60%
- 2026/09/11 推送 100%

【体验优化 / Experience Improvements】

1. 优化清洁液低液位提醒，减少部分机型频繁提醒的问题。/ Optimized low cleaning-solution level reminders to reduce excessive notifications on certain models.
2. 优化基站清洁槽水满检测，减少水满误报。/ Optimized water-full detection for the base station''s mop-washing tray to reduce false alarms.
3. 升级瞬时超充逻辑，延长清扫续航时间。/ Upgraded PowerBoost charging logic to extend cleaning runtime.
4. 新增集尘袋安装到位语音提示。/ Added a voice prompt confirming the dust bag is properly installed.
5. 优化运行逻辑，改善碰撞表现。/ Optimized operating logic to improve collision handling.
6. 修复多项细节问题，提升整机稳定性。/ Fixed various minor issues to improve overall stability.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-08-call-business-hours-officially-restored', '2026-09-08', 'Call Business Hours Officially Restored (9AM-9PM ET)', 'Harrison', '
> Source: General · Harrison · 2026-09-08

**Notice 通知：** 雷霆快报再报，科沃斯北美 Customer Support call 业务支持时间已正式恢复，美国东部时间 9AM - 9PM。
**Flash update: ECOVACS North America Customer Support call hours have officially returned to 9AM-9PM ET.**

- 请各位 A00 的小伙伴做好准备，同时多注意自己班表的排班 / A00 agents please get ready and double-check your shift schedule.
- PS：9 月 21 日有在线培训，具体安排请留意后续通知 / Online training on September 21 — watch for follow-up notices.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-08-ecovacs-home-app-v3-16-0-release', '2026-09-08', 'ECOVACS HOME App V3.16.0 Release', 'Hoi', '
> Source: General · Hoi · 2026-09-08

**Notice 通知：**【Ecovacs Home APP 新版本通知 / ECOVACS HOME APP New Version Notification】

最新版本 V3.16.0 的上架进度：iOS 已上架，Google Play 和俄罗斯 Rustore 审核中。/ V3.16.0 rollout status: iOS is live; Google Play and Russia Rustore are under review.

**1. 视频管家稳定性提升（Bug Fix）**
修复视频管家页面内预约变更导致固件异常数据崩溃的问题；修复视频偶现绿屏缺陷。/ Fixed a crash triggered by schedule changes on the Video Housekeeper page; fixed an occasional green-screen issue.

**2. 新增：韩国市场网络连接模式切换（仅 X12S）/ New: Network Mode Switching for South Korea (X12S only)**
支持局域网模式、标准模式、混合模式三种模式切换。/ Supports switching between LAN mode, Standard mode, and Hybrid mode.

**3. 新增：数据清单下载入口（欧洲数据法案）/ New: Data List Download Entry (Europe Data Act compliance)**
设置页新增"产品与服务数据"下载入口，支持用户导出个人数据。操作路径：设置 → 产品与服务数据 → 输入邮箱并提交 → 邮箱验证 → 查收邮件下载数据。/ A new "Product & Service Data" download entry in Settings lets users export their personal data. Path: Settings → Product & Service Data → Enter Email and Submit → Email Verification → Check Email to Download.

**4. 海外新增三种语言支持 / New overseas languages**
新增爱沙尼亚语、保加利亚语、匈牙利语。/ Estonian, Bulgarian, and Hungarian have been added.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-08-ultramarine-p1-ota-v5-39-0', '2026-09-08', 'UltraMarine P1 OTA V5.39.0', 'Hoi', '
> Source: General · Hoi · 2026-09-08

**OTA Notification OTA 通知 — UltraMarine P1**

泳池 P1 最新 OTA 信息如下 / Latest OTA update for UltraMarine P1:

- 固件版本 / Firmware Version: V5.39.0
- 推送方式 / Rollout: 100% 强制更新 / Mandatory update
- 推送时间 / Release Date: 2026/09/08 - 09

【更新内容 / Update Details】—— 可对外 / For external use

本次更新为产品性能优化，提升整体使用体验。/ This update includes product performance optimizations to improve overall user experience.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-09-n30-pro-omni-white-sold-out-us-site', '2026-09-09', 'US Site — N30 PRO OMNI WHITE Sold Out / Delisted', 'Harrison', '
> Source: General · Harrison · 2026-09-09

**Notice 通知：** 美国官网 N30 PRO OMNI WHITE 下架通知。N30 PRO OMNI WHITE 现有库存已全部售罄，官网做下架处理。
**US webstore: N30 PRO OMNI WHITE has been delisted — stock is fully sold out.**', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-14-omni-station-hot-water-washing', '2026-09-14', 'OMNI Station Hot-Water Mop Washing — Why the Water Feels Cool', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-14

如遇用户反馈全能基站/OMNI Station 热水洗抹布疑似未正常出热水（例如在拖地过程中取出抹布触摸时感觉比较凉），可参考以下说明：

If a customer reports the All-in-One Station / OMNI Station seemingly fails to wash mops with hot water (e.g. the mops feel cool when taken out mid-cleaning), refer to the following:

- 地宝首次进行抹布清洗时使用的是冷水，在后续回洗过程中才会开启热水加热 — The FIRST mop wash of a cleaning session always uses cold water; hot-water heating only kicks in for subsequent washes.
- 回洗过程中，热水会持续喷淋并不断流出。由于热量会随着水流持续消耗和散失，回洗阶段的水温会逐渐降低，因此用户在回洗过程中触摸抹布时可能会感觉水温越来越低，属于正常现象 — During washing, hot water is sprayed continuously and flows out constantly. Heat is consumed and dissipated with the water flow, so the water temperature GRADUALLY DECREASES during the wash cycle — the mops feeling cooler and cooler is normal behavior.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-15-winbot-cleaning-fluid-no-nano-particles', '2026-09-15', 'WINBOT Cleaning Fluid — No Nano Particles (Clarification)', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-15

科沃斯窗宝专用清洁液不含纳米颗粒、纳米粉体或纳米功能性材料。

The ECOVACS WINBOT dedicated cleaning fluid contains NO nano particles, nano powders, or nano functional materials.

配方成分为：去离子水、异丙醇、非离子表面活性剂、防腐剂、亮蓝二钠盐、芳樟醇，没有添加纳米粒子/纳米材料 — The formula consists of deionized water, isopropyl alcohol, non-ionic surfactants, preservatives, brilliant blue disodium salt, and linalool. No nano particles or nano materials are added.

部分窗宝机型宣传的 "nano-level spray / 纳米级喷雾"，不是清洁液里面含有纳米颗粒，是主机超声波雾化技术，把液体打散成极细小雾滴，属于液滴物理形态，不是添加纳米固体粉末 — The "nano-level spray" advertised for some WINBOT models does not mean the fluid contains nano particles. It refers to the robot''s ultrasonic atomization technology, which breaks the liquid into extremely fine droplets — a physical droplet form, not added solid nano powder.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-15-winbot-w3-omni-insufficient-air-pressure', '2026-09-15', 'WINBOT W3 OMNI — "Insufficient Air Pressure" Alarm Handling (Updated)', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-15

**窗宝 W3 OMNI 报警"气压不足"对应办法更新 Updated handling for the "insufficient air pressure" alarm:**

## Step 1 — 取下机器 Remove the robot

请连接 APP 手动遥控机器至可手动取下的位置，重新吸附工作即可。若使用时没有连接 APP，可通过如下两种方法连接：

Connect the app and manually remote-drive the robot to a position where it can be removed by hand, then re-attach it to work. If the app was never connected, there are two ways to connect:

1. 直接用 APP 扫描配网二维码并按步骤连接，配网码在基站内窗宝收纳仓内壁挂钩旁 — Scan the Wi-Fi pairing QR code with the app and follow the steps; the pairing code is inside the station''s storage bay, next to the hook on the inner wall.
2. 直接在 APP 中选择手动添加，选择对应型号之后，也可完成连接 — Or choose "Add manually" in the app, select the model, and complete the connection.

机器同时会有语音提醒，提醒消费者按照 APP 步骤来完成操作 — The robot also gives voice prompts guiding the customer through the app steps.

## Step 2 — 检查机器及窗户 Check the robot and the window

1. 单块擦窗布累计使用满 30 次后建议及时更换。若清洁时频繁出现气压不足报警、抹布表面明显磨损变形、卷曲脱胶或清洁效果下降时，请立即更换抹布 — Replace each cleaning cloth after 30 uses. Replace immediately if the alarm recurs frequently, or the cloth is visibly worn, deformed, curled, unglued, or cleaning performance drops.
2. 检查窗户/被清洁物上是否有缝隙，有缝隙的平面请勿使用窗宝，否则可能造成气压不足或跌落 — Check the window/surface for gaps; never use WINBOT on cracked or gapped surfaces, or it may lose pressure or fall.
3. 检查窗户/被清洁物上是否有异物，若有请去除后再使用 — Remove any foreign objects from the surface before use.
4. 检查擦窗布上带有磁力的部分是否吸附了金属物质 — Check whether the magnetic parts of the cloth have picked up metal debris.
5. 检查擦窗布拆卸后，红色的密封棉是否牢固。密封棉不仅起到给抹布支架提供压力的作用，还起到真空腔密封性的作用 — After removing the cloth, check the red sealing foam is secure. It both presses the cloth frame and seals the vacuum chamber.
6. 检查抹布支架是否安装到位 — Check the cloth frame is seated correctly.
7. 检查抹布的毛是否立起，尝试把抹布上的毛抚平。若无法解决，建议走售后流程 — Check the cloth pile is not standing up; try smoothing it flat. If unresolved, escalate to after-sales.

## 配件更新 Parts update

- 新抹布 New cloth: **201-J001-00A7**（留痕、变形改善后物料，可同时适配 W3 新老款机器）— improved material with less marking/deformation; fits both new and old W3 units.
- 老抹布 Old cloth: **201-J001-0072**（备件将优先消耗老抹布库存）— old stock will be consumed first.

若新版 W3 机器（固件版本 V2.7.0，铭牌生产日期 2026 年 9 月）安装上老抹布 201-J001-0072 后报障"气压不足"或出现"开始工作一分钟就播报清洁完成"的情况，引导用户连接 APP，点小红点进行 OTA 升级 — If a new W3 (firmware V2.7.0, nameplate date Sep 2026) with the old cloth 201-J001-0072 reports low pressure or "cleaning complete" one minute after starting, guide the user into the app and tap the red dot to run the OTA update.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-17-goat-mower-path-requires-two-zones', '2026-09-17', 'GOAT Mower — Path Creation Requires Two Separate Zones', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-17

割草机无法添加通道/Path —— 仅在有两块区域时才能创建 Path；另外再创建区域时，两个区域之间需要有间隔。

The GOAT mower cannot add a channel/Path: a Path can only be created when there are exactly TWO zones. Also, when creating additional zones, there must be a gap between the two zones.

![GOAT Path creation example](assets/goat-path-two-zones-01.jpg)', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-17-x12s-obstacle-crossing-claims', '2026-09-17', 'X12S Obstacle Crossing Claims — 50mm and 49mm Clarifications', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-17 & 2026-08-26

**Q: X12S 可以越障 50mm？ Can the X12S cross obstacles of 50mm?**

答：50mm 指的是机器可连续越障的高度，科沃斯地宝 X12S 系列产品可连续翻越两级 25mm 衔接台阶。该数据为实验室测试条件下的最大越障高度，具体以家庭实际使用为准。

A: 50mm refers to the maximum continuous obstacle-crossing height of the robot. The ECOVACS DEEBOT X12S series can continuously climb two connected 25mm steps. This figure is the maximum obstacle-crossing height obtained under laboratory test conditions. Actual performance may vary based on home environments.

- 实验室测试条件 Laboratory test conditions：第一层台阶高度 ≤25mm、宽度 ≥20cm；第二层台阶高度 ≤25mm — First step height ≤25 mm, width ≥20 cm; second step height ≤25 mm.

![X12S obstacle crossing test conditions](assets/x12s-obstacle-claims-01.jpg)

**Q: X12S 能越障 49mm？ Can the X12S cross obstacles of 49mm?**

至高越障 49mm 指科沃斯地宝 X12S 家族在第一层高度 ≤25mm、第二层高度 ≤24mm 时，最高实现双层 49mm 的越障。数据来源科沃斯实验室，具体以家庭实际使用为准。

"Up to 49mm" refers to the DEEBOT X12S family crossing a double-layer obstacle at most 49mm high when the first layer is ≤25mm and the second layer is ≤24mm. Data from the ECOVACS lab; actual performance may vary in home environments.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-18-issue-type-and-model-no-entry-requirement', '2026-09-18', 'Issue Type & Model No. — Accurate Entry Required', 'Alexia', '
> Source: 流程相关 · Alexia · 2026-09-18

**Reminder 温馨提醒：** 请务必在处理工单任何时候都准确填写 Issue Type 和 Model No.，两者均需要及时、准确更新。

**Always enter Issue Type and (AMR) Model No. accurately and keep them up to date on every ticket.**

- 目前质检端已建立专项进行抽查，后续将严格按照要求进行检查并扣分。/ QA has set up a dedicated audit — checks will be strict and errors will cost points.
- 请大家务必做好基础信息维护，不要因个人基础信息维护不到位，影响团队整体业务指标的达成。/ Keep these basics accurate so individual entries don''t drag down team metrics.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-18-original-device-return-policy-update', '2026-09-18', 'Original Device Return Policy Update (Effective Sep 17, 2026)', 'Alexia', '
> Source: 流程相关 · Alexia · 2026-09-18

**Policy 政策更新：** 原设备寄回政策更新（生效日期 2026 年 9 月 17 日）。
**Original-device return policy update — effective September 17, 2026.**

从 2026 年 9 月 17 日起，以下适用机型在购买时间不超过 ≤6 个月的情况下，用户必须将原设备寄回。对于其他型号（包括所有窗宝、泳池机、亲宝，及 GOAT GX600），用户无需寄回原来的设备。

From September 17, 2026, for the listed models purchased within ≤6 months, the user MUST return the original device. Other models (all WINBOTs, pool robots, mother & baby machines, and GOAT GX600) do NOT require returning the original device.

**要寄回的型号 / Must return:**

- **地宝 / DEEBOT:** T30S、T30S COMBO、T30 MIX PRO、T30 MIX PRO COMBO、T30S CARE、T30S AI CARE、X5 PRO OMNI、X8 PRO OMNI CARE、T50 OMNI、T50 OMNI Black、T50 OMNI CARE Black、T50 PRO OMNI、T50 PRO OMNI White、T50 MAX PRO Black、T80 OMNI、X8 PRO OMNI、X9 PRO OMNI、X11 OmniCyclone、X11 PRO OMNI、X12 OmniCyclone、X12S OmniCyclone、X9S PRO OMNI、T50S OMNI、T50S PRO OMNI、T50S PRO OMNI CARE、T80S OMNI CARE、T90 OMNI、X12 PRO OMNI CARE、T90 PRO OMNI、T90 PRO OMNI CARE、X11S OmniCyclone、T80S OMNI
- **GOAT:** A1-2000 RTK、A1-2500 RTK、A1-3000 LiDAR、A1-3000 RTK、O1-1000 RTK、GOAT O1000 RTK Care Kit、A2000 LiDAR PRO、A3000 LiDAR PRO、O1000 LiDAR PRO

**不要寄回的型号 / No return needed:** 全线窗宝、全线泳池机、GOAT GX600、亲宝（狗子）/ all WINBOTs, all pool robots, GOAT GX600, mother & baby machines.

（补充 / Note: T30 系列后续也确认为无需寄回，见 2026-09-19 条目。/ T30 series was later confirmed exempt too — see the Sep 19 entry.）', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-19-t30-series-exempt-from-device-return', '2026-09-19', 'T30 Series Exempt from Device Return', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-09-19

**Policy 政策补充：** 请各位注意，T30 系列也无需寄回（2026-9-8）。
**Note: the T30 series is also exempt from returning the original device (as of Sep 8).**

此为原设备寄回政策更新（2026-09-17 生效）的补充说明。/ This supplements the original-device return policy update effective September 17, 2026.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-19-ultramarine-p1-spin-in-circles', '2026-09-19', 'UltraMarine P1 — Why Does the Robot Spin in Circles? (8 Causes)', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-19 (updated)

泳池机 UltraMarine P1 原地转圈的 8 种原因与处理措施。根据用户描述的现象针对性回复：

**1. Boss 底柱与底壳连接处断裂 — Boss column cracked loose from the bottom shell**
- 现象：原地转圈；蓝灯常亮；捞出后发现机器外观破损 — Spins in place; blue LED stays on; visible damage after lifting the robot out.
- 措施：引导换机 — Guide the customer to a unit replacement.

**2. 电机螺丝断裂 — Motor screw broken**
- 现象：原地转圈；引导用户拆开侧挡板，可以看到螺丝断裂 — Spins in place; a broken screw is visible after removing the side cover.
- 措施：引导换机 — Unit replacement.

**3. 程序崩溃 — Software crash**
- 现象：原地转圈或不规则移动；外观无损坏；捞出后无故障报警；驱动轮正常转动、履带内无脏污 — Spins or moves irregularly; no exterior damage; no alarm after removal; tracks turn normally and are clean.
- 措施：引导用户重启 — Guide the user to restart the robot.

**4. 单侧保险丝烧毁 — One-side fuse blown**
- 现象：机器朝一个方向原地转圈；捞出后 APP 有驱动轮卡住告警；履带内无脏污 — Spins toward one direction; "drive wheel stuck" alarm in the app after removal; tracks clean.
- 措施：密封舱进水导致保险丝烧毁，引导用户换机 — Water ingress in the sealed compartment blew the fuse; unit replacement.

**5. 滤篮堵塞 — Filter basket clogged**
- 现象：原地转圈或不规则挪移；重污/开荒环境清洁后；滤篮被可见堵住、可存大量水；捞出后无故障报警；驱动轮正常、内无污渍 — Spins or shuffles; after cleaning heavy dirt / pool-opening sludge; visibly clogged basket that holds a lot of water; no alarm; tracks normal and clean.
- 措施：泳池污渍超过滤篮承受能力导致堵塞，及时捞出并清洗滤篮即可。若泳池脏污较多，建议及时捞出清洗滤篮；清洁重污场景时建议取出内滤篮以获得最佳过滤性能。开池季或长期未清理的泳池，先人工清理大块杂物（泥沙、落叶、药粉残留），再由机器人完成精细维护 — The pool''s dirt exceeded the basket''s capacity. Lift the robot out and rinse the basket promptly. For heavy dirt, remove the inner basket for best filtration; in pool-opening season, hand-remove large debris first.

**6. 斜坡 + 光滑材质/污渍打滑 — Slope + slippery surface or slick grime**
- 现象：约 25° 斜坡且材质较滑或有污渍，可能导致打滑转圈 — On ~25° slopes with slippery surfaces or grime the robot may slip and spin.
- 话术：机器在坡度较大且较光滑的材质上行走时会短暂打滑，原地旋转是机器在尝试继续行走和清洁泳池，稍作等待会继续清洁；若持续原地打转无法继续运行，需要手动挪移脱困 — The robot may briefly slip on steeper, slicker surfaces; spinning means it is still trying to clean. If it keeps spinning, move it manually to free it.

**7. 越障脱困 — Obstacle crossing / self-recovery**
- 现象：机器卡在障碍物（如地漏）上时，可能原地转圈或反复挪移 — When caught on obstacles (e.g. drains) the robot may spin or shuffle repeatedly.
- 话术：机器在障碍物上打转是在尝试脱困，完成后会继续清洁；若持续打转无法运行，需手动挪移脱困（越障能力约 5.5cm）— Spinning on an obstacle means it is trying to free itself and will resume cleaning; if it cannot recover, move it manually (max obstacle ~5.5 cm).

**8. 单侧驱动轮卡住 — One drive track jammed**
- 现象：水系正常、灯效正常；捞出后有驱动轮报警；履带内有异物卡住 — Water and LEDs normal; drive-wheel alarm after removal; debris inside the track.
- 措施：若卡顿一侧履带转动吃力或完全无法转动，检查履带内异物（拆卸侧板方法详见说明书）。常见异物：石子、松动螺丝、滚刷金属杆脱落 — If one track is stiff or locked, check for debris inside (side-cover removal per the manual). Common items: stones, loose screws, detached roller-brush metal rods.

---

**English FAQ summary (official):**

**Check Robot Status (Leave robot in water. Do NOT take it out):** If the robot spins near slopes, smooth surfaces or drains, it is trying to free itself. Wait a moment for auto recovery. If it stays stuck, move it manually. The robot can climb obstacles up to ~5.5 cm.

**Basic Troubleshooting (Take robot out of water and power it off first):**
1. **Restart** — Power off then restart. If it moves normally, the issue was a temporary software error.
2. **Clean Filter Basket** — Take out and empty the filter basket. Rinse the inner filter and check for heavy blockage. For very dirty pools, remove big debris by hand first, then let the robot clean fine dirt; remove the inner basket if needed for better filtration.
3. **Turn Tracks Manually** — Rotate one or both tracks by hand to feel for resistance. If tracks turn smoothly and the basket is clean, put the robot back in water to test.
4. **Stiff tracks on one or both sides** — Remove the side cover and check for trapped debris (stones, loose screws, fallen roller-brush metal rods). Clean, refit and retest in water. If no debris is found, check internal parts/cover for damage — the robot needs warranty service.

Email templates: search "UltraMarine P1 - Spin in Circles" / "UltraMarine P1 - 转圈" in the template sheet.

## 附图 Screenshots (现象判断表 Symptom-judgement table)

![UltraMarine P1 spin troubleshooting 1](assets/ultramarine-p1-spin-01.jpg)
![UltraMarine P1 spin troubleshooting 2](assets/ultramarine-p1-spin-02.jpg)', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-19-x12s-side-brush-breakage-camera-shutter', '2026-09-19', 'X12S Side Brush Breakage & Weak Obstacle Avoidance (Camera Shutter)', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-19

**X12S 边刷断裂 Side brush breakage：** 补寄边刷，无需更换整机 — Send replacement side brushes; NO full-unit replacement is needed.

**X12S 避障能力弱 Weak obstacle avoidance：** X12S 配备摄像头挡板。如果用户反馈机器人无法避障或避障能力较弱，可在排障流程中增加以下检查 — The X12S ships with a camera shutter. If a customer reports the robot fails to avoid obstacles or avoids them poorly, add these checks to the troubleshooting flow:

1. 确认摄像头挡板是否处于关闭状态 — Confirm whether the camera shutter is closed.
2. 摄像头可辅助机器人进行避障，因此建议用户在清扫时打开摄像头挡板 — The camera assists obstacle avoidance, so advise users to OPEN the camera shutter while cleaning.
3. 不进行清扫时可关闭摄像头挡板 — The shutter may be closed when not cleaning.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-20-ultramarine-p1-ota-v5-39-0-paused', '2026-09-20', 'UltraMarine P1 V5.39.0 OTA Paused', 'Hoi', '
> Source: General · Hoi · 2026-09-20

**Notice 通知：** UltraMarine P1 V5.39.0 OTA 暂停，请知悉。
**The UltraMarine P1 V5.39.0 OTA rollout has been paused — please be informed.**

请勿引导用户检查/等待该版本更新；恢复推送后会有后续通知（后续已重新推送为 V5.40.0，见 9 月 22 日条目）。

Do not direct users to check for this update for now. A follow-up notice will come when the rollout resumes (it was later re-pushed as V5.40.0 — see the September 22 entry).', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-21-dtc-web-5-0-account-password-rotated', '2026-09-21', 'DTC Web 5.0 Order Lookup — Shared Credentials Rotated', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-09-21

**Notice 通知：** US/CA DTC 官网订单 Web 5.0 查询系统共享的账户密码已更新，请各位知悉。
**The shared account password for the US/CA DTC webstore order lookup system (Web 5.0) has been rotated.**

出于安全考虑，此处不展示账号密码（该新闻内容会打包进客户端）。请查看群内原消息获取新凭据，或向当值 TL / Tier 2 索取。

For security reasons the credentials are not shown here (this news content is bundled into the app). Check the original group message for the new credentials, or ask the on-duty TL / Tier 2.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-22-north-america-laws-regulations-reference', '2026-09-22', 'North America Laws & Regulations Reference', 'Alexia', '
> Source: 流程相关 · Alexia · 2026-09-22

**Reference 参考资料分享：** 现向大家普及北美相关法律法规，供大家参考，详见以下文件。
**Sharing a reference document on North America laws and regulations for everyone''s reference:**

https://ecovacs.feishu.cn/wiki/Oup9wVFAjiBFoVkpPfzcP4Zznqc', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-22-t90-max-pro-omni-spec-notes', '2026-09-22', 'T90 Max Pro Omni & T90 Max Omni — Spec Notes', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-22

**T90 Max Pro Omni & T90 Max Omni 产品要点 Product Notes**

- 3D 结构光避障，没有 AIVI 摄像头 — 3D structured-light obstacle avoidance; no AIVI camera.
- 沿边时，红外检测 — Infrared detection along edges.
- 配有 Intelligent Hosting，不是 Agent Hosting — Ships with Intelligent Hosting, NOT Agent Hosting.
- 没有 YIKO 语音功能，没有麦克风 — No YIKO voice feature and no microphone.
- 没有自动加清洁液功能 — No automatic cleaning-solution refill.
- 没有瞬时超充，只有普通快充 — No instant flash charging; standard fast charging only.
- 主刷、边刷不能抬升 — Main brush and side brush cannot lift.
- 滚筒伸出 1.5cm，滚筒抬升 15mm — Roller mop extends 1.5 cm; roller lift is 15 mm.
- 驱动轮旁没有辅轮；没有多级越障，只有单级越障 20mm — No auxiliary wheels next to the drive wheels; no multi-level obstacle crossing, single-level only at 20 mm.
- 清洁槽可替换滤网，官网建议 1-2 个月更换一次（耗材）— Replaceable filter in the cleaning tray; official recommendation is to replace it every 1–2 months (consumable).
- 基站集尘仓过滤棉有螺丝固定；集尘档位取消，Auto Empty 改为 Quiet Auto Empty，只能调整"标准"和"高频"两档集尘频率 — The station''s dust-bag filter cotton is fixed with screws; the dust-emptying level selector is removed, Auto Empty is renamed Quiet Auto Empty, and only "Standard" and "High-frequency" emptying frequencies remain.
- 地图中门槛条只能调节长度；区域清洁时，门槛条只扫不拖 — In the map, the threshold strip can only be adjusted in length; during zone cleaning the threshold strip is swept but not mopped.
- 不避让流苏地毯 — Does not avoid fringed/tassel rugs.

## 附图 Screenshots

![T90 Max Pro Omni 1](assets/t90-max-pro-omni-01.jpg)
![T90 Max Pro Omni 2](assets/t90-max-pro-omni-02.jpg)
![T90 Max Pro Omni 3](assets/t90-max-pro-omni-03.jpg)
![T90 Max Pro Omni 4](assets/t90-max-pro-omni-04.jpg)
![T90 Max Pro Omni 5](assets/t90-max-pro-omni-05.jpg)
![T90 Max Pro Omni 6](assets/t90-max-pro-omni-06.jpg)
![T90 Max Pro Omni 7](assets/t90-max-pro-omni-07.jpg)
![T90 Max Pro Omni 8](assets/t90-max-pro-omni-08.jpg)
![T90 Max Pro Omni 9](assets/t90-max-pro-omni-09.jpg)
![T90 Max Pro Omni 10](assets/t90-max-pro-omni-10.jpg)
![T90 Max Pro Omni 11](assets/t90-max-pro-omni-11.jpg)', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-22-ultramarine-p1-ota-repushed-v5-40-0', '2026-09-22', 'UltraMarine P1 OTA Re-pushed as V5.40.0', 'Hoi', '
> Source: General · Hoi · 2026-09-22

**OTA Notification OTA 通知 — UltraMarine P1**

已重新推送 100%，版本号调整为 5.40.0，内容一致。
Re-pushed at 100%, version number updated to 5.40.0. Content remains unchanged.

如用户咨询"为什么我的版本是 5.40.0 而不是 5.39.0"，属于正常情况：此前 V5.39.0 推送暂停后，恢复推送时版本号统一调整为 5.40.0，更新内容一致。

If a user asks why their version is 5.40.0 instead of 5.39.0, this is expected: after the V5.39.0 pause, the resumed rollout uses 5.40.0 with identical content.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-24-side-brush-behavior-change-t90-x12-series', '2026-09-24', 'Side Brush Behavior Change — T90 / X12 / T90S / X12S Series', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-24

**边刷状态变更通知 Side Brush Behavior Change Notice**

涉及产品 Affected products：T90 系列、X12 系列、T90S 系列、X12S 系列 (T90 / X12 / T90S / X12S series)

- **变更前 Before：** 涉及定位、回充、跨区、建图场景边刷抬升，不转动 — During positioning, dock-return, zone-crossing and mapping, the side brush lifts up and does not rotate.
- **变更后 After：** 涉及定位、回充、跨区、建图场景边刷不抬升，正常转动 — During positioning, dock-return, zone-crossing and mapping, the side brush no longer lifts and rotates normally.
- **变更原因 Reason：** 防止边刷遮挡下视传感器，机器跌落 — To prevent the side brush from blocking the downward-viewing sensors and causing the robot to fall.

**话术 Script（中文）：** 您好，这款机器对边刷转动逻辑做了优化调整：机器在回充、建图、定位、巡航、跨区运行时，边刷会正常转动。该调整不会影响机器整体清洁与各项功能正常运行，您可以放心使用。

**Script (English):** Hello, this model has an optimized side-brush rotation logic: the side brush now rotates normally during dock-return, mapping, positioning, cruising and zone-crossing. This adjustment does not affect the robot''s overall cleaning performance or any of its functions — you can use it with confidence.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-25-prime-fall-schedule-trade-in-paused', '2026-09-25', 'Prime Fall Promotion Schedule & Trade-in Pause', 'Hoi', '
> Source: General · Hoi · 2026-09-25

**Notice 通知：** 温馨提示，即将进入 PF（Prime Fall）促销，请各单位注意。
**Heads-up: the Prime Fall (PF) promotion is starting soon.**

**PF 活动节奏 / PF schedule:**
- US：9.26 - 10.14（正式期 / main period：10.3 - 10.7）
- CA：10.3 - 10.11（正式期 / main period：10.6 - 10.7）

**以旧换新暂停 / Trade-in paused:**
PF 大促和黑五期间【以旧换新】活动会暂时停掉，届时所有 Banner 拿掉，顶导底导 [Trade-in / Upgrade Program] 入口保留，点击入口会有【活动暂停】的通告。

The Trade-in program is suspended during PF and Black Friday. All banners will be removed; the Trade-in / Upgrade Program entry in the top/bottom navigation stays but shows a "promotion paused" notice.

换句话说，2026-9-26 开始，官网以旧换新暂时停运。/ In short: from September 26, 2026, the webstore trade-in program is temporarily out of service.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-25-t90s-t90-max-bundles-us-launch', '2026-09-25', 'T90S / T90 MAX Bundles — US Launch', 'Alexia', '
> Source: General · Alexia · 2026-09-25

**Notice 通知：** 美国：T90S/T90 MAX 部分 bundle 上架。
**US: new T90S / T90 MAX bundles are now live.**

1. **T90S PRO OMNI Black + Accessories**
   https://www.ecovacs.com/us/shop/deebot-robotic-vacuum-cleaner/bundle-deebot-t90s-pro-omni-black-accessories
2. **T90S PRO OMNI White + Accessories**
   https://www.ecovacs.com/us/shop/deebot-robotic-vacuum-cleaner/bundle-deebot-t90s-pro-omni-white-accessories
3. **T90 MAX Plus OMNI + Accessories**
   https://www.ecovacs.com/us/shop/deebot-robotic-vacuum-cleaner/deebot-t90-max-plus-omni-accessories', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-29-pool-robot-spinning-screw-replacement', '2026-09-29', 'Pool Robot Spinning Issue — New Self-Service Screw Replacement Solution', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-29

【市场问题处理】泳池机器人转圈故障新增自主更换螺丝解决方案
【FAQ 更新】为什么机器人会转圈？

**Market Issue Handling:** A new self-service screw replacement solution has been added for the pool robot spinning issue, and the FAQ has been updated accordingly.

各位好：泳池机器人转圈故障现象新增"自主更换螺丝"解决方案，FAQ 已同步更新。表格中已添加对应 FAQ 视频链接，包含能否自主更换螺丝的判断方法及具体更换步骤，可点击链接进入查看。

The corresponding FAQ video links have been added to the sheet, including how to determine whether the screws can be replaced by yourself and the detailed replacement steps:

- FAQ sheet: https://ecovacs.feishu.cn/sheets/WCJ0sqcb1hx1nStogZocKYnznHc

**相关邮件模板更新 Related email template update：** "UltraMarine P1 - Spin in Circles" 邮件模板已同步更新（搜索 "UltraMarine P1 - Spin in Circles" 或 "UltraMarine P1 - 转圈"）。

请大家知悉，如有疑问随时沟通。Please be informed. Feel free to reach out if you have any questions.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-29-ultramarine-p1-spin-in-circles-email-template-update', '2026-09-29', 'UltraMarine P1 Spin-in-Circles Email Template Updated', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-29

**Notice 通知：** UltraMarine P1「原地转圈」问题的邮件模板已更新。
**The email template for the UltraMarine P1 "spin in circles" issue has been updated.**

请使用最新模板回复相关咨询；转圈故障的处理方案详见同日 FAQ 更新（新增自主更换螺丝方案）。

Use the latest template for related inquiries. For handling details see the same-day FAQ update (new self-service screw replacement solution).', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-29-us-site-prime-fall-early-bird-live', '2026-09-29', 'US Site — Prime Fall Early-Bird Live', 'Hoi', '
> Source: General · Hoi · 2026-09-29

**Notice 通知：** US 官网 PF 大促早鸟活动已上架，请各位知悉。
**US webstore: the Prime Fall early-bird promotion is now live.**

- 时间 / Period: 9/26 - 10/2
- 落地页 / Landing page: https://www.ecovacs.com/us/shop/promotion', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-09-30-t50s-series-script-update-aivi-3d-label', '2026-09-30', 'T50S Series Script Update — AIVI 3D 3.0 Label Mismatch', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-09-30

**Issue 问题：** T50S OMNI 机身印着 AIVI 3D 3.0 与实际功能不符。
**Question:** The T50S OMNI body is printed with "AIVI 3D 3.0", which does not match its actual functions.

**Script 话术：**

T50 OMNI 和 T50S OMNI 都是非常棒的产品。在避障方面，T50 OMNI 使用 Structured Light 结构光 + 红外 AI 技术，T50S OMNI 则在 T50 OMNI 的基础之上进行了软件方面的升级。两款产品都具有很好的避障效果。

另外，T50S OMNI 是 26 年新款，升级了更大的 2.5WPa 吸力；且防缠技术也从 2.0 升级到了 3.0。如果您追求新款 + 更强大的吸力 + 更好的防缠效果，那么 T50S OMNI 是您更好的选择；如果您优先考虑价格，且仅需满足日常清洁，那么 T50 OMNI 是完全没有问题的。

**English Script:**

The T50 OMNI and T50S OMNI are both excellent products. For obstacle avoidance, the T50 OMNI uses Structured Light + Infrared AI technology. The T50S OMNI features software upgrades based on the T50 OMNI platform. Both models deliver reliable obstacle avoidance performance.

In addition, the T50S OMNI is our new 2026 model. It boasts upgraded suction power of up to 2.5 kPa, and its anti-tangle technology has been upgraded from version 2.0 to 3.0.

If you are looking for the latest model with stronger suction and superior anti-tangle performance, the T50S OMNI is the better choice. If price is your top priority and you only need it for routine cleaning, the T50 OMNI will serve you perfectly well.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-01-qa-case-info-entry-requirements', '2026-10-01', 'QA Standard — Case Info Entry Requirements', 'Hoi', '
> Source: General · Hoi · 2026-10-01

**Notice 通知：** 请大家注意质检标准中对系统内 case 信息录入的要求。
**Please note the QA standard requirements for entering case information in the system.**

详细标准见 Wiki 文档 / Full standard in the Wiki document:

https://ecovacs.feishu.cn/wiki/KNSjwpG2hilJZQk59r1cH5nenJd', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-06-canada-besender-discontinued-inventory-source', '2026-10-06', 'Canada Inventory — BESENDER No Longer Used', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-06

**Process 流程变更：** 加拿大不跟 BESENDER 合作了，加拿大的库存不看 BESENDER 系统了。

**Canada has ended its partnership with BESENDER — do not use the BESENDER system for Canadian inventory.**

可以先看 SF（Shopify/官方系统）的库存，或参考以下表格（周度更新）：
Check SF first, or refer to the sheet below (updated weekly):

https://lmgx8md8u1.feishu.cn/sheets/N11bsJjd3hdHYktGuP5cHoepned?sheet=0LoYQB', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-06-x12s-low-price-order-cancellation-inquiries', '2026-10-06', 'X12S Low-Price Order Cancellation Inquiries', 'Alexia', '
> Source: 流程相关 · Alexia · 2026-10-06

**Process 处理指引：** X12S 低价订单被取消相关咨询（产品金额约为 $200）。
**Handling inquiries about X12S low-price order cancellations (~$200).**

1. 如用户咨询 X12S 低价订单被取消：请先建议用户联系亚马逊（原卖家）。该价格由亚马逊平台设定，建议优先联系亚马逊团队沟通处理。/ Advise the user to contact Amazon (the original seller) first — the price was set by the Amazon platform.
2. 如亚马逊团队未能协助解决，用户可再联系我们，我方协同处理。/ If Amazon cannot resolve it, the user can come back to us and we will assist.

如遇到类似工单，请及时上报给 T2 / TL 统一跟进处理。/ Report similar tickets to T2 / TL for unified follow-up.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-07-pf-promo-ccrb5-ccace10-coupon-handling', '2026-10-07', 'PF Promo — CCRB5 / CCACE10 Coupon Handling', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-07

**Process 处理指引：** 如果用户在 Prime Fall / PF 促销期间（10.03 - 10.07）因为 CCRB5 / CCACE10 无法使用而不满：

**If users cannot use CCRB5 / CCACE10 coupons during the Prime Fall promotion (Oct 3 - Oct 7):**

- 请联系 Tier 2 / Team Lead 获取券码，一客一码。/ Contact Tier 2 / Team Lead for a coupon code — one code per customer.
- 用户不满的，请酌情升级到 DTC。/ Escalate to DTC as appropriate if the user remains dissatisfied.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-07-x12s-omnicyclone-amazon-restocked', '2026-10-07', 'X12S OmniCyclone Restocked on Amazon.com', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-07

**Notice 通知：** Amazon.com 上的 X12S OMNICYCLONE 已补货。
**X12S OMNICYCLONE is back in stock on Amazon.com.**

如果遇到因为之前美国亚马逊 ~200 美刀低价订单被取消的用户，请将 case 交给 Tier 2 / Team Lead 处理。

If you encounter users whose earlier ~$200 low-price orders were cancelled, hand the case to Tier 2 / Team Lead.

https://www.amazon.com/ECOVACS-DEEBOT-X12S-OMNICYCLONE-Vacuum/dp/B0H9XTFY99', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-08-t90-pro-omni-fba-preorder-handling', '2026-10-08', 'T90 PRO OMNI FBA Preorder Handling', 'Hoi', '
> Source: General · Hoi · 2026-10-08

**Notice 通知：** T90 PRO OMNI FBA（Fulfilled By Amazon）目前都是预售状态，大概预售数量 1500 台左右；亚马逊前台显示会在 10 月 18 号送达给消费者，快的话应该不会等那么久。

**T90 PRO OMNI FBA units are currently pre-order only — roughly 1,500 units.** Amazon''s storefront shows delivery to customers by October 18; in practice most should arrive sooner.

如果这期间有消费者来咨询，我们就正常解释，因为他们在下单的时候是知道大概什么时候会收到货的。

If customers ask during this period, explain as usual — they knew the estimated delivery window when ordering.

如果有特别着急的客户，我们可以对应送一些耗材（以库存情况为准）。/ For especially anxious customers, we may offer some consumables as a goodwill gesture (subject to stock availability).

生效时间 / Effective: Oct 7, 2026, until further notice.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-08-warranty-exchange-no-ship-remote-areas-update', '2026-10-08', 'Warranty Exchange WO — No-Ship Remote Areas Update', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-08

**Notice 通知：**【Warranty Exchange WO】不发货偏远地区，新增：
**Warranty Exchange WO — remote areas we do not ship to, new addition:**

- Iqaluit, Nunavut, Canada

请各位知悉。/ Please be informed.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-09-claims-high-risk-ticket-handling', '2026-10-09', 'Claims / High-Risk Tickets — Mandatory Handling Rules', 'Alexia', '
> Source: 流程相关 · Alexia · 2026-10-09

**Policy 政策要求：** 索赔类高风险工单须知。
**Handling rules for claims-related high-risk tickets.**

- 凡涉及索赔倾向的案件（如人身伤害、财产损失等），回复前必须与 T2 / TL 确认，严禁以甲方立场轻易承认错误或答应赔偿。/ Any case with claim potential (personal injury, property damage, etc.) MUST be confirmed with T2 / TL before replying. Never admit fault or promise compensation on the client''s behalf.
- 若不确定案件是否属于高风险，请直接定位为高风险工单，先与 T2 / TL 确认后再回复。/ If unsure whether a case is high-risk, treat it as high-risk and confirm with T2 / TL before responding.
- 如因擅自许诺造成甲方财产损失，甲方有权向项目乃至 VXI 索赔，届时将直接影响团队结算及个人绩效。/ Unauthorized promises that cause the client financial loss may trigger claims against the project or even VXI, directly impacting team settlement and individual performance.
- 请严格执行：遇到此类案件，第一时间上报 T2 / TL，不得自行回复或表态。/ Strictly comply: report to T2 / TL immediately — do not reply or commit on your own.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-09-new-instruction-manuals-and-faq-uploads', '2026-10-09', 'New Instruction Manuals & FAQ Uploads', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-10-09

**Notice 通知：** 以下说明书 & FAQ 已上传，请取用。
**The following instruction manuals & FAQ files have been uploaded — please grab them from the shared drive.**

- **W2S PRO / W2S PRO OMNI**
  K:\Guangzhou\Ecovacs\Agent\Ecovacs NA\产品资料\说明书\窗宝说明书\W2S PRO
- **T90S Family**
  K:\Guangzhou\Ecovacs\Agent\Ecovacs NA\产品资料\说明书\地宝说明书\T90S Family Instruction Manual.pdf
  K:\Guangzhou\Ecovacs\Agent\Ecovacs NA\产品资料\FAQ\DEEBOT\EN 莎士比亚S FAQ 2.0 T90S.xlsx
- **T90 Max Family**
  K:\Guangzhou\Ecovacs\Agent\Ecovacs NA\产品资料\说明书\地宝说明书\T90Max PRO_Instruction Manual.pdf
  K:\Guangzhou\Ecovacs\Agent\Ecovacs NA\产品资料\说明书\地宝说明书\T90Max_Instruction Manual.pdf
- **X12S**
  K:\Guangzhou\Ecovacs\Agent\Ecovacs NA\产品资料\FAQ\DEEBOT\普朗克S PLUS（X12S Series）FAQ2.0.xlsx', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-10-ca-besender-discontinued-inventory-via-sf', '2026-10-10', 'CA No Longer on BESENDER — Check Inventory via SF / CA Sheet', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-10

加拿大不跟 BESENDER 合作了，**加拿大的库存不看 BESENDER 系统**了，可以先看 SF 的。/ Canada has ended the BESENDER partnership — **CA inventory is no longer managed in the BESENDER system**; check Salesforce first.

如果**发配件**过程中选择了 **AMR CA Parts**，但有 pricebook 相关报错的，请及时上报。/ When **ordering parts**, if you selected **AMR CA Parts** but hit a pricebook-related error, report it promptly.

**Update 2026-10-20：** BESENDER 已不处理加拿大业务，库存请看 CA 库存表单（已更新 2026-10-19）：https://lmgx8md8u1.feishu.cn/sheets/N11bsJjd3hdHYktGuP5cHoepned?sheet=0LoYQB / BESENDER no longer handles CA business — use the CA inventory sheet (updated 2026-10-19) for stock checks.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-10-email-issue-type-entry-scoring-rule-change', '2026-10-10', 'Email Issue Type — Entry & QA Scoring Rule Change', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-10

**Policy 政策通知：** Email 渠道 issue type 录入规则和对应质检评分规则调整通知。

**Background 背景：** AI Summary 推荐 issue type（英文）功能上线。/ AI Summary now recommends the issue type (English channel).

**Timeline 时间安排：** 过渡时间 10.09 - 10.15；评分正式开始时间 10.16。/ Transition Sep 29 - Oct 15 window is Oct 9-15; QA scoring officially starts October 16.

**1. 录入和评分逻辑 / Entry & scoring logic**

- 录入规则：Email 渠道 case，CC 可参考 AI Summary 推荐的 issue type 直接录入系统。/ Entry rule: for Email cases, CCs may enter the issue type suggested by AI Summary.
- 注意事项：随着和客户沟通交互的信息更清晰明朗，AI Summary 推荐的 issue type 会根据客户最新描述发生变化，请 CC 按照 AI Summary 最新推荐录入/修改。/ The recommendation updates as the conversation clarifies — always follow the LATEST AI Summary suggestion.
- 评分逻辑：质检抽检时案例状态是 Closed，理论上 AI Summary 推荐的结果不会再更新。整体评分逻辑：对标系统中 CC 录入的 issue type 和 AI Summary 最后一次推荐的内容是否一致——若一致，视为正确；若不一致，视为录入有误。/ Scoring: when QA samples a Closed case, the CC-entered issue type is compared with the LAST AI Summary recommendation — match = correct, mismatch = entry error.

**2. 适用范围 / Scope**

- 目前 AI Summary 的 issue type 推荐功能仅 Email 渠道 case 适用；Chat 和 Call 渠道的人工录入评分规则不变。/ The AI Summary recommendation applies to Email cases only; Chat and Call scoring rules are unchanged.
- 目前暂无此功能的语种地区（如日韩），人工录入的评分规则不变，待功能上线后再进行调整。/ Regions without the feature (e.g. JP/KR) keep the manual-entry scoring rules until it launches.

**3. 特殊情况 / Edge cases**

- 若 AI Summary 因任何原因没有生成，还是按原来人工录入的评分规则。/ If AI Summary produced no recommendation, the original manual-entry scoring rules apply.
- 若 CC 提及案例处理时能看到 AI Summary 推荐的 issue type，案例关闭后看不到：质检按 AI Summary 报表的历史记录进行追溯——若无记录，参考原来人工录入的评分规则；若有记录且 CC 录入与历史记录推荐一致，算正确；不一致，算录入有误。/ If the recommendation was visible during handling but not after closure, QA traces the AI Summary report history: no record → manual rules; record matches entry → correct; record differs → entry error.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-13-t90-t90s-water-tank-dry-mopping-no-water-decrease', '2026-10-13', 'T90 & T90S Water Tank Version — DEEBOT Mops Dry, Clean Water Tank Water Level Does Not Decrease', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-10-13

**问题背景：** T90/T90S 系列的清水箱有部分发现初期不良，如遇到地宝干拖地、清水箱水量不减少的情况，可先轻检查后安排补寄。/ Background: A portion of the clean water tanks in the T90/T90S series may have early-stage defects. If the robot mops dry (no water output) and the clean water tank water level does not decrease, inspect the following first, then arrange a replacement if needed.

**处理步骤 / Troubleshooting Steps：**

1. 取出清水箱，清除清水箱与基站之间的异物，确保清水箱平整放置在基站上。/ Remove the clean water tank, clear any foreign objects between the tank and the dock, and make sure the tank is seated flat on the dock.
2. 取出清水箱，检查基站密封塞，将其放平后用力按压，然后将清水箱放回。/ Remove the clean water tank, check the dock''s sealing plug, press it down firmly until it is flat, then place the tank back in position.
3. 打开清水箱，取下过滤件，拔掉其连接的水管，使用清洁刷清理过滤件。/ Open the clean water tank, take out the filter, disconnect its water hose, and clean the filter with the cleaning brush.
4. 清理完成后，将水管重新插好，把过滤件放回原位，最后将清水箱放回基站。/ After cleaning, reconnect the water hose, put the filter back in place, and finally return the clean water tank to the dock.
5. 将机器人放入基站充电，打开 APP 点击 "基站" → "洗抹布"，观察洗抹布结束后抹布是否有被浸湿。/ Place the robot on the station, open the app, tap "Station" → "Wash Mop", and check whether the mop becomes wet after the wash cycle finishes.
6. 若完成以上操作后清水箱仍不出水，可登记补发清水箱。/ If the clean water tank still outputs no water after completing the above steps, register for a replacement clean water tank.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-14-dtc-coupon-codes-ccrb5-ccace10-update', '2026-10-14', 'DTC Website Coupon Codes Update — CCRB5 / CCACE10 (CA)', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-14

【DTC 官网优惠券使用更新】（2026-10-13）/ [DTC website coupon usage update] (2026-10-13)

- **CA DTC 官网：** CCRB5 和 CCACE10 两个 code 均已开启，当前有效期**暂定至 11 月 12 日**，并将在**黑五活动开始前结束**。黑五期间：继续采用**一人一码**的形式。/ On the CA DTC site, both CCRB5 and CCACE10 are now active, valid **tentatively until Nov 12**, and will **end before Black Friday starts**. During Black Friday: the **one-code-per-person** format continues.
- **US DTC 官网：** 待 US PF 活动结束后，再调整 US DTC 官网客服端 code 的有效期。/ On the US DTC site, the support-side code validity will be adjusted only after the US PF campaign ends.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-15-call-transfer-case-owner-rule', '2026-10-15', 'Call Transfer Rule — Reassign Case Owner to the Answering Agent', 'Alexia', '
> Source: 流程相关 · Alexia · 2026-10-15

**转电话须知：** 转接电话给 Premium Agent 时，请务必把该电话工单的 **Case Owner 改为实际接听电话的 Agent**，确保工单归属清晰、责任明确。请各位知悉并严格执行。/ When transferring a call to a Premium Agent, always change the ticket''s **Case Owner to the agent who actually took the call**, so ownership and responsibility stay clear. Please acknowledge and follow strictly.

**补充（Hoi，同日）：** 任何类型的转 call 都是这个原则——如果接到法语 call 需要转给对应同事，也请把 case owner 转为对应的接线 agent。/ Follow-up (Hoi, same day): this principle applies to every kind of call transfer — e.g. French calls transferred to the designated colleague also require reassigning the case owner to the answering agent.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-15-faq-update-t90-t90s-t90-80-max-x12-x12s', '2026-10-15', 'FAQ Update — DEEBOT T90, T90S, T90 (80) MAX, X12, X12S Series FAQs Updated', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-10-15

【FAQ 刷新】地宝 T90、T90S、T90 (80) MAX、X12、X12S 系列 FAQ 已更新。/ The FAQs for the DEEBOT T90, T90S, T90 (80) MAX, X12 and X12S series have been updated.

**逻辑变更 / Logic Change：** 地宝回到基站后，注水口与基站自然对接；机器下方排污口被基站顶杆打开。机器进行洗抹布 & 排水工作时，气体从注水口进入污水盒，盒内污水随之排出。手动按压机器底部排污口时，因无气体推动，不会有污水流出。/ After the DEEBOT returns to the docking station, the water inlet connects naturally with the station, and the drain port at the bottom of the robot is pushed open by the station''s push rod. During mop-washing & draining, air enters through the water inlet and the wastewater inside the dirty-water tank is expelled along with it. If the drain port is pressed manually, no wastewater flows out because there is no air pressure pushing it.

**更新问题 / Updated topics：**

- **污水盒异常 / Dirty Water Box Abnormal** — 若机器人频繁回基站，建议先关机并翻转机器，然后：
  1. 按压主机底部排污口，查看是否卡滞或被异物堵塞。若有异物，请清理。正常状态下按压会出水。/ Press the drain port on the bottom of the robot to check for sticking or blockage; clean any foreign objects. Normally water flows out when pressed.
  2. 同时按压基站左右两侧充电簧片 1–2s 后松开，观察基站排污顶杆。正常状态下顶杆会正常起落。/ Press both charging reeds on the left/right of the station for 1–2s, release, and observe the station''s drain push rod. Normally the rod rises and falls properly.

- **机器频繁回基站洗抹布 / Frequent Returns to the Station to Wash the Mop** — 若机器工作几分钟后即回基站洗抹布：
  1. 取下主机正面上盖，将电源开关拨至 "O" 关机，将主机翻转，底部朝上放置。/ Remove the front top cover, switch the power to "O", and flip the robot bottom-up.
  2. 按压主机底部排污口，查看是否卡滞或被异物堵塞。若有异物，请清理。/ Press the bottom drain port to check for sticking or blockage; clean if needed.
  3. 同时按压基站左右两侧充电簧片 1–2s 后松开，观察基站排污顶杆是否正常起落。/ Press both charging reeds for 1–2s, release, and observe the drain push rod.
  4. 检查 APP 中是否开启了 AI 污渍识别，请关闭后重试。/ Check whether AI Stain Recognition is on in the app; turn it off and retry.
  5. 检查 APP 中 "瞬时超充" 是否设置为 "自适应" 模式，若有，请改为 "标准" 模式。/ Check whether "Instant Supercharge" is set to "Adaptive"; if so, switch to "Standard".', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-15-us-ca-trade-in-relaunch-coupon-codes-restored', '2026-10-15', 'US & CA Trade-In Back Online, Coupon Codes Restored', 'Hoi', '
> Source: General · Hoi · 2026-10-15

US 和 CA 官网**以旧换新**均已重新上线，另外之前的 **Coupon Code** 也都恢复使用（2026-10-15）。/ The **trade-in** programs on both the US and CA official websites are back online, and the previous **coupon codes** have been restored as well (2026-10-15).', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-16-pin-reset-verification-requirements', '2026-10-16', 'PIN Reset — Verification Requirements', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-16

客户申请 **PIN 重置**时，至少核验下面组合之一：/ For a **PIN reset** request, verify at least ONE of the following:

1. **机器序列号（SN）+ 购机凭证**（收据 / 订单、发票）；/ **Machine serial number (SN) + proof of purchase** (receipt / order, invoice);
2. **注册账号匹配**——客户之前在品牌 APP 注册绑定该机器；/ **Registered account match** — the customer previously registered and bound the machine in the brand app;
3. **设备绑定的邮箱 / 手机号接收一次性验证码**。/ **One-time verification code** sent to the email / phone bound to the device.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-16-video-too-large-email-cloud-drive-script', '2026-10-16', 'Video Too Large for Email Attachment — Cloud-Drive Link Script', 'Alexia', '
> Source: 流程相关 · Alexia · 2026-10-16

若用户反馈**视频过大**、**无法作为邮件附件**发送，可参考以下话术，引导用户通过**云盘链接**分享视频/图片。/ If the customer reports a **video too large** to attach to an email, use the script below to guide them to share the video/images via a **cloud-drive link**.

> If the video file is too large to attach to an email, you may upload it to Google Drive, iCloud, or Dropbox and share the link with us. This will allow our team to review the video and provide you with more accurate assistance.

![Cloud drive share script](assets/2026-10-16-cloud-drive-video-share.jpg)', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-17-black-friday-2026-prep-and-official-period', '2026-10-17', 'Black Friday 2026 — Preparation & Official Period', 'Hoi', '
> Source: General · Hoi · 2026-10-17

预计本年度**黑五促销**在 11.19 进入正式期，请大家积极准备。/ This year''s **Black Friday promotion** is expected to enter its official period on Nov 19 — please prepare actively.

**Update 2026-10-22（已确定 / confirmed）：** 黑五正式期时间为 **11/19 – 11/30**，其中 **11/26 – 11/30** 为官方正日子。/ The official Black Friday period runs **Nov 19 – Nov 30**, with **Nov 26 – Nov 30** being the official core days.

有任何需要支持的部分或需求（包括但不限于产品知识 / 售前应对技巧 / 价保流程与规范 / 旗舰产品排障等），欢迎 DM Hoi，或在话题中留言。/ For any support needs (including but not limited to product knowledge, pre-sales techniques, price-match processes and policies, flagship troubleshooting), DM Hoi or leave a message in the thread.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-17-t90-series-clean-water-tank-replacement-parts', '2026-10-17', 'T90 Series Clean Water Tank Not Dispensing — Apply New Clean Water Tank After Standard Troubleshooting', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-10-17

T90 系列清水箱不出水问题——常规排障后，如问题依旧，请申请新清水箱（2026-10-16 起）。/ T90 series clean water tank not dispensing water — after standard troubleshooting, if the issue persists, apply for a new clean water tank (from 2026-10-16).

**Part numbers 配件号：**

- **T90：**
  - 201-L001-0091 黑 / Black
  - 201-L001-0090 白 / White
- **T90S：**
  - 201-L006-0199 白 / White', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-17-us-window-bot-beta-tester-recruitment', '2026-10-17', 'US Window Bot New Product — Beta Tester Recruitment Survey', 'Hoi', '
> Source: General · Hoi · 2026-10-17

近期将针对美国部分型号的地宝用户，推送测试用户招募问卷，招募试用**窗宝新产品**。/ A tester-recruitment survey will be pushed to US DEEBOT users of selected models, recruiting testers for the new **WINBOT product**.

- **投放时间（上线–下线）/ Push window:** 北京时间（GMT+8）2026/10/17 10:00 – 2026/10/24 23:59
- **美国问卷 / US survey:** https://v.wjx.cn/vm/YJIlunJ.aspx#
- **入选通知方式 / Selection notice:** 邮件沟通 / via email
- **筛选完成时间 / Screening completes:** 2026/10/28', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-20-other-region-service-inquiry-script', '2026-10-20', 'Other-Region Service Inquiry — Response Script', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-20

【其他区域咨询话术优化】HQ 指定 — Other Region Service Inquiry / 其他区域咨询话术。/ [Other-region inquiry script update] HQ-specified response for customers contacting us from outside US/CA.

> Thank you for reaching out to ECOVACS.
>
> Please note that this team provides product and warranty support for **the United States and Canada only**. If you are located in another region, we are unable to assist with your inquiry through this support line — but we want to make sure you get help from the right team quickly.
>
> Please contact your local ECOVACS support team here:
>
> **[插入所在地区支持入口/链接 / insert the region''s support entry/link]**
>
> Once your regional team has your details, they can assist with your product and warranty questions directly.
>
> We appreciate your understanding and thank you for choosing ECOVACS.

![Other region inquiry script](assets/2026-10-20-other-region-inquiry-script.jpg)', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-20-qa-details-voice-and-email', '2026-10-20', 'QA Details — Voice/Softphone Calls & Email Entries', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-20

请大家注意以下质检细节 / Please note the following QA details:

**Voice/Softphone 通话中 / On calls：**

1. 通话过程中的礼节问题，尤其是称呼用户名字 **2 次**。/ Courtesy during the call — address the customer **by name twice**.
2. 通话结束时确保**结束语完整**，并主动询问客户是否还需要其他服务或帮助。/ Ensure a **complete closing** and proactively ask whether the customer needs anything else.
3. 如需让客户 Hold，返回后务必先**感谢客户等待**，例如 "Thank you for waiting."。/ After placing a customer on hold, always **thank them for waiting** when you return.
4. **Hold 超过两分钟**时，需要及时回应客户，让客户知道我们仍在处理中，避免长时间无回应。/ If a hold exceeds **two minutes**, check back in so the customer knows we are still working on it.

**Email 沟通中 / In emails：**

- **Issue type** 录入：如果 AI Summary 有推荐，请按照推荐项进行填写或修改。/ Issue type entry: follow the AI Summary recommendation when one is available.
- **机器型号 / AMR Model No.**：如果用户在邮件正文或标题中有提及，甚至通过 Web Form 提交表单时填入了 SN 并可 Search SN 验证到型号，请及时规范填写。/ Machine model: fill it in promptly and correctly if mentioned in the email body/subject, or when an SN was submitted via Web Form and the model can be verified by searching the SN.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-21-amazon-ca-orders-verifiable-in-salesforce', '2026-10-21', 'Amazon CA Orders (ECOVACS ROBOTICS 3P Seller) Verifiable in Salesforce', 'Hoi', '
> Source: General · Hoi · 2026-10-21

Amazon Canada 中由 **ECOVACS ROBOTICS**（即 Amazon 3P Seller）出售的订单，可以在 Salesforce 系统中进行直接验证：通过 **Search** 功能搜索跳转，可以看到订单中购买的具体商品详情和购买日期（2026-10-21）。/ Orders on Amazon Canada sold by **ECOVACS ROBOTICS** (AKA, Amazon 3P Seller) can be verified directly in Salesforce: use the **Search** function to find and jump to the order, where the purchased product details and order date are visible (2026-10-21).

**建议关注字段 / Key fields to check：**

- Customer Order No.
- Customer Order Date
- Order Product > Product Name

![Salesforce search](assets/2026-10-21-amazon-ca-sf-verify-1.jpg)

![Order product details](assets/2026-10-21-amazon-ca-sf-verify-2.jpg)

![Order date](assets/2026-10-21-amazon-ca-sf-verify-3.jpg)', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-21-deebot-error-codes-sheet', '2026-10-21', 'New DEEBOT Error Code Reference Sheet', 'Hoi', '
> Source: 知识点分享群 · Hoi · 2026-10-21

新增【地宝错误代码】查询表，大家按需食用。/ A new DEEBOT error code reference sheet has been added — use as needed.

- Feishu sheet: https://lmgx8md8u1.feishu.cn/sheets/SiedsZWcThDIAGtUov8cLDP7nVd?sheet=3n8KN8

![DEEBOT error code sheet](assets/2026-10-21-deebot-error-codes-sheet.jpg)', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-21-qa-standard-refill-drain-module-issue-types', '2026-10-21', 'QA Standard Sync — Refill/Drain Module Issue Types Not Applicable in NA', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-21

质检标准同步（2026-10-20）：目前北美机器**不支持上下水模组**。/ QA standard sync (2026-10-20): North American machines **do not support the automatic water refill/drain module**.

如果 issue type 里带有 **Automatic water refill and drain module**、**Refill/Drain Module**、**water recycle module** 这类，都是针对上下水模组的专用问题——故障、使用问题、使用体验类，一般情况下北美都不适用。不管前半部分描述跟问题多贴切，都请"**避雷**"。/ Issue types containing **Automatic water refill and drain module**, **Refill/Drain Module**, **water recycle module**, etc., are dedicated to the refill/drain module — faults, usage issues, and experience complaints generally do not apply in NA. No matter how well the first half of the description matches, **avoid these**.

**补充 / Exception：** 客户问"能不能用"的咨询类情景，情景合适可以选 **Aftersale-Service inquiry: Refill/Drain Module application confirmation**。/ For "can I use it" inquiries where the context fits, select Aftersale-Service inquiry: Refill/Drain Module application confirmation.

![Refill drain module examples 1](assets/2026-10-21-refill-drain-module-qa-1.jpg)

![Refill drain module examples 2](assets/2026-10-21-refill-drain-module-qa-2.jpg)

![Refill drain module examples 3](assets/2026-10-21-refill-drain-module-qa-3.jpg)', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-22-call-transfer-process-and-rules', '2026-10-22', 'Call Transfer (转 Call) — Process & Rules', 'Hoi', '
> Source: 流程相关 · Hoi · 2026-10-22

**一、特定型号/语种电话转接流程 / Transfers for specific models or languages**

- **严禁随意转接**：转出前必须向 **T2/TL 核实**，确保有对应型号/语种且处于 **Available** 状态的 Agent 接听。未经确认，切勿转出。/ Never transfer casually: confirm with **T2/TL** first that an agent for the model/language is **Available**. Do not transfer without confirmation.

**转接红线（公平性与风险管控）/ Red lines (fairness & risk control)：**

1. **不甩锅**：通话超 4 分钟勿转。AHT 考核标准为 6.5 分钟，超过半数再转接会拉高接手人的电话时长，造成绩效不公。/ No blame-shifting: do not transfer calls that have run over 4 minutes. The AHT standard is 6.5 minutes — transferring past the midpoint inflates the receiving agent''s call time and is unfair.
2. **高风险介入**：遇高风险或用户情绪激动，**立即联系 T2/TL**。**无 T2/TL 审批切勿自行约回电**。/ High-risk involvement: for high-risk tickets or escalated customers, contact T2/TL immediately. Never schedule callbacks on your own without T2/TL approval.

**⚠️ 高风险性质工单包括但不限于 / High-risk tickets include but are not limited to：**

- **人身伤害 / Personal injury:** 机器砸人、碾脚等 / robot falling on or running over a person
- **财产损失 / Property damage:** 泡坏/砸坏地板、家具等 / water-damaged or smashed floors, furniture
- **产品安全 / Product safety:** 过热、冒烟等 / overheating, smoke
- **公关与法律风险 / PR & legal risk:** 媒体曝光、法律诉讼、消协投诉威胁 / media exposure, lawsuits, consumer-protection complaints

**拿不准的，一律按高风险处理，直接问 T2/TL！** / When in doubt, treat it as high-risk and ask T2/TL directly.

**二、普通电话转接流程 / Regular call transfer**

- **场景 / Scenario:** 用户**多次**指明某一 Agent 接听电话。/ The user repeatedly insists on a specific agent.
- **动作 / Action:** 当前 Agent 需先**礼貌婉拒一次**，并明确表达乐意协助、主动承接。/ The current agent first politely declines once, expressing willingness to help.
- **参考话术 / Suggested script:** "I understand you''d prefer to speak with the dedicated agent, unfortunately they are currently unavailable. I''m more than happy to assist in any way possible."
- **转接条件 / Transfer condition:** 若用户**两次及以上**明确坚持只与该特定 Agent 沟通，请先确认该 Agent 的现场状态，**必须经得该 Agent 本人同意**后，方可转交电话。/ If the user insists twice or more, check the agent''s availability; the transfer may only proceed **with that agent''s explicit consent**.', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;
INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES ('2026-10-22-ecovacs-home-app-v3-17-0-release', '2026-10-22', 'ECOVACS HOME App V3.17.0 Released', 'Hoi', '
> Source: General · Hoi · 2026-10-22

【ECOVACS HOME APP 新版本通知】最新版本 **V3.17.0** 已发布，具体细节可参考文档（文档内部仅供内部参考）。/ The latest version **V3.17.0** of the ECOVACS HOME app has been released; details are in the internal doc (internal reference only).

- Doc: https://ecovacs.feishu.cn/wiki/I5cMwl5E3isJlikSLQKcy4y0n6e?from=from_copylink', 1792964029417)
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;

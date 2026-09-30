# Firmware Updates — GOAT Series

> Source: Ecovacs NA 查询宝典 · Firmware Updates sheet · pulled 2026-09-30

Firmware OTA history for ECOVACS GOAT robot mowers (A / O series, RTK & LiDAR variants). 固件 OTA 推送记录（割草机 GOAT 系列）。如有用户反馈相关故障，请先引导确认固件已更新至最新版本 — When users report related faults, first guide them to confirm the firmware is up to date.

## GOAT A / GOAT O (RTK)

### 2025/03/25 · GOAT A / GOAT O · 1.7.74

A2500 RTK 升级至版本 1.7.74 — A2500 RTK upgraded to 1.7.74:
- 性能优化 — Performance:
  1. AI 模型增强，无草区域识别能力提升 — AI model enhanced; better no-grass-area recognition.
  2. 改进切割效果（含切割逻辑与路径通过能力）— Improved cutting (cutting logic and path traversability).
  3. 提升系统稳定性 — System stability.
  4. 提升 RTK 信号稳定性 — RTK signal stability.

A3000 LiDAR 升级至 1.7.74 — A3000 LiDAR upgraded to 1.7.74:
- 性能优化 — Performance: AI 模型增强；改进切割效果；系统稳定性提升 — AI model enhanced; improved cutting; system stability.

O1000 RTK 升级至 1.7.74 — O1000 RTK upgraded to 1.7.74:
- 性能优化 — Performance: AI 模型增强，无草区域识别能力提升；改进切割效果；系统稳定性；RTK 信号稳定性 — same as A2500 RTK list above.

> 注意 Note: 原定于 3 月底为全系列 A&O 产品上线的新功能"局部地图修改"延期至四月实施；"区域割草顺序优化"功能按计划 OTA 推送 — The "partial map modification" feature originally scheduled for end of March is delayed to April; the "zone mowing sequence optimization" ships on schedule.
>
> - New function "Modification on partial map" 该功能支持用户对地图进行局部编辑：可删除指定区域后，仅对该区域进行重新建图，而无需对整个地图进行完整建图 — Users can edit the map locally: delete a specified area and re-map only that area instead of the whole map.
> - Optimization of the zone mowing sequences under Auto mowing mode 原版本采用智能算法规划多区域工作顺序，可能在复杂场景中出现非连续区域工作的情况；本次优化调整为线性顺序模式：系统严格按区域 1→区域 2→区域 3……的顺序依次完成所有分区修剪任务 — Previously an intelligent algorithm could work zones non-sequentially; now a linear order mode strictly mows zone 1 → zone 2 → zone 3 in order.

### 2025/04 · GOAT A / GOAT O · 1.7.80

- 性能优化 — Performance:
  1. 改善预约功能 — Improved scheduling.
  2. 提升回充逻辑 — Better return-to-dock logic.
  3. 优化 APP 通知 — Optimized App notifications.

适用型号 / Applies to：A1600 RTK / A2500 RTK / A3000 LiDAR / O800 RTK / O1000 RTK / O1200 RTK.

### 2025/05/14 · GOAT A · 1.9.21

已面向安装 4G 模块用户及部分其他用户推送，更新了 4G 模块设置界面，新增 APN 设置入口（需添加 APN 后方可正常使用 4G 模块连接）— Pushed to users with the 4G module installed and some others; the 4G module settings page is updated with a new APN entry (APN must be added before the 4G module can connect).

### 2025/05/22 · GOAT A / GOAT O · 1.9.24

**功能新增 New features：**
1. 地图边界编辑——通过地图编辑裁剪或扩展边界。裁剪边界：通过删除与原始边界相交的区域来修剪地图；扩展边界：通过添加相邻区域扩展地图，并与现有地图合并 — Map boundary editing: trim boundaries by deleting intersecting areas, or expand by adding adjacent areas and merging with the existing map.
2. 狭窄区域检测——映射后标记过于狭窄的区域，并提示用户进行调整，优化映射流程流畅性 — Narrow-area detection: marks areas too narrow after mapping and prompts users to adjust, reducing unreachable areas.

**性能优化 Optimizations：**
1. 修复了预约功能异常问题 — Fixed scheduling anomalies.
2. 优化边缘切割性能，包括越界控制和跌倒风险处理 — Edge-cutting performance including out-of-bounds control and fall-risk handling.
3. 提升了 RTK 性能 — RTK performance improved.
4. 优化通过能力（如改善卡顿问题）— Traversability improved (fewer stuck spots).
5. 优化了 4G 模块相关问题（A 系列）— 4G module fixes (A series).

### 2025/06/06–06/15 · GOAT O1000 RTK · 1.12.30

性能优化 — Performance:
- 提升沿边割草性能 — Edge mowing improved.
- 优化蓝牙遥控 — Bluetooth remote control optimized.
- 优化定位 — Localization optimized.
- 改善打滑现象 — Reduced wheel slipping.

### 2025/06/06–06/15 · GOAT A2500 RTK · 1.12.29

版本记录（同推送窗口）— Version listed in the same rollout window; see O1000 RTK 1.12.30 above for scope.

### 2025/06/06–06/15 · GOAT A3000 LiDAR · / (热更新)

热更新 — Hot update (no version details in source).

### 2025/07/16 · GOAT A3000 LiDAR · 1.12.40

最新固件版本 1.12.40。升级内容 — Update contents:
- 切割性能优化 — Cutting performance.
- 蓝牙遥控优化 — Bluetooth remote control.
- 定位相关优化 — Localization.
- 打滑处理能力增强 — Better slipping handling.

【推送计划】Rollout：1.12.32 版本用户中的 20% 已进行首批推送；后续逐步推送至剩余 80% 的用户（TBD）。
【更新策略】Update strategy：现有固件版本 1.5.31 / 1.6.60 / 1.6.61 / 1.7.74 / 1.7.80 / 1.9.21 / 1.12.32 — applies to these current firmware versions.

### 2025/08/04–08/15 · GOAT O1000 RTK · 1.13.31

**🔧 本次固件更新内容 / Firmware update contents**

新增功能 New features：
- 支持在使用视频功能时刷新 GOAT 的定位位置 — GOAT position can refresh while using the video feature.
- （A3000 LiDAR 专属）开启基于雷达数据的闭环定位功能 — (A3000 LiDAR only) LiDAR-based loop closure localization enabled.

性能优化 Performance：
- 提升逻辑割草的路径覆盖率与整体效率 — Higher logical-mowing path coverage and efficiency.
- （O1000RTK & A2500R 专属）优化 RTK 模块的稳定性与表现 — (O1000RTK & A2500R only) RTK module stability improved.

固件 1.13.31 更新后，割草机 A&O 系列的建图边长限制延长到 120m/约 393.7 feet — After 1.13.31, the mapping edge-length limit extends to 120 m / ~393.7 ft.

1.13.31 新增&优化功能点 / Additional changes：
- 增加卡困点记忆 — Stuck-point memory added.
- 建图最远点距离从 100 米放宽到 120 米 — Mapping farthest-point distance relaxed from 100 m to 120 m.
- 优化轨迹涂抹 — Trajectory smearing optimized.
- 窄道支持地图分割 — Narrow passages support map splitting.
- 优化 505 误报问题 — Optimized false 505 alarms.
- 优化 RTK 脱绑问题 — Optimized RTK unbinding.
- 优化漏割&补割逻辑 — Optimized missed/re-cut logic.
- 新增全局就近割草逻辑 — Global nearest-zone mowing logic added.
- 优化避障距离 — Obstacle avoidance distance optimized.
- 优化打滑脱困逻辑 — Slip-escape logic optimized.
- 优化空场地无故调头问题 — Optimized pointless U-turns on open ground.
- Bug fix.

**🔄 OTA 推送节奏 / OTA Release Schedule**
从 8 月 4 日起，向当前固件版本为 1.12.40 的用户中 20%（约占总用户 17%）率先推送；剩余 83% 的用户将在 8 月中旬前完成推送；推送方式根据当前固件版本分为强制更新和可选更新两种策略 — From Aug 4, pushed first to 20% of users on 1.12.40 (~17% of total); the remaining 83% receive it before mid-August. Mandatory or optional depending on current firmware version.

**📌 适配型号及更新策略 / Model & update strategy**

- GOAT A2500 RTK：当前版本 1.2.83 或 1.5.23 → 强制更新 / mandatory update；当前版本 1.5.49、1.5.52、1.5.76、1.5.77、1.7.74、1.7.80、1.9.21、1.9.24、1.12.29 或 1.12.40 → 可选更新 / optional update.
- GOAT A3000 LiDAR：当前版本 1.5.31 → 强制更新 / mandatory；当前版本 1.6.60、1.6.61、1.7.74、1.7.80、1.9.21、1.12.32 或 1.12.40 → 可选更新 / optional.
- GOAT O1000 RTK：当前版本 1.2.37 或 1.2.44 → 强制更新 / mandatory；当前版本 1.5.48、1.5.52、1.5.76、1.5.77、1.7.74、1.7.80、1.9.12、1.9.21、1.9.24、1.12.30 或 1.12.40 → 可选更新 / optional.

### 2025/08/15 · GOAT O1000 RTK / GOAT A2500 RTK · 1.13.32

【升级内容】Update contents：
1. 优化机器卡困 — Optimized robot stuck-point handling.
2. 修复其他已知问题，提升用户体验 — Other known-issue fixes.

仅涉及固件版本为 1.13.31 的机型 — Only applies to models already on firmware 1.13.31.

### 2025/08/15–08/24 · GOAT O1000 RTK · 1.13.33

- 1.2.37 / 1.2.44 — 强制更新 / Mandatory update
  功能集成：GOAT 位置刷新现在支持视频使用时进行刷新。性能优化：改进了逻辑切割性能和覆盖范围；改进了 RTK 性能。
  Features: GOAT position refresh while using video. Performance: improved logical cutting performance/coverage; improved RTK performance.

- 1.5.48 / 1.5.52 / 1.5.76 / 1.5.77 / 1.7.74 / 1.7.80 / 1.9.12 / 1.9.21 / 1.9.24 / 1.12.30 / 1.12.40 — 可选更新 / Optional update
  功能集成：GOAT 位置刷新现在支持视频使用时进行刷新。性能优化：改进了逻辑切割性能和覆盖范围；改进了 RTK 性能。
  Same feature and performance set as above.

- 1.13.31 — 可选更新 / Optional update
  性能优化：改进了切割性能。Performance: improved cutting performance.

OTA 节奏 / Rollout：8/15 所有拥有版本 1.13.31 的用户（占总用户 14%）；8/19 50% 用户；本周内剩余 36% 用户。

### 2025/08/15–08/24 · GOAT A2500 RTK · 1.13.32

- 1.2.83 / 1.5.23 — 强制更新 / Mandatory update
  功能集成：GOAT 位置刷新现在支持视频使用时进行刷新。性能优化：改进了逻辑切割性能和覆盖范围；改进了 RTK 性能。
  Features: GOAT position refresh while using video. Performance: improved logical cutting performance/coverage; improved RTK performance.

- 1.5.49 / 1.5.52 / 1.5.76 / 1.5.77 / 1.7.74 / 1.7.80 / 1.9.21 / 1.9.24 / 1.12.29 / 1.12.40 — 可选更新 / Optional update
  功能集成：GOAT 位置刷新现在支持视频使用时进行刷新。性能优化：改进了逻辑切割性能和覆盖范围；改进了 RTK 性能。
  Same feature and performance set as above.

- 1.13.31 — 可选更新 / Optional update
  性能优化：改进了切割性能。Performance: improved cutting performance.

## GOAT LiDAR PRO / Care Kit

### 2026/07/13 · GOAT A3000 LiDAR PRO / GOAT A2000 LiDAR PRO / GOAT O1000 LiDAR PRO · V1.11.31 / V2.11.31

涉及型号 / Models：
- A LiDAR PRO 机型（青耕 Pro）：A1600 / A2000 / A3000 LiDAR PRO 及 Care Kit 系列
- O LiDAR PRO 机型（白泽 Pro）：O1200 / O1000 LiDAR PRO 及 Care Kit 系列

更新内容 / Update contents：
1. Lidar 固件：修复 E640 报警问题；新增 659 告警（雷达脏污/遮挡，引导擦拭）— Lidar firmware: fixed E640 alarm; added 659 alert (lidar dirty/blocked — guide users to wipe it).
2. 删除卡困点：APP 支持删除卡困点；被困长时间待机回充后，机器将自动出基站续割 — Stuck-point deletion in App; after a long stranded standby, the mower automatically leaves the station to resume mowing once docked and recharged.
3. 优化回充/定位表现 — Return-to-dock / localization improved.
4. 优化打草进度显示 / 优化 3D 地图超时问题 / 优化避障距离逻辑 — Mowing progress display, 3D map timeout, avoidance-distance logic.
5. 调整刀盘转向（A LiDAR PRO）：弓字路径固定正转，减少堵转问题 — Blade disc rotation (A LiDAR PRO): fixed forward rotation on bow-shaped paths to reduce stalling.
6. 其他：修复已知 bug — Other bug fixes.

用户咨询指引 / Support guidance：如有用户反馈相关故障，请先引导确认固件已更新至最新版本 — For related fault reports, first confirm the firmware is on the latest version.
推送周期 / Rollout：7/13 起推送 50%.

### 2026/07/10 · GOAT O1000 RTK Care Kit · V1.11.28 / V2.11.28

更新内容 / Update contents：
1. 修复阴影区重定位问题 — Fixed relocalization in shadowed areas.
2. 优化绕障距离、悬空障碍物、贴边效果、打滑脱困及沿边表现 — Obstacle-avoidance distance, overhanging obstacles, edge-hugging, slip escape and edge performance improved.
3. 其他：修复已知 bug — Other bug fixes.

用户咨询指引 / Support guidance：如有用户反馈相关故障，请先引导确认固件已更新至最新版本 — Confirm the latest firmware first.
推送周期 / Rollout：7/10 起推送 20%.

### 2026/08/14 · GOAT A3000 LiDAR PRO / GOAT A2000 LiDAR PRO · 1.13.10

【体验优化 / Improvements】
- 优化沿边漏割现象 / Better edge mowing — fewer missed spots along edges
- 修复 E659 频繁告警 / Fixed frequent E659 alerts
- 手动遥控体验优化 / Smoother manual remote control
- 卡困点逻辑调整：删除卡困点后，卡困障碍物即刻消失 / Stuck-point update: deleting a stuck point now removes the obstacle right away
- A LiDAR PRO 建图边长限制调整为 150m / A LiDAR PRO map size limit changed to 150m
- 其他 bug 修复 / Other bug fixes

### 2026/08/14 · GOAT O1000 LiDAR PRO · 1.13.10 & 2.13.10

版本记录（与 A 系列 LiDAR PRO 同日推送，更新内容一致）— Version listed in the same rollout window as the A-series LiDAR PRO update above.

# Firmware Updates — WINBOT & UltraMarine P1

> Source: Ecovacs NA 查询宝典 · Firmware Updates sheet · pulled 2026-09-30

Firmware OTA history for ECOVACS WINBOT window cleaners and the UltraMarine P1 pool robot. 固件 OTA 推送记录（窗宝与泳池机器人）。

## WINBOT

### 2025/03/17 · WINBOT MINI · 3.6.0

由三种清洁模式正式升级为四种清洁模式，新增精细清洁模式（路径为 Z 字路径清洁两遍，带喷水）— Upgraded from three to four cleaning modes; the new Fine Cleaning mode runs a Z-shaped path twice with water spray.

### 2025/05/22 · WINBOT MINI · 3.65.2

解决漏擦问题，优化用户体验 — Fixed missed-spot (skipped wiping) issues and improved experience.
如有反馈漏擦问题可先引导升级最新固件 — For missed-wiping reports, first guide users to upgrade to the latest firmware.

### 2026/08/31 · W2S PRO Series · 2.4.0

**【产品逻辑变更通知 — 窗宝多型号支持清洁的倾斜角度调整】**
**Product Logic Update: Adjusted Supported Tilt Cleaning Angles for Multiple WINBOT Models**

变更前：以垂直地面的玻璃面（90°）为基准，可清洁角度范围为 90°±45°；除 W3 以外，其余型号不支持水平面玻璃作业。
Before: Based on a vertical glass surface (90°), the cleanable range was 90°±45°; except for W3, other models did not support horizontal glass.

变更后：以垂直地面的玻璃面（90°）为基准，正挂状态可支持角度扩大至 90°±90°（支持水平面之上的清洁）；倒挂状态的限制条件维持不变。
After: In standard (non-inverted) mounting, the supported range expands to 90°±90° (cleaning above horizontal is supported); inverted-mounting limits remain unchanged.

简单理解：窗宝现在可支持更大的玻璃倾斜角度 — WINBOT now supports a much wider range of glass tilt angles.

本次能力更新将通过 OTA 分批次推送至各机型 / OTA rollout by model：
- W3：已完成 OTA 推送 — OTA already pushed.
- W2S PRO 系列：8 月 31 日 OTA 推送 — W2S PRO series: pushed Aug 31.
- mini 2：9 月 24 日 OTA 推送 — mini 2: pushed Sep 24.

**⚠️ 重要注意事项 / Important notes：**
- 在水平面玻璃作业时，不支持沿边清洁模式，APP 内会弹出对应提示 — Edge-cleaning mode is not supported on horizontal glass; the App shows a prompt.
- 实际是否可清洁，以窗宝识别判断为准；如果窗户角度不满足条件，设备会弹窗提醒并报警 — Whether cleaning is possible is ultimately judged by the device itself; if the angle doesn't qualify, the device alerts and alarms.
- 即便人工判定角度处于支持区间，最终仍以机器自身检测结果为准 — Even if a human judges the angle to be within range, the robot's own detection result is final.

## UltraMarine P1

### 2026/04/30 · UltraMarine P1 · 5.29.0

**更新内容 / Updates**
修复已知问题，全面优化设备运行稳定性，提升整体使用体验 — Fixed known issues, optimized stability, improved overall experience.

**重要注意事项 / Important notes**
- 本次 OTA 升级加载时长较以往增加约 1 分钟，可告知用户耐心等待，请勿中途断电或退出升级流程 — This OTA takes ~1 minute longer to load than before; tell users to wait patiently and NOT to cut power or exit mid-upgrade.
- 升级过程中可能出现异常界面，保持设备正常连接，等待自动加载完成即可 — An abnormal screen may appear during the upgrade; keep the device connected and wait for loading to finish.
- 如遇到更新失败、升级卡顿，或重复出现异常界面等情况：引导用户退出 APP，升级至最新版本后，重新进入并连接设备再次尝试升级 — If the update fails, stalls, or repeatedly shows abnormal screens: guide the user to quit the App, update the App to the latest version, then reconnect and retry.

**专项问题处理指引 / Known-issue guidance**
设备升级至 5.29.0 版本后，若仍出现机器回池后长时间蓝灯闪烁、水泵间歇性工作等现象 — If, after upgrading to 5.29.0, the robot still shows prolonged blue-light blinking after returning to the pool, or the pump works intermittently:
1. 引导用户进入 APP，核实泳池机器人是否已成功升级至 5.29.0 版本，并提供版本截图确认 — Verify in the App that the pool robot is actually on 5.29.0 with a version screenshot.
2. 确认设备已是最新版本仍存在故障现象，引导用户走售后对接流程处理 — If the latest version is confirmed but faults persist, route to the after-sales process.

推送状态：全量推送、强制更新 — Fully pushed, mandatory update.

### 2026/05/21 · UltraMarine P1 · 5.30.0

已普推 — Fully rolled out.（详见原表通知细则 — see the original sheet's notice details.）

### 2026/07/02 · UltraMarine P1 · 5.33.0

V5.33.0 强制更新已完成推送，本次优化内容如下 — V5.33.0 mandatory update fully pushed; optimizations:
1. 清洁面积显示与计算逻辑：优化清洁日志中清洁面积的显示与计算逻辑，提升数据准确性 — Cleaning area display/calculation in the cleaning log optimized for accuracy.
2. 洗墙清洁逻辑：优化洗墙清洁相关算法，改善清洁效果 — Wall-cleaning algorithm improvements.
3. 其他优化：进一步优化清洁表现，提升用户体验 — Further cleaning-performance improvements.

⚠️ 用户咨询相关故障时，请先引导用户确认固件已更新至最新版本 — For fault inquiries, first confirm the firmware is on the latest version.

### 2026/09/21 · UltraMarine P1 · 5.39.0 / 5.40.0

推送方式 / Rollout：100% 强制更新 / Mandatory update
推送时间 / Release Date：2026/09/08–09；已重新推送 100%，版本号调整为 5.40.0，内容一致 — Re-pushed at 100% as version 5.40.0 with identical content.

**【更新内容 / Update Details】—— 可对外 / For external use**
本次更新为产品性能优化，提升整体使用体验 — This update includes product performance optimizations to improve user experience.

**【更新内容 / Update Details】—— ⚠️ 仅内部知悉 / Internal only**
1. 延长翻车检测时间，侧翻持续 3min 后发出告警 / Extended tilt detection: alarm triggers after 3 min of continuous tilting. 真实侧翻 3 分钟后才报警，降低误报或侧翻恢复后仍报警导致任务中止的概率 / Reduces false alarms and unexpected task stops.
2. 优化堵转告警，减少保险丝烧坏与清洁中停机 / Optimized stall alert. 优化驱动轮电流保护策略，减少保险丝烧毁及清洁中途停机，会提示驱动轮报警 / Improved drive-wheel current protection; reduces blown fuses and mid-clean stops.
3. 新增故障告警大数据埋点 / Added fault alert data tracking. 用户无感 / No user-facing changes.
4. 优化配网成功率 / Improved Wi-Fi setup success rate. 性能优化，提升联网稳定性 / More stable network connection.
5. 优化出入水检测 / Improved in-water/out-of-water detection. 降低误报出水（水中闪黄灯导致任务失败）或入水检测失败（入水后持续闪蓝灯无法工作）的概率 / Reduces false out-of-water alerts (yellow light, task failure) and failed in-water detection (blue light, unable to start).
6. 优化满电判断逻辑 / Optimized full-charge logic. 解决长时间 97-98% 充不满问题，APP 直接显示 100% / App now displays 100% when charging was previously stuck at 97–98%.
7. 优化水中故障后机器无故停机问题 / Fixed unexpected shutdown after in-water faults. 解决机器在水中出现故障后无故停机、任务中止的问题 / Reduces random shutdowns and task interruptions caused by in-water faults.

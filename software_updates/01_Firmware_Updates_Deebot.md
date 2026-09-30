# Firmware Updates — DEEBOT (X / T / N Series)

> Source: Ecovacs NA 查询宝典 · Firmware Updates sheet · pulled 2026-09-30

Firmware OTA history for ECOVACS DEEBOT robot vacuums. 固件 OTA 推送记录（地宝系列）。When troubleshooting, always verify the robot's current firmware version first. 遇到相关问题时，请先核实机器的固件版本。

## X5 PRO OMNI

### 2024/09/27 · X5 PRO OMNI · 1.35.0

1. AI 识别功能 — AI recognition feature.
2. 基站灯不熄灭问题 — Fixed the base-station light not turning off.
3. 常规功能优化 — General function optimizations.

## N30 PRO OMNI

### 2024/09/28 · N30 PRO OMNI · 1.34.7

当地宝在基站内待机时，实时检测基站底槽是否溢水，溢水则主动抽污 — While the robot is on standby inside the station, the base tray is monitored in real time for overflow; if overflow is detected the robot actively pumps out the waste water.

## T30 Series / T30S / T30C

### 2024/10/17 · T30 Series · 1.87.0

1. 优化地图扩建逻辑，扩建需进行二次确认 — Optimized map-expansion logic; expansion now requires a second confirmation.
2. 优化定位逻辑，提高定位成功率 — Optimized localization logic for a higher repositioning success rate.
3. 优化手动分区逻辑，解决首次清扫重新分区问题 — Optimized manual zone editing; fixed re-zoning during the first cleaning.
4. 优化地宝回充和避障能力 — Improved return-to-dock and obstacle avoidance.
5. 多楼层建图无需从基站触发 — Multi-floor mapping no longer needs to be triggered from the station.

> 注意 Note：【T30 系列（除 T30S PRO）】提供用户（机器）实际所在区域（相关问题需提前核实 APP 所在区域是否与实际所在区域一致），以更快地处理问题 — For the T30 series (except T30S PRO), collect the user's (robot's) actual region — verify first whether the App region matches the robot's actual region — to handle issues faster.

### 2024/11/14 · T30S AI · 1.42.0

1. 优化了地图扩建逻辑 — Optimized map-expansion logic.
2. 优化了定位逻辑，提升了定位成功率 — Optimized localization for a higher success rate.
3. 优化了手动分区逻辑 — Optimized manual zone editing.
4. 提升了地宝回充能力 — Improved return-to-dock capability.
5. 提升了避障能力 — Improved obstacle avoidance.
6. 多楼层建图无需从基站触发 — Multi-floor mapping no longer needs to be triggered from the station.

### 2025/04/03 · T30 Series · 1.98.2

向已升级到 1.98.0 版本的用户推送 1.98.2 版本更新，以解决地宝与基站断联的问题 — Pushed to users already on 1.98.0 to fix robot–station disconnection.

**如果当前版本是 1.98.0 / If currently on 1.98.0：**
将地宝放入基站内，确保处于充电状态，打开 APP，根据提示将地宝升级到 1.98.2。升级过程中请确保地宝与 APP 连接稳定。升级成功后，地宝保持在基站内不动，拔掉基站电源线，确保基站完全断电。等待 30 秒后重新接通电源，再等待 3 分钟后即可正常使用 — Put the robot in the station and confirm it is charging, open the App and follow the prompt to upgrade to 1.98.2. Keep the robot–App connection stable during the upgrade. After a successful upgrade, keep the robot in the station, unplug the station power cord so the station is fully powered off, wait 30 seconds, plug it back in, then wait 3 minutes before normal use.

**如果当前版本已是 1.98.2 / If already on 1.98.2：**
将地宝放入基站内充电，从插座上拔掉基站电源线，让基站完全断电 30 秒，再重新插上，等待基站启动，再等 3 分钟后即可正常使用 — Put the robot in the station charging, unplug the station power cord for a full 30-second power-off, plug it back in, wait for the station to boot, then wait 3 minutes before normal use.

### 2025/09/22 · T30C · 1.41.0

1. 一键扩展矩形地毯（地图编辑界面点击地毯后再点击一下确认）— One-tap expand recognized carpet into a rectangle (tap the carpet in map editing, then confirm).
2. 清洁效率在高效模式下，抹布盘取消常态外扩（沿边不影响）— In Efficient mode the mop disc no longer constantly extends outward (edge cleaning unaffected).
3. 修复其他已知问题，提升用户体验 — Other known-issue fixes and experience improvements.

### 2026/08/14 · T30S PRO / T30S AI · 1.50.0

通知 / Notice
T30S 系列海外全区域 OTA 1.50.0 版本开启 30% 普推。遇到预约不按时问题：先核查固件版本，引导用户升级；尚未收到 1.50.0 版本的，正常登记定推。1.50.0 版本下出现预约清洁异常问题，请继续在群内反馈 — T30S series OTA 1.50.0 starts a 30% general rollout for all overseas regions. For scheduled-time mismatch issues: check the firmware version first and guide the user to upgrade; for users who haven't received 1.50.0, register a targeted push as normal. Keep reporting abnormal scheduled-cleaning issues on 1.50.0 in the group.

## X1 Series

### 2025/04/11–04/21 · X1 OMNI / X1 TURBO · 2.4.45

为了提升用户体验，X1 OMNI 和 X1 TURBO 将进行 OTA 普更 — General OTA rollout to improve user experience.
推送比例 / Rollout：4/11 10%；4/15 30%；4/17 50%；4/21 100%.

## X8 Series

### 2025/01/10 · X8 Series / T50 Series · 1.79.1

**APP 新增功能 / New App features：**
1. 建图完成后的首次清洁，会引导推荐先单扫全屋 — After mapping completes, the first clean recommends a sweep-only whole-home pass first.
2. 清洁日志增加漏扫原因（关门、障碍物、跳过和一键补扫）— Cleaning log adds missed-spot reasons (closed door, obstacle, skipped, one-tap re-clean).
3. 小区域扩建后地图支持用户二次确认 — Second confirmation after small-area map expansion.
4. 智能门槛条推荐 — Smart threshold-strip recommendation.
5. 智能虚拟墙推荐 — Smart virtual-wall recommendation.
6. 手动增加家具类型岛台、壁炉 — Manual furniture types add island counter and fireplace.
7. 区域删除，解决散射区域问题 — Zone deletion fixes the scattered-zone issue.
8. 地图编辑增加榻榻米（含方向）— Map editing adds tatami (with orientation).
9. 清洁进度（清洁完成百分比）— Cleaning progress (completion percentage).
10. 斜墙识别 — Slanted-wall recognition.
11. 集尘默认档位由静音集尘改为标准集尘（仅 X8 系列）— Default auto-empty changed from Quiet to Standard (X8 series only).

**语音包新增 / New voice-pack features：**
1. 全屋地毯清洁——只扫全屋地毯（YIKO 语音指令）— Whole-home carpet clean: sweep-only whole-home carpet (YIKO voice command).
2. 指定区域的地毯清洁——打扫一下客厅的地毯（YIKO 语音指令）— Zone carpet cleaning: "clean the living-room carpet" (YIKO voice command).
3. 谷点时间对接充电机器会提示：等待充电 — Off-peak charging shows "waiting to charge".
4. 海外增加西班牙语和越南语本地播报 — Added Spanish and Vietnamese local voice announcements overseas.
5. 海外全栈 YIKO — Full-stack YIKO overseas.

（以上功能需要 H5 更新后才可以使用，固件全量推完后 H5 发布上线 — These features require the H5 update; H5 goes live after the full firmware rollout.）

**软件优化 / Software optimizations：**
1. 精细快建 — Fine quick mapping.
2. 避障能力提升 — Improved obstacle avoidance.
3. 检测关门碰撞时间缩短优化 — Shortened closed-door collision detection time.
4. AI 污渍模型优化 — AI stain-model optimization.
5. 万物沿边模型优化，避障性能提升 — Edge-following model optimization for better avoidance.
6. 回洗策略优化（仅 X8 系列）— Mop-washing strategy optimization (X8 only).
7. 精细拖地优化（仅 X8 系列）— Fine mopping optimization (X8 only).

### 2025/05/15 · X8 Series · 1.108.0

**新功能 / New features：**
1. 视频管家启动需物理按键（同 X9 系列）— Video Manager now requires the physical button to start (same as X9 series).
2. 预约支持参数调节和取消下一次预约（同 X9 系列）— Scheduling supports parameter adjustment and canceling the next scheduled task (same as X9 series).

**体验优化 / Experience：** 修复已知问题，提升用户体验 — Known-issue fixes and experience improvements.

### 2025/08/25–08/28 · X8 Series · 1.121.0

**新功能 / New features：**
1. 新手引导语音（VUI）— Onboarding voice guidance (VUI).
2. APP 与语音支持荷兰语 / 捷克语 / 斯洛伐克语 — App and voice support Dutch / Czech / Slovak.
3. 支持越南语播报与对话 — Vietnamese announcements and dialogue supported.
4. 避障增加档位（标准 / 灵敏）— Obstacle avoidance gains Standard / Sensitive levels.
5. RED 认证导入（用户无明显感知）— RED certification import (not user-visible).

**体验优化 / Experience：**
1. 机器识别地毯支持一键拓展矩形 — Recognized carpets support one-tap expansion into a rectangle.
2. 海外机型自动加液默认关闭，APP 提供引导（线上版本已导入）— Auto cleaning-solution refill defaults to OFF overseas with in-App guidance (already live online).
3. 修复已知问题：回充与导航优化；歪图矫正；APP 显示与交互优化（分区线倾斜、建图完成 a-ha、iOS 左滑返回上一级、设置页滚动条位置记忆、多弹窗背景层级、虚拟墙尺寸调整）— Fixes: return-to-dock and navigation; skewed-map correction; App display and interaction (tilted zone lines, mapping-completion a-ha moment, iOS left-swipe back, settings scroll-position memory, multi-popup layering, virtual-wall sizing).

**Bug 修复 / Bug fixes：**
1. 修复漏扫原因显示错误 — Fixed missed-spot reason display errors.
2. 多楼层自动切图二楼时，当前地图若无基站不进行探索回充，回到任务开始位置 — When auto-switching to the second floor, if the current map has no station the robot skips exploration docking and returns to the task start point.

OTA 推送计划（国际）/ Rollout (International)：8/25 20% 普更；8/26 50% 普更；8/27 100% 普更；8/28 100% 强更。

### 2025/10/17 · X8 Series · 1.128.0

【体验优化】修复已知问题，提升用户体验 — Experience optimizations: known-issue fixes and improvements.
普更详细 OTA 内容 / General-rollout details：
1. 自研视频管家 — In-house Video Manager.
2. 清洁顺序调整 — Cleaning sequence adjustment.
3. 清洁效率设置不生效的问题 — Fixed cleaning-efficiency setting not taking effect.
4. 分区门槛问题 — Zone threshold issue.
5. 外扩电机超时保护 — Extension-motor timeout protection.

### 2026/05/09–05/14 · X8 Series · 1.133.0

X8 PRO OMNI 将启动新版本推送，推送版本为 1.133.0，本次为强更。修复"机器无反应"等已知问题，提升用户体验 — X8 PRO OMNI starts pushing 1.133.0 as a MANDATORY update. Fixes "robot not responding" and other known issues, improving user experience.
版本推送计划 / Rollout：05/09 国际普更 30%；05/12 国际普更 50%；05/13 国际普更 100%；05/14 国际强更 100%。

## X9 Series

### 2025/05/07 · X9 Series · 1.35.0

黑色物体触发下视优化 / 其他已知问题优化 — Downward-sensor optimization for black objects / other known-issue fixes.
5/07 30%（国际）普更；5/08 100%（国际）强更。

**【新功能】New features：**
1. 支持 Matter — Matter support.
2. 上线轻脏污识别功能 — Light-dirt detection launched.
3. 支持设置单楼层和多楼层 — Single-floor and multi-floor configuration.
4. 预约支持参数调节和取消下一次预约 — Scheduling supports parameter adjustment and canceling the next task.
5. 鸿蒙支持视频管家 — HarmonyOS Video Manager support.

**【体验优化】** 修复已知问题，提升用户体验 — Known-issue fixes and experience improvements.

### 2025/06/06–06/10 · X9 Series · 1.42.0

**【新增内容】New：**
1. 定制清洁增加 AI 智能清洁推荐（推荐的日常清洁、餐后清洁、宠物清洁、深度清洁带上思考过程）——仅国内 — Custom cleaning adds AI cleaning recommendations with reasoning (daily / after-meal / pet / deep cleaning) — domestic only.
2. AIVI 3D 3.0 增加标准与灵敏 2 个档位（默认灵敏档）— AIVI 3D 3.0 gains Standard and Sensitive levels (Sensitive by default).
3. 支持土耳其语对话和播报 — Turkish dialogue and announcements.

**【优化内容】Optimizations：**
1. 轻污渍策略优化（直线来回改为井字清洁不回洗）— Light-stain strategy: straight back-and-forth changed to grid cleaning without re-washing.
2. 自动添加清洁液功能默认关闭，APP 提供引导 — Auto cleaning-solution refill defaults to OFF with in-App guidance.
3. 分区线优化 — Zone-line optimization.
4. 漏扫检测优化 + APP 显示错误问题修复 — Missed-spot detection and App display fixes.
5. 歪图矫正 — Skewed-map correction.
6. 运营位与上新功能弹窗位置互换 — Swapped promo slot and new-feature popup positions.

**【内部优化】Internal：** 售后跑机自检（对用户不可视）— After-sales run self-check (not user-visible).

### 2025/07/03 · X9 Series · 1.42.2

新增：安心避护模式 — New: Pet Care mode. 功能说明：宠物庇护模式开启后针对宠物提供更安全的避障距离 — When Pet Care is enabled, the robot keeps a safer obstacle-avoidance distance around pets.

### 2025/09/16–09/19 · X9 Series · 1.54.0

**【新功能】New features：**
1. 语音播报的模式支持精细和简洁播报 — Voice announcements support Detailed and Concise modes.
2. 支持识别的地毯一键拓展为矩形 — Recognized carpets can be expanded into a rectangle with one tap.
3. APP 和语音播报支持荷兰语 / 捷克语 / 斯洛伐克语 — App and voice support Dutch / Czech / Slovak.

**【体验优化】Experience：** 修复已知问题，提升用户体验 — Known-issue fixes and experience improvements.

内部补充 / Internal additions：
1. VUI 迭代，语音播报的模式支持精细和简洁播报 — VUI iteration with Detailed / Concise announcement modes.
2. 鸿蒙系统支持视频管家（含视频查看、语音通话、遥控，其他功能暂不支持）— HarmonyOS Video Manager (video view, voice call, remote control; other functions not yet supported).
3. 避障、导航、回充、漏扫优化 — Obstacle avoidance, navigation, docking, missed-spot optimizations.
4. APP 体验优化（虚拟墙尺寸调整优化、地图扩建弹窗支持对比、视频管家添加提示：当前 ${num} 人使用）— App improvements (virtual-wall sizing, map-expansion comparison popup, Video Manager "currently ${num} users" notice).
5. 市场问题修复：清洁顺序调整、APP 主页面及机器内部电量显示不一致问题修复、下视跨区误触发优化 — Market-issue fixes: cleaning order, App/robot battery display mismatch, downward-sensor cross-zone false triggers.

### 2025/12/05 · X9 Series · 1.58.0

1. 修复其他已知问题，提升用户体验 — Fixed other known issues and improved user experience.

若遇到该系列问题反馈，务必核实固件版本。在升级问题时，请提供相应截图，路径：设置 → 地宝高级设定 → 地宝信息 → 地宝升级 — For issue reports on this series, verify the firmware version. When reporting upgrade issues, attach screenshots via Settings → DEEBOT Advanced Settings → DEEBOT Information → DEEBOT Upgrade.

[OTA Notification] ECOVACS X9 Series (YEEDI S16 PLUS) Firmware Version Update: Version 1.58.0 Now Fully Released. Update details: Fixed other known issues and improved user experience.

### 2025/12/16–12/19 · X9 Series · 1.59.0

- Fixed known issues and improved user experience.
- Rollout plan (International): Dec 16: 30%; Dec 18: 50%; Dec 19: 100%.

### 2026/08/11 · X9 Series · 1.64.0

修复已知问题，提升整体使用体验 — Fixed known issues and improved overall experience.

## X11 Series

### 2025/08/30 · X11 Series · 1.47.105

**【新功能】New features：**
1. 智能体模式（思维链优化）— Agent mode (chain-of-thought optimization).
2. 语音陪伴式教学（支持简洁和详细两种播报模式）— Companion voice teaching (concise and detailed announcement modes).
3. AI 智能定制【设置 → 定制】— AI intelligent customization [Settings → Customization].

**【体验优化】Experience：**
1. 耗材列表改版 — Consumables list revamp.
2. 修复已知问题，提升用户体验 — Known-issue fixes.

**【其他】Other：** UI 界面调整（超充动画改版、地图分割合并引导优化等）；UL 认证：视频开关；合规：WiFi 安规处理方案；市场问题修复：补扫和清洁顺序问题修复（默认顺序统一由远及近，厨房最后）— UI adjustments (flash-charging animation, map merge/split guidance); UL certification: video switch; compliance: WiFi safety scheme; market fixes: re-clean and cleaning-order fixes (default order is far-to-near, kitchen last).

可释放给用户的内容 / User-facing content：
[New Feature Available]
1. Agent Hosting.
2. Smart Voice Assistant: a helpful companion for worry-free cleaning! [Switch between "Detailed" and "Concise" voice prompts as needed]
3. Matter supported.
4. Dutch display and voice prompts supported.
5. AI Intelligent Customization upgraded [Settings -> Customization]

### 2025/09/16 · X11 Series · 1.47.112

改善无故停机、无法使用视频管家巡航功能、上下水基站漏水兜底等 — Improved random shutdowns, Video Manager cruise not working, and water-station leak fallback handling.

### 2025/09/29 · X11 Series · 1.47.116

1. 精细清洁模式地毯增压到超强档，降低运行速度提升 CE — Fine-cleaning mode boosts carpet pressure to Max and lowers speed to improve cleaning efficiency.
2. 扫地切拖地 APP 增加提示避免干拖 — App warns when switching from sweeping to mopping to avoid dry mopping.
3. 修改滚刷保护值 — Main-brush protection value adjusted.
4. 修复发现的死机问题 — Fixed discovered freeze issues.
5. 沿边结构光点云过滤，解决点云打撞板造成的误避障 — Edge structured-light point-cloud filtering fixes false avoidance caused by points hitting the bumper.
6. 基本 bug 修复 — General bug fixes.

### 2025/10/31–11/12 · X11 Series · 1.57.105

[New Feature]
1. Homepage Map: Displays stain locations when stains are detected
2. Agent Hosting: Supports Auto and Room scheduling

[Experience Optimization]
1. Device Control Page: Adjusts the position of YIKO Assistant and prompts
2. Agent Hosting Preference Settings: Moved to below the start button of Agent Hosting
3. Fixes known issues and improves user experience

内部详细 / Internal details：【体验优化】
1. 机器操控页：调整 YIKO 助手和提示位置（异常告警和提示）— Device control page: YIKO assistant and prompt positions adjusted.
2. 智能体偏好设置：移至智能体模式启动按钮下方 — Agent preference settings moved below the Agent mode start button.
3. 超充优化（断点续扫循环超充 + 超级补电逻辑优化 + 出现断点续扫时引导开启超充自适应常驻弹框）— Flash-charge optimization (resume-cleaning loop charging + super top-up logic + persistent adaptive-charging prompt when re-clean triggers).
4. AI 模型优化（污渍模型和提线模型）— AI model optimization (stain and line models).
5. YIKO 关闭和唤醒词切换通知其他家庭成员 — YIKO off / wake-word switch notifies other family members.
6. 工作结束原因显示在主界面 — Work-end reason shown on the main screen.
7. 免打扰引导添加描述 — DND guidance description added.
8. APP 交互优化（虚拟墙划区默认尺寸与屏幕大小等比、清洁序列关闭入口调整、定制清洁默认添加的文案修改、连续漏扫显示优化）— App interaction improvements.
9. 智能门槛条和虚拟墙忽略 — Smart threshold strip and virtual-wall ignoring.
10. 安心庇护模式漏扫优化 — Pet Care missed-spot optimization.
11. 边角漏扫优化（仅做在极限贴边档位下生效）— Edge missed-spot optimization (only effective in extreme edge-hugging level).
12. 修复已知问题，提升用户体验 — Known-issue fixes.

### 2025/12/05–12/10 · X11 Series · 1.63.0

修复其他已知问题，提升用户体验 — Fixed other known issues and improved user experience.

以下详细升级内容仅供内部了解，请勿发送至用户端 / Internal only — do NOT send to end users.

**【新功能】New Features**
1. 节日氛围二期——圣诞节 — Holiday-themed UI phase 2: Christmas.
2. 增加在线语音指令：切为精细、切为简洁 — Added online voice commands: "Switch to Fine", "Switch to Simple".

**【体验优化】Experience Optimizations**
1. 视频清晰度问题修复 — Fixed video clarity issues.
2. 打开清洁液开关提醒 — Reminder for turning on the cleaning-solution switch.
3. 清洁效率实时生效 — Cleaning efficiency takes effect in real time.
4. 智能体偏好扩展：区域里的家具避让偏好、沿地板方向清洁、地毯精细、复拖、集尘挡位（YEEDI 无此项）— Expanded agent preferences: furniture avoidance within zones, clean along floor direction, fine carpet cleaning, repeated mopping, dust-collection power levels (not on YEEDI).
5. 免打扰时间段内语音切为简洁且降低音量 — During DND periods voice switches to simplified mode with lower volume.
6. 语言和时区不一致的引导 — Guidance when language and time zone mismatch.
7. 地宝升级弹窗优化 — Optimized upgrade popup for DEEBOT.
8. 回充、缠地毯优化 — Return-to-dock and carpet-entanglement optimizations.
9. 地图编辑和显示优化 — Map editing and display optimizations.
10. 其他问题修复 — Other fixes.

### 2026/03/10–03/17 · X11 Series · 1.75.0

**【新功能】New Feature**
Cleaning mode is automatically remembered after switching, no need to reconfigure. 某清洁模式切换后自动记忆，无需重复设置 — Cleaning mode is remembered after switching.

**内部 / Internal — 请知悉：**

**【新功能】**
1. 跨机控制（地控割）— Cross-robot control (DEEBOT controls GOAT).
2. 清洁模式切换后永久记忆 — Permanent memory of cleaning mode after switching.

**【体验优化】**
1. 地图编辑优化（分割线自动吸附功能、小尺寸矩形操控放大镜功能、虚拟墙正方形等比例缩放、清扫轨迹辅助地图编辑）— Map editing: split-line auto-snapping, magnifier for small rectangles, proportional virtual-wall square scaling, trajectory-assisted editing.
2. 家具新增蹲坑 — Squat toilet added as furniture type.
3. 设置首页地图使用指南改为运营位 — Homepage map guide slot changed to promo slot.
4. 回充优化：无法回充 VUI + 回充阻挡提醒 — Docking optimization: cannot-dock VUI + docking-blocked reminder.
5. 多楼层地图无充电座不回充加上洗拖布提示 — Multi-floor maps without the charging dock skip docking and add mop-washing notice.
6. 清洁液液位低于 15% 进行提醒 — Cleaning-solution level warning below 15%.
7. 专项优化（滚刷、驱动轮缠绕吐出、门槛过去之后回不来场景解决、极限狭窄区域穿越）— Special optimizations (main brush, drive-wheel tangle spit-out, threshold pass-back failure, extreme narrow-area traversal).
8. 其他已知问题修复 — Other fixes.

**【售后】After-sales**
1. 异常 code 码 — Abnormal error codes.
2. 维护模式多语言支持 — Maintenance mode multi-language support.

## X12 Series

### 2026/05/06–05/12 · X12 Series · 1.67.0

**【体验优化】Experience：**
1. 灵渍喷溶功能引导优化 — Jet Mop guidance optimization.
2. Error Code 显示优化 — Error code display optimization.
3. 多楼层场景下不回洗增加提醒 — Reminder when mop re-washing is skipped in multi-floor scenarios.
4. 清洁液低于 15% 提醒液位低 — Cleaning-solution low-level warning below 15%.
5. 修复其他已知问题 — Other known-issue fixes.

将进行固件版本强更，APP H5 同步更新 — MANDATORY firmware update; App H5 updates in sync.

### 2026/06/10–06/17 · X12 Series · 1.73.1

**【新功能】New features：**
1. 玻璃门专项优化：支持在地图编辑中添加玻璃门，有效减少碰撞并优化沿边清扫路径 — Glass door optimization: add glass doors in map editing to reduce collisions and optimize edge-cleaning paths.
2. 地毯流苏避障：新增"地毯流苏避障"开关，精准识别并避开流苏，避免缠绕 — Carpet fringe avoidance: new toggle to precisely recognize and avoid fringes and prevent tangling.

**【体验升级】Experience upgrade：**
1. 功能布局焕新：新增"AI 灵渍深洁"专属设置板块，原"自动灵渍喷溶"功能正式升级为"AI 灵渍深洁"（在 AI 污渍识别打开的情况下 Auto/Area/Scenario Clean/Agent Hosting 等任意清洁模式都生效）— Layout refresh: dedicated "AI Jet Mop Deep Clean" settings section; Auto Stain Spray upgraded to AI Jet Mop Deep Clean (effective in any cleaning mode when AI stain recognition is on).
2. 细节优化：修复多项已知问题，进一步提升系统运行稳定性与整体交互体验 — Detail optimizations and stability fixes.

版本推送计划 / Rollout：2026/6/10 20%；6/12 50%；6/17 100%（强更 mandatory）。

### 2026/08/13 · X12 Series · 1.79.1

**【新功能 / New Features】**
1. 区域灵渍深洁：可在「地宝高级设定 → 灵渍深洁设置 → 区域灵渍深洁」中自定义清洁区域。默认针对厨房区域执行「先清扫浮尘 → 灵渍深洁喷溶去顽渍 → 双次拖地」三段式深度清洁，顽固污渍清洁效果显著提升。
   Jet Mop by Zone: Customize your clean zones in Advanced Robot Settings → Jet Mop Settings → Jet Mop Areas. Defaults to the kitchen area, performing a 3-step deep clean cycle — Sweep → Stain Spray Dissolve → Double Mop — for significantly better results on stubborn stains.
2. 地图坡道设置：地图支持手动添加坡道，帮助地宝更顺畅地通过爬坡板与坡道地形。
   Ramp Setup on Map: Manually add ramps to your map to help the robot navigate threshold ramps and sloped surfaces more smoothly.

上述新功能的使用方法以及截图将在 OTA 推送完成后同步更新至共享盘课件 — Instructions and screenshots will be updated to the shared-drive courseware after the OTA push.

**【体验优化 / Experience Upgrade】** 修复已知问题，整体使用体验更流畅 — Bug fixes and smoother experience.

### 2026/09/04–09/11 · X12 Series · 1.85.0

版本推送计划为普更 / General rollout：2026/09/04 30%；09/08 60%；09/11 100%.

**【体验优化 | Experience Improvements】**
1. 优化清洁液低液位提醒，减少部分机型频繁提醒的问题。
   Optimized low cleaning solution level reminders to reduce excessive notifications on certain models.
2. 优化基站清洁槽水满检测，减少水满误报。
   Optimized water-full detection for the base station's Mop Washing Tray to reduce false alarms.
3. 升级瞬时超充逻辑，延长清扫续航时间。
   Upgraded the PowerBoost Charging logic to extend cleaning runtime.
4. 新增集尘袋安装到位语音提示。
   Added a voice prompt confirming that the dust bag is properly installed.
5. 优化运行逻辑，改善碰撞表现。
   Optimized operating logic to improve collision handling.
6. 修复多项细节问题，提升整机稳定性。
   Fixed various minor issues to improve overall device stability.

## T50 Series

### 2025/01/17 · T50 Series · 1.79.2

修复 T50 边刷、部件保养工作时间异常问题，并增加信息提醒（如原表截图内容）— Fixed T50 side-brush and component-maintenance working-hour anomalies and added information reminders (see the original sheet screenshot).

### 2025/03/19 · T50 Series · 1.95.0

1. 地图添加家具支持放大缩小 — Map furniture supports zooming in and out.
2. APP 预约界面改版，交互升级 — App scheduling UI revamp with upgraded interactions.
3. 修复已知问题，提升用户体验 — Known-issue fixes.

### 2025/04/09–04/14 · T50 Series · 1.99.1

修复已知问题，提升用户体验。主要优化回充斜坡底座污水残留问题（抹布盘抬升回充与放下回充都属于正常现象）— Known-issue fixes; mainly optimizes dirty-water residue on the docking ramp (both raised-mop and lowered-mop returns are NORMAL behavior).
国内国际从 V1.95.0 升级到 V1.99.1 按比例普更 — Proportional rollout from V1.95.0 to V1.99.1: 4/9 20%; 4/10 30%; 4/11 30%; 4/14 100%.

### 2025/05/19–05/22 · T50 Series · 1.110.0

优化内容：预约支持参数设置及取消下次预约任务（同 X9 系列）/ 接入 Matter 协议 — Scheduling supports parameter settings and canceling the next task (same as X9 series) / Matter protocol integration.

### 2025/09/18–09/25 · T50 Series · 1.123.0

新功能：新增互动语音向导，增强互动陪伴感 — New: interactive voice wizard for stronger companionship.
算法升级：
a) 深度优化了 YIKO 语音识别模型，提高了唤醒率和指令识别准确率 — Deep-optimized YIKO speech recognition with higher wake rate and command accuracy.
b) 提升了在复杂环境中返回充电的成功率 — Higher successful docking rate in complex environments.
c) 更新了路径规划策略，减少清洁盲区，增加区域覆盖率与清洁效率 — Updated path planning reduces blind spots and increases coverage and efficiency.
系统修复：解决了已知问题，提升了整体系统稳定性和性能 — System fixes improve overall stability and performance.

### 2025/12/01–12/10 · T50 Series · 1.123.126

OTA 内容（可对用户展示 / user-facing）：
1. Scenario Cleaning: The cleaning sequence has been optimized. 定制清洁，清洁顺序逻辑优化。
2. Mapping: Known map issues have been fixed. 地图已知问题更新修复，提升地图稳定性。
3. Docking: Known docking issues have been resolved, improving overall docking performance. 回充已知问题修复，回充能力提升。
4. General Fixes: Other known issues have been addressed. 其他已知体验问题修复。

推送时间 / Rollout：12/1 国际 5%；12/3 10%；12/4 30%；12/8 80%；12/10 100%.

### 2026/01/06 · T50 Series · 1.123.127

优化内容：优化已知问题，提升用户体验 — Optimizations: known-issue fixes and experience improvements.
**内部** 地图不显示、Matter 无法使用已导入新版本，可引导升级 — Internal: map-not-showing and Matter-unusable fixes are included; guide users to upgrade.

## T50 Max Series

### 2025/10/24 · T50 Max Series · 1.61.0

普更 - 本次优化更新内容如下 / General rollout details：
1. 优化清洁顺序逻辑调整；使其更符合用户设置的房间顺序 — Cleaning-sequence logic now better follows the user's configured room order.
2. 优化门槛条识别性能 — Threshold-strip recognition performance.
3. 优化地毯边缘漏扫问题 — Carpet-edge missed-spot issue.
4. 修复其他已知问题，提升用户体验 — Other known-issue fixes.

## T80

### (未注明日期 / date not listed) · T80 · 1.36.0

版本记录，无详细更新说明 — Version listed for reference; no details in the source sheet.

### 2025/08/14–08/15 · T80 · 1.42.0

1. 修复预约清扫时，机器在非预约时间启动的异常 — Fixed the robot starting outside the scheduled window during scheduled cleaning.
2. 优化了清扫、回充和导航表现，提升门槛条识别准确度，减少漏扫情况 — Improved cleaning, docking and navigation; better threshold-strip recognition and fewer missed spots.
3. 修复其他已知问题，提升用户体验 — Other fixes.

推送计划 / Rollout：8/14 50% 国际普更；8/15 100% 国际普更。

### 2026/01/07–01/09 · T80 · 1.63.0

本次更新内容：修复已知问题，提升用户体验 — Known-issue fixes and experience improvements.
**内部** 如遇到地图不显示问题、打滑、水渍大问题等优先引导用户升级版本后使用 — Internal: for map not showing, wheel slipping, or large water stains, guide users to upgrade first.
推送 / Rollout：01/07 50% 国际普更；01/08 100% 国际普更；01/09 100% 国际强更。

## T90 Series

### 2026/03/20–03/31 · T90 Series · 1.79.0

修复已知问题，提升用户体验 — Known-issue fixes and experience improvements.
推送计划 / Rollout：3/20 10%；3/23 30%；3/25 50%；全推计划 3/31。

### 2026/05/09–05/13 · T90 Series · 1.87.0

此版本主要内容为市场问题修复以及体验提升，无新增功能 — Market-issue fixes and experience improvements; no new features.
1. 优化 APP 功能引导以及说明 — Optimized App guidance and descriptions.
2. "Agent Host" 变更为 "Agent Mode" — "Agent Host" renamed to "Agent Mode".
3. 语音功能优化 — Voice feature optimizations.
4. 优化避障表现 — Obstacle avoidance improvements.

版本推送计划 / Rollout：2026/5/9 50%；5/13 100%.

### 2026/06/03–06/10 · T90 Series · 1.93.0

**【新增功能】New features**
1. 地图编辑——玻璃门：支持手动在地图上添加玻璃门，添加后可有效减少碰撞并优化沿边清扫路径 — Map editing: glass doors can be added manually to reduce collisions and optimize edge-cleaning paths.
2. 地毯设置——地毯流苏避障：新增"地毯流苏避障"开关，精准识别并避开流苏，避免缠绕，APP 已增加引导提示。海外开关默认开启，若遇到流苏地毯误识别导致漏扫的情况，可引导用户关闭 — Carpet settings: carpet-fringe avoidance toggle; overseas default ON. If fringe rugs are misidentified causing missed spots, guide users to turn it OFF.

**【体验升级】Experience** 细节优化：修复多项已知问题，进一步提升系统运行稳定性与整体交互体验 — Detail fixes for stability and interaction.

### 2026/06/23–06/25 · T90 Series · 1.97.0

修复已知问题，提升整体用户体验。主要优化内容 — Known-issue fixes; main items:
1. 清洁序列问题 — Cleaning-sequence issue.
2. 门槛附近超声波传感器误触发问题 — Ultrasonic sensor false triggers near threshold strips.

推送计划 / Rollout：06/23 国际 10% 普更；06/25 国际 30% 普更。

### 2026/08/20 · T90 Series · 1.103.0

版本新功能：地图坡道设置——地图支持手动添加坡道，帮助地宝更顺畅地通过爬坡板与坡道地形 — New: ramp setup on the map to help the robot cross threshold ramps and slopes.
体验优化：修复已知问题，提升整体用户体验 — Experience fixes and improvements.

## T90S Series

### 2026/08/24–08/31 · T90S Series · 1.50.5

--- 仅供内部 / Internal only — HOT FIX ---
08/24 国内 10% 强更（为采集数据、提升升级率，当天推送走强更）— Domestic 10% mandatory (to collect data and raise the upgrade rate).
08/26 国内 30% 普更；08/28 国内 50% 普更；08/31 国内 100% 普更；08/28 国际 50% 普更；08/31 国际 100% 普更 — Domestic/international progressive rollout as listed.

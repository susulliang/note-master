# WINBOT Tilt-Angle Cleaning Capability Update (Multiple Models)

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
2. 实际是否可清洁，以窗宝识别判断为准；如果窗户角度不满足条件，设备会弹窗提醒并报警 — Always follow WINBOT's on-device judgement; it will alert and alarm if the angle is unsupported.
3. 即便人工判定角度处于支持区间，最终仍以机器自身检测结果为准 — Even if manual check shows the angle is within range, the robot's self-detection result takes priority.

*(Screenshots are available in the original Feishu message — image export was not authorized for these attachments.)*

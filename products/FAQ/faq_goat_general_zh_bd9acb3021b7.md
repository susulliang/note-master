---
category: "GOAT"
model: "General"
model_slug: "general"
lang: "zh"
source: "FAQ/GOAT/GOAT A & O 2026/【FAQ 2.0 User Side】O600 RTK & O800 RTK（O1000 RTK NA）25.12.31.xlsx"
source_sheet: "用户端"
source_row_id: ""
kind: faq
version: 1
---

# 禁区设置有哪些需要注意的？

## Question

禁区设置有哪些需要注意的？

## Answer

1. Number of No-Entry zones: There is no limit to the number of No-Entry zones; they can be flexibly set according to actual needs.
 2. No-Entry zone relationships:
 2.1 No-Entry zones support creating intersecting or overlapping areas to meet complex planning requirements.
 2.2 If the distance between No-Entry zone outlines, or between a No-Entry zone outline and the map outline, is less than 0.7m, a narrow path may form, potentially causing mowing to be missed in that area.
 3. Size Requirements: The minimum diameter of a No-Entry zone must be 50cm. If a No-Entry zone fails to close, check whether it is due to an overly small size setting.
 4. Closure Rule: No-Entry zones must form closed regions. To set linear No-Entry zones, remotely control the machine to its farthest point and then return along the same path to the starting point to complete the closure.
 5. Special Area Restrictions: The 2m radius around the station is the default GOAT recharge access zone. To ensure normal device recharge, avoid setting No-Entry zones near the station. Establishing large No-Entry zones directly in front of the station may prevent GOAT from returning to recharge.

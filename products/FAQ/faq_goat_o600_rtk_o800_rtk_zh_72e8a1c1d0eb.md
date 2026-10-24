---
category: "GOAT"
model: "O600 RTK & O800 RTK"
model_slug: "o600_rtk_o800_rtk"
lang: "zh"
source: "FAQ/GOAT/GOAT A & O 2026/【FAQ 2.0 User Side】O600 RTK & O800 RTK（O1000 RTK NA）25.12.31.xlsx"
source_sheet: "用户端"
source_row_id: ""
kind: faq
version: 1
---

# GOAT / O600 RTK & O800 RTK / ZH - 为什么GOAT出现部分区域漏割的情况？

## Question

为什么GOAT出现部分区域漏割的情况？

## Answer

1. Check for temporary obstacles blocking GOAT's path. If the obstacle area exceeds 1m in diameter, GOAT will automatically perform a re-cut. 2. Verify if AI recognition mode is enabled in the app settings. This mode may occasionally trigger false obstacle avoidance.
 3. Review obstacle avoidance mode settings in the app. An excessively low avoidance height may cause false avoidance, leading to missed areas.
 4. GOAT's obstacle clearance height is 3cm (laboratory data). Steps or surfaces exceeding this height cannot be traversed;
 5. GOAT cannot cut grass taller than 12cm. Overgrown grass may be identified as an obstacle. Ensure lawn grass is trimmed below 10cm;
 6. GOAT cannot climb slopes steeper than 24° (45%). Install physical barriers over 20cm tall around areas with slopes exceeding 24° (45%) and uneven terrain.
 7. If the map contains paths narrower than 0.7m (including narrow gaps between outer boundaries and No-Entry zone boundaries, or between No-Entry zones), GOAT will only mow back and forth once within that area.
 Regarding missed areas due to obstacles: After removing the obstacle, GOAT will automatically re-mow the missed area during its next mowing cycle.
 1. You may also use manual mode in the app to remotely guide GOAT to re-mow missed areas;
 2. Alternatively, add a Low-Avoidance Zone in the app. Visual obstacle avoidance will be disabled within this zone to enhance passability and reduce missed areas.

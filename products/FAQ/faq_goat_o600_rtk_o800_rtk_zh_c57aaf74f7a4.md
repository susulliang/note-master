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

# GOAT / O600 RTK & O800 RTK / ZH - 为什么地图上GOAT的位置与实际位置不符？

## Question

为什么地图上GOAT的位置与实际位置不符？

## Answer

1. Please confirm whether the GOAT has been moved or dragged. If no task is active, the app map will continue displaying the GOAT's pre-movement location.
2. If the GOAT is outside the station signal range when a task is initiated, acquiring its position may take time. During this period, the GOAT's location displayed in the app may be inaccurate.
3. If GOAT is in an area without RTK signal (e.g., shaded areas), it will automatically switch to visual sensor positioning to ensure mow performance. During this time, GOAT's position may show slight deviations.
If the above situations have been ruled out, please check:
1. Whether the GOAT camera is clean
2. Whether the RTK station is functioning normally
3. Whether current weather conditions are clear and rain-free
If the GOAT's position on the map remains incorrect after these steps, delete the existing map and rebuild it.

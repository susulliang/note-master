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

# 地图上标注的障碍物位置和形状与实际不符？

## Question

地图上标注的障碍物位置和形状与实际不符？

## Answer

1. The app does not update obstacle information in real time. Obstacle locations on the map are refreshed only after the next mow task is initiated.
 2. The map only marks obstacles detected by Running TOF during operation; obstacles identified by AI are not marked.
 3. Obstacles detected by Running TOF with a diameter less than 40cm are not marked on the map.
 4. GOAT has a certain probability of misidentification and cannot precisely map obstacle contours.

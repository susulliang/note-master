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

# GOAT / O600 RTK & O800 RTK / ZH - 使用沿边割草功能时，为什么GOAT 未完全按所选边缘割草？

## Question

使用沿边割草功能时，为什么GOAT 未完全按所选边缘割草？

## Answer

Due to positioning accuracy limitations, if No-Entry zones overlap with each other or with the outer contours of non-No-Entry areas, the system defaults to mowing all overlapping contours together. If the distance between different contours is less than 1 meter, GOAT may also identify them as overlapping and perform connected mowing on the relevant areas.

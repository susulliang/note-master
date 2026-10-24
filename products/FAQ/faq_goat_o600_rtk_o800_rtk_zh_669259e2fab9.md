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

# GOAT / O600 RTK & O800 RTK / ZH - 我抬起了GOAT，为何GOAT没有被立即锁定并告警？

## Question

我抬起了GOAT，为何GOAT没有被立即锁定并告警？

## Answer

1. Please verify if "Lift Alarm" is enabled in "Settings" - "More Settings" - "Security Settings". If disabled, lifting the GOAT will not trigger a prolonged alarm but only a standard alert.
 2. If lifted during Running, the GOAT will autonomously disengage for 10 seconds to prevent false triggers. After this timeout, it will automatically lock the machine and trigger an alarm.

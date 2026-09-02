---
category: GOAT
model: FAQ 2.0 User Side】O600 RTK & O800 RTK（O1000 RTK NA）25.12.31
model_slug: o600_rtk_o800_rtk_25_12_31
lang: en
source: FAQ/GOAT/GOAT A & O 2026/【FAQ 2.0 User Side】O600 RTK & O800 RTK（O1000 RTK NA）25.12.31.xlsx
source_sheet: 用户端
kind: faq
version: 1
---

# 使用沿边割草功能时，为什么GOAT 未完全按所选边缘割草？

> **产品线**：GOAT　**语言**：en
>

## 问题 / Question

使用沿边割草功能时，为什么GOAT 未完全按所选边缘割草？

## 答案 / Answer

4- 割草

受定位精度影响，若禁区之间、或禁区与区域外轮廓出现交叠，系统会默认将所有交叠的轮廓一并切割；若不同轮廓的间距小于 1 米，GOAT 也可能判定为交叠，并对相关区域进行连带切割。

Due to positioning accuracy limitations, if No-Entry zones overlap with each other or with the outer contours of non-No-Entry areas, the system defaults to mowing all overlapping contours together. If the distance between different contours is less than 1 meter, GOAT may also identify them as overlapping and perform connected mowing on the relevant areas.

---
category: "GOAT"
model: "GOAT O SERIES"
model_slug: "goat_o_series"
lang: "zh"
source: "FAQ/GOAT/GOAT A & O 2025/【FAQ】GOAT O SERIES 2.0.xlsx"
source_sheet: "Sheet1"
source_row_id: ""
kind: faq
version: 1
---

# GOAT / GOAT O SERIES / ZH - GOAT为何对一些障碍物进行了碰撞？

## Question

GOAT为何对一些障碍物进行了碰撞？

## Answer

The GOAT mainly relies on the front ToF sensor and AI vision for obstacle identification:
(1) The ToF obstacle avoidance feature currently supports 3 height levels (≥ 10 cm, ≥ 15 cm, ≥ 20 cm), and is unable to identify obstacles lower than 10 cm
(2) The ToF feature is unable to identify obstacles on both sides of or behind the GOAT.
(3) The ToF feature is not good at identifying black, white and transparent objects.
(4) Bumpy ground surfaces may affect ToF avoidance accuracy.
(5) Currently, the AI recognition feature can only identify a few obstacles, such as hedgehogs. This feature needs to be manually turned on in the App.
(6) The AI vision does not perform well in dim environments or on rainy days.

---
category: "GOAT"
model: "GOAT G1"
model_slug: "goat_g1"
lang: "en"
source: "FAQ/GOAT/GOAT HQ support faq basic data _20230214.xlsx"
source_sheet: "EN"
source_row_id: "G00099"
kind: faq
version: 1
---

# Why does the GOAT bump into some obstacles?

## Question

Why does the GOAT bump into some obstacles?

## Answer

The GOAT G1 mainly relies on the front ToF sensor and AI vision for obstacle identification:
(1) The ToF obstacle avoidance feature currently supports 3 height levels (≥ 10 cm, ≥ 15 cm, ≥ 20 cm), and is unable to identify obstacles lower than 10 cm
(2) The ToF feature is unable to identify obstacles on both sides of or behind the GOAT.
(3) The ToF feature is not good at identifying black, white and transparent objects.
(4) Bumpy ground surfaces may affect ToF avoidance accuracy.
(5) Currently, the AI recognition feature can only identify a few obstacles, such as hedgehogs. This feature needs to be manually turned on in the App.
(6) The AI vision does not perform well in dim environments or on rainy days.

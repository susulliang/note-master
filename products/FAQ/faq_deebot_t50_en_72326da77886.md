---
category: "DEEBOT"
model: "T50降配版"
model_slug: "t50"
lang: "en"
source: "FAQ/DEEBOT/T50降配版 FAQ 2.0（CN&EN）.xlsx"
source_sheet: "EN"
source_row_id: ""
kind: faq
version: 1
---

# DEEBOT / T50降配版 / EN - Why does the robot start searching for the base station shortly after beginning a mopping task?

## Question

Why does the robot start searching for the base station shortly after beginning a mopping task?

## Answer

This behavior depends on the robot's location relative to its base station:

1.If the robot is operating on the same floor as its base station, it will periodically return to wash the mop as part of its normal cleaning cycle.

2.If the robot has been manually moved to a different floor, its built-in water tank capacity and the water content of the mop are limited. After mopping for a certain period, the mop will become dry and dirty, and cleaning performance will decrease. When the robot detects this (or its water runs low), it will attempt to search for the base station to clean the mop and refill, even if the base is on another floor.

3.For optimal performance when cleaning multiple floors, it is recommended to use Vacuum mode on floors without the base station.

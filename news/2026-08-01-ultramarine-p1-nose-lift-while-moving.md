# UltraMarine P1 Frequently Lifts Its Nose While Moving

> Source: 知识点分享群 · Hoi · 2026-08-01

**Issue 问题：** 为什么 UltraMarine P1 在行走时频繁翘头（前部抬起）？
**Question:** Why does the UltraMarine P1 frequently lift its nose while moving?

目前分析原因可能有以下几个，根据用户描述针对性回复 / Based on the user's description, respond with the matching cause:

**1、程序崩溃 / Program crash**
现象 / Symptom: 机器在行走时频繁翘头，捞出后滤篮没有东西 / Robot frequently lifts its nose while moving; debris basket is empty when taken out.
措施/话术 / Action: 程序崩溃，确认机器固件版本为最新（V5.33.0），让用户重启后再次启动即可解决 / Program crash — confirm the firmware is the latest (V5.33.0); restarting the robot resolves it.

**2、滤篮堵塞 / Clogged debris basket**
现象 / Symptom: 机器行走过程中频繁翘头，捞出后滤篮被堵住/塞满 / Robot frequently lifts its nose while moving; the basket is clogged/full when taken out.
措施/话术 / Action: 泳池内污渍过多，超过了机器滤篮的承受能力，导致滤篮堵塞。及时捞出并清洗滤篮即可。若正处于开池季或泳池长时间未清理，池底积有厚重泥沙、落叶或药粉残留，建议先人工清理大块杂物，再由机器人完成后续的精细维护 / Too much debris in the pool has overloaded the basket. Remove and clean the basket promptly. If it is pool-opening season or the pool has not been cleaned for a long time, manually remove large debris (sand, leaves, chemical residue) first, then let the robot finish the fine cleaning.

**3、水泵不转 BUG / Water pump not spinning (bug)**
现象 / Symptom: 水泵不转，驱动电机正常运行、灯光蓝灯常亮 / Water pump does not spin; drive motors run normally and the blue light stays on.
措施/话术 / Action: V5.29.0 版本已解决，引导用户升级至最新固件版本 V5.33.0 / Fixed in V5.29.0 — guide the user to upgrade to the latest firmware V5.33.0.

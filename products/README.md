# Ecovacs Product Library

> 从 `带你3分钟搞定科沃斯产品.xlsx` 按工作表拆分的 Markdown 库。
> 每个 `.md` 文件对应一张 sheet，`01/02/…` 前缀对应原 xlsx 顺序。
> 合并单元格展开到每行每格；多层表头用真实的 merge 锚点去重后以 ` · ` 拼接。
> DEEBOT / WINBOT / GOAT 这类对比表在顶部的机型表头会自动被识别为**整表共享的 column header**，
> 每个“Appearance and Dimensions”“OMNI Station Functions”等分节都会沿用同一份机型表头，
> 避免把第 1 行指标（Color / Max Suction Power）错当成表头。

原始文件：`带你3分钟搞定科沃斯产品.xlsx`

## 工作表索引

- [DEEBOT 北美在售地宝型号对比](01-DEEBOT 北美在售地宝型号对比.md) （212 行 × 45 列，范围 A1:AS212）
- [GOAT 北美在售割草机型号对比](02-GOAT 北美在售割草机型号对比.md) （199 行 × 10 列，范围 A1:J199）
- [GOAT 割草机错误代码对照](03-GOAT 割草机错误代码对照.md) （204 行 × 6 列，范围 A1:F204）
- [WINBOT 北美在售窗宝型号对比](04-WINBOT 北美在售窗宝型号对比.md) （216 行 × 29 列，范围 A1:AC216）
- [机型与科学家代号 (仅内部)](05-机型与科学家代号 (仅内部).md) （218 行 × 20 列，范围 A1:T218）
- [全品类故障问题快查](06-全品类故障问题快查.md) （217 行 × 22 列，范围 A1:V217）
- [导航窗口](07-导航窗口.md) （215 行 × 28 列，范围 A1:AB215）
- [核心卖点](08-核心卖点.md) （209 行 × 5 列，范围 A1:E209）
- [核心技术参数](09-核心技术参数.md) （213 行 × 60 列，范围 A1:BH213）

## 规划用途

后续会在 TicketNotesPage 新增一个 **Product Lookup** gridbox：
按品类 / 机型 / 错误代码 / 卖点 / 技术参数快速筛选，
直接从这 9 份 Markdown 做全文匹配 + 标题索引。

## GBU (北美) — Sheet Index

Source: `史上最全GBU (北美).xlsx` — 49 sheets.

| # | Sheet | Output | Rows×Cols | Notes |
|---|---|---|---|---|
| 1 | Barcode | [`10_Barcode.md`](./10_Barcode.md) | 145×11 | SKU / model cross-reference + navigation index |
| 2 | Famibot LilMilo | [`11_Famibot_LilMilo.md`](./11_Famibot_LilMilo.md) | 171×9 |  |
| 3 | ULTRAMARINE P1 | [`12_ULTRAMARINE_P1.md`](./12_ULTRAMARINE_P1.md) | 114×6 |  |
| 4 | X12 Series | [`13_X12_Series.md`](./13_X12_Series.md) | 221×8 | Series spec comparison (multiple variants) |
| 5 | X11S Series | [`14_X11S_Series.md`](./14_X11S_Series.md) | 228×7 | Series spec comparison (multiple variants) |
| 6 | X11 Series | [`15_X11_Series.md`](./15_X11_Series.md) | 218×8 | Series spec comparison (multiple variants) |
| 7 | X9S PRO OMNI | [`16_X9S_PRO_OMNI.md`](./16_X9S_PRO_OMNI.md) | 152×8 | Series spec comparison (multiple variants) |
| 8 | X9 Pro OMNI | [`17_X9_Pro_OMNI.md`](./17_X9_Pro_OMNI.md) | 228×7 | Series spec comparison (multiple variants) |
| 9 | X8 Pro OMNI | [`18_X8_Pro_OMNI.md`](./18_X8_Pro_OMNI.md) | 225×8 | Series spec comparison (multiple variants) |
| 10 | X5 Pro OMNI | [`19_X5_Pro_OMNI.md`](./19_X5_Pro_OMNI.md) | 208×7 | Series spec comparison (multiple variants) |
| 11 | X2 OMNI | [`20_X2_OMNI.md`](./20_X2_OMNI.md) | 87×7 | Series spec comparison (multiple variants) |
| 12 | X2 Combo | [`21_X2_Combo.md`](./21_X2_Combo.md) | 105×7 | Series spec comparison (multiple variants) |
| 13 | W3 OMNI | [`22_W3_OMNI.md`](./22_W3_OMNI.md) | 205×8 | Series spec comparison (multiple variants) |
| 14 | W2S OMNI | [`23_W2S_OMNI.md`](./23_W2S_OMNI.md) | 128×8 | Series spec comparison (multiple variants) |
| 15 | W2S | [`24_W2S.md`](./24_W2S.md) | 128×7 | Series spec comparison (multiple variants) |
| 16 | W2 Pro OMNI | [`25_W2_Pro_OMNI.md`](./25_W2_Pro_OMNI.md) | 203×10 | Series spec comparison (multiple variants) |
| 17 | W2 Pro | [`26_W2_Pro.md`](./26_W2_Pro.md) | 91×7 | Series spec comparison (multiple variants) |
| 18 | Winbot MINI 2 | [`27_Winbot_MINI_2.md`](./27_Winbot_MINI_2.md) | 129×7 | Series spec comparison (multiple variants) |
| 19 | Winbot MINI | [`28_Winbot_MINI.md`](./28_Winbot_MINI.md) | 87×7 | Series spec comparison (multiple variants) |
| 20 | W2 OMNI | [`29_W2_OMNI.md`](./29_W2_OMNI.md) | 101×9 | Series spec comparison (multiple variants) |
| 21 | W1 Pro | [`30_W1_Pro.md`](./30_W1_Pro.md) | 93×6 | Series spec comparison (multiple variants) |
| 22 | GOAT A Series | [`31_GOAT_A_Series.md`](./31_GOAT_A_Series.md) | 52×8 | Series spec comparison (multiple variants) |
| 23 | GOAT O Series | [`32_GOAT_O_Series.md`](./32_GOAT_O_Series.md) | 65×7 | Series spec comparison (multiple variants) |
| 24 | GX-600 | [`33_GX-600.md`](./33_GX-600.md) | 44×7 | Series spec comparison (multiple variants) |
| 25 | T90 | [`34_T90.md`](./34_T90.md) | 152×20 | Series spec comparison (multiple variants) |
| 26 | T80S | [`35_T80S.md`](./35_T80S.md) | 147×9 | Series spec comparison (multiple variants) |
| 27 | T80 | [`36_T80.md`](./36_T80.md) | 228×7 | Series spec comparison (multiple variants) |
| 28 | T50S | [`37_T50S.md`](./37_T50S.md) | 210×7 | Series spec comparison (multiple variants) |
| 29 | T50 Max | [`38_T50_Max.md`](./38_T50_Max.md) | 202×10 | Series spec comparison (multiple variants) |
| 30 | T50 | [`39_T50.md`](./39_T50.md) | 135×18 | Series spec comparison (multiple variants) |
| 31 | T30S | [`40_T30S.md`](./40_T30S.md) | 124×9 | Series spec comparison (multiple variants) |
| 32 | T30S Combo | [`41_T30S_Combo.md`](./41_T30S_Combo.md) | 208×9 | Series spec comparison (multiple variants) |
| 33 | T30S PRO & T30S AI | [`42_T30S_PRO_and_T30S_AI.md`](./42_T30S_PRO_and_T30S_AI.md) | 128×11 | Series spec comparison (multiple variants) |
| 34 | T30C SE | [`43_T30C_SE.md`](./43_T30C_SE.md) | 204×6 | Series spec comparison (multiple variants) |
| 35 | T30C | [`44_T30C.md`](./44_T30C.md) | 208×7 | Series spec comparison (multiple variants) |
| 36 | X1 OMNI&TURBO | [`45_X1_OMNIandTURBO.md`](./45_X1_OMNIandTURBO.md) | 69×8 | Series spec comparison (multiple variants) |
| 37 | X1 PLUS | [`46_X1_PLUS.md`](./46_X1_PLUS.md) | 66×6 | Series spec comparison (multiple variants) |
| 38 | T20 OMNI | [`47_T20_OMNI.md`](./47_T20_OMNI.md) | 68×6 | Series spec comparison (multiple variants) |
| 39 | T10 OMNI | [`48_T10_OMNI.md`](./48_T10_OMNI.md) | 66×6 | Series spec comparison (multiple variants) |
| 40 | T10 PLUS | [`49_T10_PLUS.md`](./49_T10_PLUS.md) | 64×6 | Series spec comparison (multiple variants) |
| 41 | N30 Pro OMNI | [`50_N30_Pro_OMNI.md`](./50_N30_Pro_OMNI.md) | 116×15 | Series spec comparison (multiple variants) |
| 42 | N20,N20e+,N20Pro+ | [`51_N20_N20e_N20Pro.md`](./51_N20_N20e_N20Pro.md) | 206×16 | Series spec comparison (multiple variants) |
| 43 | N10 | [`52_N10.md`](./52_N10.md) | 72×6 | Series spec comparison (multiple variants) |
| 44 | N8&N8 PRO&T9 | [`53_N8andN8_PROandT9.md`](./53_N8andN8_PROandT9.md) | 79×11 | Series spec comparison (multiple variants) |
| 45 | T8&T8AiVi&U2&U2 PRO | [`54_T8andT8AiViandU2andU2_PRO.md`](./54_T8andT8AiViandU2andU2_PRO.md) | 80×7 | Series spec comparison (multiple variants) |
| 46 | OZMO | [`55_OZMO.md`](./55_OZMO.md) | 66×21 | OZMO legacy lineup comparison |
| 47 | Deebot | [`56_Deebot.md`](./56_Deebot.md) | 62×25 | Legacy Deebot spec comparison (many models) |
| 48 | AES | [`57_AES.md`](./57_AES.md) | 30×6 | Auto-Empty Station accessory |
| 49 | EOLed-Deebot | [`58_EOLed-Deebot.md`](./58_EOLed-Deebot.md) | 62×14 | Discontinued / EOL models |

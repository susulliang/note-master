# Email Issue Type — Entry & QA Scoring Rule Change

> Source: 流程相关 · Hoi · 2026-10-10

**Policy 政策通知：** Email 渠道 issue type 录入规则和对应质检评分规则调整通知。

**Background 背景：** AI Summary 推荐 issue type（英文）功能上线。/ AI Summary now recommends the issue type (English channel).

**Timeline 时间安排：** 过渡时间 10.09 - 10.15；评分正式开始时间 10.16。/ Transition Sep 29 - Oct 15 window is Oct 9-15; QA scoring officially starts October 16.

**1. 录入和评分逻辑 / Entry & scoring logic**

- 录入规则：Email 渠道 case，CC 可参考 AI Summary 推荐的 issue type 直接录入系统。/ Entry rule: for Email cases, CCs may enter the issue type suggested by AI Summary.
- 注意事项：随着和客户沟通交互的信息更清晰明朗，AI Summary 推荐的 issue type 会根据客户最新描述发生变化，请 CC 按照 AI Summary 最新推荐录入/修改。/ The recommendation updates as the conversation clarifies — always follow the LATEST AI Summary suggestion.
- 评分逻辑：质检抽检时案例状态是 Closed，理论上 AI Summary 推荐的结果不会再更新。整体评分逻辑：对标系统中 CC 录入的 issue type 和 AI Summary 最后一次推荐的内容是否一致——若一致，视为正确；若不一致，视为录入有误。/ Scoring: when QA samples a Closed case, the CC-entered issue type is compared with the LAST AI Summary recommendation — match = correct, mismatch = entry error.

**2. 适用范围 / Scope**

- 目前 AI Summary 的 issue type 推荐功能仅 Email 渠道 case 适用；Chat 和 Call 渠道的人工录入评分规则不变。/ The AI Summary recommendation applies to Email cases only; Chat and Call scoring rules are unchanged.
- 目前暂无此功能的语种地区（如日韩），人工录入的评分规则不变，待功能上线后再进行调整。/ Regions without the feature (e.g. JP/KR) keep the manual-entry scoring rules until it launches.

**3. 特殊情况 / Edge cases**

- 若 AI Summary 因任何原因没有生成，还是按原来人工录入的评分规则。/ If AI Summary produced no recommendation, the original manual-entry scoring rules apply.
- 若 CC 提及案例处理时能看到 AI Summary 推荐的 issue type，案例关闭后看不到：质检按 AI Summary 报表的历史记录进行追溯——若无记录，参考原来人工录入的评分规则；若有记录且 CC 录入与历史记录推荐一致，算正确；不一致，算录入有误。/ If the recommendation was visible during handling but not after closure, QA traces the AI Summary report history: no record → manual rules; record matches entry → correct; record differs → entry error.

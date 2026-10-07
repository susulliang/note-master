/**
 * Ecovacs NA Quality Assurance Standards (质检标准 V4)
 * Source: https://ecovacs.feishu.cn/sheets/XwvTskTP8hp3cytGMSWcsGygn0f (sheet 0cJsYz)
 *
 * Each dimension carries a weight (占比 %) and contains one or more assessment
 * items (考核项) with a point score (得分), a detailed explanation, and the
 * common deduction points observed in Dec 2024. Both the original Chinese text
 * and an American corporate English translation are provided.
 */

export interface QaItem {
  /** Assessment item name (考核项) */
  item: string;
  /** Point score (得分) */
  score: number;
  /** Detailed explanation (详细解读) */
  detail: string;
  /** Common deduction points (常见扣分点) — empty string means "暂无 / None" */
  deductions: string;
  /** Bonus scenarios (加分情景) — only on 优秀加分项目 items; rendered in an
   *  emerald "bonus" box instead of the red deduction box. */
  note?: string;
}

export interface QaDimension {
  /** Dimension name (质检维度) */
  dimension: string;
  /** Weight percentage, e.g. "20%" (占比) */
  weight: string;
  items: QaItem[];
}

export interface QaStandard {
  lang: 'zh' | 'en';
  title: string;
  subtitle: string;
  dimensions: QaDimension[];
}

/* -------------------------------------------------------------------------- */
/*                              Chinese (ZH)                                  */
/* -------------------------------------------------------------------------- */

export const QA_ZH: QaStandard = {
  lang: 'zh',
  title: '质检标准 V4',
  subtitle: 'Ecovacs NA · 2024年12月版',
  dimensions: [
    {
      dimension: '问题定位',
      weight: '20%',
      items: [
        {
          item: '概括 & 挖掘客户诉求',
          score: 10,
          detail:
            '1、若客户情况复杂或表述欠清晰，agent在提供解决方案前需概括在问题定位阶段获得的关键信息，以保证Agent对客户情况的全面理解。\n' +
            '2、了解必要信息，用于为客户提供合适的解决方案。如客户地图丢失，可先了解客户是否有改变基站位置等情况出现。\n' +
            '3、在获得必要信息后（如来电号码、邮箱等）需查阅过往历史记录，核实客户是否就同一问题进行咨询。',
          deductions:
            '1. 重复询问（例如客户已经提供过POP，agent又再次索要POP）\n' +
            '2. 缺少探寻必要信息（例如客户说自己尝试过清洁senser，同事就默认客户已经做过所有的TBS，就不再探寻直接建议维修）',
        },
        {
          item: '提问清晰易懂且有逻辑性',
          score: 10,
          detail:
            '1、用通俗易懂的方式和清晰明了的表达进行提问（如客户对技术不清晰，避免使用专业术语）。\n' +
            '2、提问的内容是基于客户的情况和回应的，并且整个探索过程的提问层层递进，逻辑清晰。\n' +
            '3、仅询问必要、相关的信息。',
          deductions: '暂无',
        },
      ],
    },
    {
      dimension: '业务知识',
      weight: '30%',
      items: [
        {
          item: '提供正确的解决方案',
          score: 15,
          detail:
            '1、恰当的遵循颁布的知识体系做解答，告知客户问题原因、具体操作、后续流程等。\n' +
            '2、查看具体信息，如订单号、客户账户、历史联系记录等，向客户提供的合适的解决方案。\n' +
            '3、基于客户的问题给予相关风险的必要提醒/引导。（如退款需告知客户时效等）\n' +
            '4、不遗漏客户问题，针对客户问题给予明确解答。（如客户咨询3个问题，但客服只回复了其中1-2个问题，则-15分）--2024/11/21更新\n' +
            '**提供解决方案需有针对性，避免将已知、不适用的情况，再次发给客户（如，客户基站无法充电，历史邮件或在线热线沟通中客户表示已检查过插座工作正常，agent在回复客户邮件时无将marco中的"确认插座是否正常工作"的步骤删除）。-10分\n' +
            '**方案正确但不完整，-10分**',
          deductions:
            '1. 回答错误（N20e and N20同一个型号的机器、加拿大官网没有升级计划、Y1 PRO PLUS是Yeedi的机器、清洁液的比例有误等）提供了与我们找到的现有知识体系不一样的信息；\n' +
            '2. 方案正确但不完整\n' +
            '3. 未做必要提醒（reset前没有提醒客户数据会清除）\n' +
            '4. 无效解决方案（提供错的物流信息）\n' +
            '5. 未提供故障诊断步骤（先询问了产品的购买信息，确定过保之后直接就引导客户去besender了）\n' +
            '6. Marco未删除不适用字段（例如早期机器没有水箱，TBS中要求移除水箱的步骤未删除）',
        },
        {
          item: '按正确SOP处理问题',
          score: 15,
          detail:
            '1、在规定时间内完成跟进，催单或回复。如，邮件需要在1个工作日内响应客户；\n' +
            '2、按规范接手，转交，升级，处理邮件、工单等。（包括需跟进、合并工单、升级技术、高危、特殊等）',
          deductions: '1. 未按流程处理工单（升级case的时候缺少了必要信息，其他国家咨询未按流程处理）',
        },
      ],
    },
    {
      dimension: '沟通表达',
      weight: '25%',
      items: [
        {
          item: '适时表达同理心',
          score: 5,
          detail:
            '倾听客户的表达，对客户处境表现出感同身受（积极和消极），避免机械化和无效的表达。根据客户沟通的实际情况，解决客户的疑虑，恰当安抚客户情绪。' +
            '(如，客户情绪激动，多次催促维修进度；agent回复邮件仅用Marco中的"Thank you so much for your patience."，这不算有效安抚，视为机械化表达。）',
          deductions: '没有表达同理心',
        },
        {
          item: '良好的语言逻辑',
          score: 10,
          detail:
            '1、表达内容通俗易懂，不存在歧义；若引起客户错误理解，及时调整。\n' +
            '2、不使用说内部的名称缩写与客户沟通。如：DTC等。\n' +
            '3、文字运用：出现口误、错别字、缺字漏字、语法错误（少于三处且不影响客户理解）。\n' +
            '4、讲解方式灵活，客户出现不解时及时转换表达方式，和客户快速达成一致。\n' +
            '5、不能得使用服务禁语。（如"it\'s a known issue"）--2024/10/1开始执行',
          deductions: '表达有歧义（例如告知客户会提供额外90天的保修）',
        },
        {
          item: '沟通礼节',
          score: 10,
          detail:
            '热线适用：\n' +
            '1、询问并礼貌称呼客户（整个通话中至少称呼客户2次）。\n' +
            '2、hold线前需征得客户同意，hold线后需感谢客户耐心等待。单次hold线时长请控制2分钟内（日本团队：3分钟内）。\n' +
            '3、积极聆听客户，并第一时间积极响应（客户进行后5秒内响应客户，沟通中5秒内给以客户响应）客户问题。（2024/9/24新增）发生以下场景时，不作扣分处理：\n' +
            '① 因系统异常导致听不清楚/没听到客户声音。（前提是需要告知客户"由于系统原因，听不到您的声音，您可以再说一遍吗？"，同时该问题发生时需要和TL/T2报备。）\n' +
            '② 客户需要离开寻找资料或同步操作排障步骤的过程中自言自语，但当客户回来时，agent需在5s内及时响应客户。\n' +
            '4、使用标准的开头语和结束语。\n\n' +
            '在线适用：\n' +
            '1、积极聆听客户，并第一时间积极响应客户问题。（客户进线后10秒内响应客户，沟通中25秒内响应客户）\n' +
            '2、hold线前需征得客户同意，hold线后需感谢客户耐心等待。单次hold线时长请控制在2分钟内。\n' +
            '3、如若仍需要继续Hold线，需在规定控制时间内与客户说明并征得客户同事才能进行再次Hold 线。\n' +
            '4、使用标准的开头语和结束语。\n' +
            '5、不得使用表情符号、颜文字等，避免引起客户误解。\n\n' +
            '邮件适用：\n' +
            '1、应有恰当的称呼和落款。邮件回复时参照客户邮件里落款的名字，称呼客户为Dear XXX，首字母需大写。\n' +
            '2、使用统一的字体、字号和颜色回复客户，重点内容使用加粗、放大字体等方式引起客户关注。\n' +
            '3、段落分明，合理使用项目符号、编号等进行内容排版，增强邮件的可读性。\n' +
            '4、在收到客户邮件后，应在24小时内给予首次回复。（若出现运营积压等情况，则时当时情况约定的回复时间进行考核）\n\n' +
            '全渠道适用：\n' +
            '1、客户致谢时，礼貌回应。（如：感谢您的认可，很高兴能为您服务，如有任何其他需求，随时联系我们。）\n' +
            '2、使用服务敬语。如：您，请等。过程中需及时给客户响应。且hold线前需征得客户同意，hold线后需感谢客户耐心等待。',
          deductions:
            '1. 不问、完全不称呼、仅称呼1次（强调需要询问客户如何称呼，然后用客户提供的称呼，称呼客户至少2次，例如客户叫做Jason，那么至少2次称呼客户为Jason才算）\n' +
            '2. dead air（没有回应客户，强调这里是回应，不是回答，使用句子、词语、语气助词进行回应都是一种回应）\n' +
            '3. 保留前后的服务用语\n' +
            '4. 结束语不完整\n' +
            '5. 打断客户',
        },
      ],
    },
    {
      dimension: '操作技能',
      weight: '15%',
      items: [
        {
          item: '及时、完整、准确地记录会话信息',
          score: 15,
          detail:
            '1、准确记录会话过程中客户提及到的每一项必要信息。（如购买时间、机型等）\n' +
            '2、准确选择issue type。（若无准确选项，则选择最相近的，但一级类目不必须一致。）\n' +
            '3、规范生成case，每一个会话对应一个case；对于同一问题的咨询正确对case进行合并。\n' +
            '4、每次处理case后必须记录internal note，便于后续快捷跟进客户问题。',
          deductions:
            '1. 产品信息选择错误（型号、购买日期选错、购买信息无录入）\n' +
            '2. 漏记必要信息（call note/internal note不完整）\n' +
            '3. issue type选择错误（强调有最贴切的必须选择最贴切的）',
        },
      ],
    },
    {
      dimension: '风险意识',
      weight: '10%',
      items: [
        {
          item: '风险意识',
          score: 10,
          detail:
            '1、高风险case需及时上报并积极跟进。\n' +
            '2、如有必要通过电话等途径主动与客户联系。\n\n' +
            '处理Case过程中若出现以下问题则agent需进行电话跟进，减少差评风险。具体情况如下：\n' +
            '1，客户表示已多次邮件联系，但一直未收到回复，但在系统中没有找到客户多次发送的邮件记录；\n' +
            '2，客户在邮件表示要求电话联系2次或以上；\n' +
            '3，客户有严重投诉倾向或情绪非常激动；\n' +
            '4，case来回沟通超过一个月且问题一直未解决的。',
          deductions: '暂无',
        },
      ],
    },
    {
      dimension: '优秀加分项目',
      weight: '加分项',
      items: [
        {
          item: '多一点提醒',
          score: 5,
          detail:
            '主动提供咨讯&建议：积极提供客户需要的信息，或采取措施以避免未来可能出现的问题，避免客户再次来电。',
          deductions: '',
          note:
            '加分项将直接在抽检评分总分中加分。（2024/9/24新增）具体加分情景包括但不仅限：\n' +
            '① 减少或阻止资损，如运用业务知识和软技巧等成功将客户退款的诉求转化为换机，或退换/换机的诉求转化为维修。\n' +
            '② 解决客户投诉或阻止投诉升级，如客户表示已经到发起lawsuit，agent运用业务知识解决客户问题并令客户成功撤诉。\n' +
            '③ 收到客户的表扬信。',
        },
        {
          item: '多一点微笑',
          score: 5,
          detail:
            '当客户出现抱怨、消极等情绪时，保持乐观积极，同时感染客户，带给客户正能量。',
          deductions: '',
        },
        {
          item: '多一点挖掘',
          score: 5,
          detail:
            '针对客户遇到的问题，通过多种方式探寻客户的意图，从而进一步选择更可行方案，或者记录需求反馈产品、流程优化。',
          deductions: '',
        },
        {
          item: '维护科沃斯品牌形象',
          score: 20,
          detail:
            '面对客户质疑（包括对科沃斯的产品、人员、合作方等）时巧妙解释，维护科沃斯形象，扭转客户对品牌的看法。（如客户怀疑偏向品牌等问题）',
          deductions: '',
        },
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/*                         English (EN) — American corporate                  */
/* -------------------------------------------------------------------------- */

export const QA_EN: QaStandard = {
  lang: 'en',
  title: 'Quality Assurance Standards V4',
  subtitle: 'Ecovacs NA · December 2024 Edition',
  dimensions: [
    {
      dimension: 'Issue Identification',
      weight: '20%',
      items: [
        {
          item: 'Summarize & Uncover Customer Needs',
          score: 10,
          detail:
            '1. When the customer\u2019s situation is complex or unclear, the agent must summarize the key information gathered during issue identification before proposing a solution, to confirm a complete understanding of the customer\u2019s situation.\n' +
            '2. Gather the information needed to provide an appropriate solution. For example, if the customer\u2019s map is lost, first check whether the base station was recently relocated.\n' +
            '3. Once the necessary information is obtained (such as phone number or email), review past interaction history to verify whether the customer has contacted us about the same issue before.',
          deductions:
            '1. Asking for information repeatedly (e.g., the customer already provided proof of purchase, but the agent requests it again).\n' +
            '2. Failing to probe for necessary information (e.g., the customer says they already tried cleaning the sensor, and the agent assumes all troubleshooting was done and jumps straight to suggesting repair without further probing).',
        },
        {
          item: 'Ask Clear, Understandable, and Logical Questions',
          score: 10,
          detail:
            '1. Ask questions in plain, easy-to-understand language. If the customer is unfamiliar with technical details, avoid using technical jargon.\n' +
            '2. Questions should be based on the customer\u2019s situation and responses, and the entire probing process should be progressive and logically structured.\n' +
            '3. Only ask for necessary and relevant information.',
          deductions: 'None',
        },
      ],
    },
    {
      dimension: 'Product Knowledge',
      weight: '30%',
      items: [
        {
          item: 'Provide Correct Solutions',
          score: 15,
          detail:
            '1. Follow the published knowledge base appropriately when answering, and inform the customer of the root cause, specific steps, and next steps.\n' +
            '2. Review specific details such as order number, customer account, and past contact history to provide an appropriate solution.\n' +
            '3. Provide necessary risk reminders/guidance based on the customer\u2019s issue (e.g., for refunds, inform the customer of the processing timeline).\n' +
            '4. Do not omit any of the customer\u2019s questions; address each one clearly. (If the customer asks 3 questions but the agent only answers 1\u20132, deduct 15 points.) \u2014 Updated 2024/11/21.\n' +
            '** Solutions must be targeted. Do not resend known, inapplicable steps to the customer (e.g., the customer\u2019s base station cannot charge, and in past emails or chat the customer confirmed the outlet works fine; the agent fails to remove the \u201cverify the outlet is working\u201d step from the macro). \u221210 points.\n' +
            '** Solution correct but incomplete: \u221210 points.',
          deductions:
            '1. Incorrect answers (e.g., stating N20e and N20 are the same model, that the Canadian website has no upgrade plan, that Y1 PRO PLUS is a Yeedi machine, or giving the wrong cleaning solution ratio) \u2014 providing information inconsistent with the published knowledge base.\n' +
            '2. Solution correct but incomplete.\n' +
            '3. Missing necessary reminders (e.g., not warning the customer that data will be erased before a reset).\n' +
            '4. Invalid solutions (e.g., providing incorrect shipping information).\n' +
            '5. No troubleshooting steps provided (e.g., asking for purchase info, determining the unit is out of warranty, and immediately directing the customer to a third-party repair center).\n' +
            '6. Failing to remove inapplicable fields from macros (e.g., older units have no water tank, but the troubleshooting step to remove the water tank is not deleted).',
        },
        {
          item: 'Handle Cases per the Correct SOP',
          score: 15,
          detail:
            '1. Complete follow-ups, escalations, or replies within the required timeframe. For example, emails must be responded to within 1 business day.\n' +
            '2. Take over, transfer, escalate, and process emails/tickets according to standard procedures (including follow-ups, ticket merging, technical escalation, high-risk, and special-case handling).',
          deductions:
            '1. Not processing tickets per the workflow (e.g., missing required information when escalating a case, or not following the workflow for inquiries from other countries).',
        },
      ],
    },
    {
      dimension: 'Communication Skills',
      weight: '25%',
      items: [
        {
          item: 'Express Empathy at the Right Time',
          score: 5,
          detail:
            'Listen to the customer and demonstrate genuine empathy for their situation (both positive and negative), avoiding mechanical or ineffective expressions. Based on the actual conversation, address the customer\u2019s concerns and appropriately de-escalate their emotions. ' +
            '(For example, if the customer is upset and repeatedly pressing for a repair update, the agent\u2019s email reply that only uses the macro line \u201cThank you so much for your patience.\u201d does not count as effective reassurance and is considered a mechanical expression.)',
          deductions: 'No empathy expressed',
        },
        {
          item: 'Clear and Logical Language',
          score: 10,
          detail:
            '1. Expressions should be easy to understand and unambiguous; if the customer misunderstands, adjust promptly.\n' +
            '2. Do not use internal abbreviations when communicating with the customer (e.g., DTC).\n' +
            '3. Written communication: avoid slips of the tongue, typos, missing characters, or grammatical errors (fewer than three occurrences that do not affect the customer\u2019s understanding).\n' +
            '4. Be flexible in how you explain things; switch your approach when the customer is confused so you can quickly reach a shared understanding.\n' +
            '5. Do not use prohibited service language (e.g., \u201cit\u2019s a known issue\u201d). \u2014 Effective 2024/10/1.',
          deductions:
            'Ambiguous expressions (e.g., telling the customer they will receive an additional 90 days of warranty).',
        },
        {
          item: 'Communication Etiquette',
          score: 10,
          detail:
            'Phone (Hotline):\n' +
            '1. Ask for and address the customer by name (at least twice during the call).\n' +
            '2. Obtain the customer\u2019s consent before placing them on hold, and thank them for their patience after resuming. Each hold should be kept under 2 minutes (3 minutes for the Japan team).\n' +
            '3. Listen actively and respond promptly (within 5 seconds of the customer speaking, and within 5 seconds during the conversation). (Added 2024/9/24) No deduction applies in the following scenarios:\n' +
            '\u2460 System issues prevent hearing the customer clearly. (You must tell the customer: \u201cDue to a system issue, I cannot hear you. Could you please repeat that?\u201d and report it to the TL/T2.)\n' +
            '\u2461 The customer steps away to find materials or performs troubleshooting steps while talking to themselves; when they return, the agent must respond within 5 seconds.\n' +
            '4. Use standard opening and closing greetings.\n\n' +
            'Live Chat:\n' +
            '1. Listen actively and respond promptly to the customer\u2019s questions. (Respond within 10 seconds of the customer entering the chat, and within 25 seconds during the conversation.)\n' +
            '2. Obtain consent before placing the customer on hold, and thank them for their patience after resuming. Each hold should be kept under 2 minutes.\n' +
            '3. If another hold is needed, inform the customer within the time limit and obtain their consent before placing them on hold again.\n' +
            '4. Use standard opening and closing greetings.\n' +
            '5. Do not use emojis or kaomoji to avoid customer misunderstanding.\n\n' +
            'Email:\n' +
            '1. Use an appropriate salutation and sign-off. When replying, address the customer as \u201cDear [Name]\u201d using the name from the customer\u2019s email signature, with the first letter capitalized.\n' +
            '2. Use a consistent font, size, and color when replying; use bold or larger fonts for key information to draw the customer\u2019s attention.\n' +
            '3. Organize content into clear paragraphs, using bullet points and numbering to improve readability.\n' +
            '4. Reply to the customer\u2019s email within 24 hours for the first response. (If there is an operational backlog, the agreed response time applies.)\n\n' +
            'All Channels:\n' +
            '1. When the customer expresses gratitude, respond politely (e.g., \u201cThank you for your kind words. I\u2019m glad I could help. Feel free to reach out anytime if you need further assistance.\u201d).\n' +
            '2. Use courteous language (e.g., \u201cyou,\u201d \u201cplease\u201d). Respond to the customer in a timely manner. Obtain consent before placing the customer on hold, and thank them for their patience after resuming.',
          deductions:
            '1. Not asking for the customer\u2019s name, not addressing them at all, or only addressing them once (the requirement is to ask how they prefer to be addressed, then use that name at least twice \u2014 e.g., if the customer is Jason, address them as Jason at least twice).\n' +
            '2. Dead air (not responding to the customer; note that \u201cresponding\u201d is not the same as \u201canswering\u201d \u2014 any sentence, word, or filler sound counts as a response).\n' +
            '3. Missing the standard opening and closing service phrases.\n' +
            '4. Incomplete closing remarks.\n' +
            '5. Interrupting the customer.',
        },
      ],
    },
    {
      dimension: 'Operational Skills',
      weight: '15%',
      items: [
        {
          item: 'Record Session Information Promptly, Completely, and Accurately',
          score: 15,
          detail:
            '1. Accurately record every piece of necessary information the customer mentions during the session (e.g., purchase date, model).\n' +
            '2. Select the correct issue type. (If no exact option exists, choose the closest match; the top-level category does not need to match.)\n' +
            '3. Generate cases properly: one case per session; correctly merge cases for the same issue.\n' +
            '4. After handling each case, always record an internal note for efficient follow-up.',
          deductions:
            '1. Incorrect product information selected (wrong model, wrong purchase date, missing purchase information).\n' +
            '2. Missing necessary information (incomplete call note / internal note).\n' +
            '3. Wrong issue type selected (when a best-fit option exists, the best-fit must be selected).',
        },
      ],
    },
    {
      dimension: 'Risk Awareness',
      weight: '10%',
      items: [
        {
          item: 'Risk Awareness',
          score: 10,
          detail:
            '1. High-risk cases must be escalated promptly and actively followed up.\n' +
            '2. If necessary, proactively contact the customer by phone or other means.\n\n' +
            'When any of the following occurs during case handling, the agent must follow up by phone to reduce the risk of negative feedback:\n' +
            '1. The customer states they have emailed multiple times but never received a reply, and no such email records are found in the system.\n' +
            '2. The customer requests to be contacted by phone two or more times in their email.\n' +
            '3. The customer shows a strong tendency to file a formal complaint or is highly emotional.\n' +
            '4. The case has been going back and forth for over a month without resolution.',
          deductions: 'None',
        },
      ],
    },
    {
      dimension: 'Bonus Points',
      weight: 'Extra credit',
      items: [
        {
          item: 'A Little Extra Heads-Up',
          score: 5,
          detail:
            'Proactively offer information & advice: actively provide the information the customer needs, or take steps to prevent potential future issues and save the customer a repeat call.',
          deductions: '',
          note:
            'Bonus points are added directly on top of the total inspection score. (Added 2024/9/24) Qualifying scenarios include, but are not limited to:\n' +
            '① Reducing or preventing financial loss — e.g., using product knowledge and soft skills to successfully convert a refund request into a replacement, or a return/replacement request into a repair.\n' +
            '② Resolving a complaint or stopping its escalation — e.g., the customer mentions they are about to file a lawsuit, and the agent uses product knowledge to resolve the issue so the customer withdraws it.\n' +
            '③ Receiving a written compliment from the customer.',
        },
        {
          item: 'A Little Extra Smile',
          score: 5,
          detail:
            'When the customer shows frustration or negativity, stay optimistic and positive — lift the mood and bring good energy to the customer.',
          deductions: '',
        },
        {
          item: 'A Little Extra Digging',
          score: 5,
          detail:
            'Explore the customer\u2019s underlying intent through multiple angles to land on a more workable solution, or log product/process improvement feedback.',
          deductions: '',
        },
        {
          item: 'Uphold the Ecovacs Brand Image',
          score: 20,
          detail:
            'When the customer questions Ecovacs (its products, staff, or partners), respond tactfully, defend the brand\u2019s image, and turn the customer\u2019s perception around (e.g., the customer suspects the agent is siding with the brand).',
          deductions: '',
        },
      ],
    },
  ],
};

export const QA_STANDARDS: Record<'zh' | 'en', QaStandard> = { zh: QA_ZH, en: QA_EN };

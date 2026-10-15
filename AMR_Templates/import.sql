CREATE TABLE IF NOT EXISTS amr_templates (
  id TEXT PRIMARY KEY,
  folder TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566UTEAY', 'AMR Email Templates', '1st response for email', '第一封邮件回复', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out to Ecovacs Robotics.&nbsp;</p>

<p>To help us resolve the issue, could you kindly confirm if you''ve already followed the troubleshooting steps outlined below?&nbsp;</p>

<p>Additionally, in order to investigate the matter further, we would greatly appreciate it if you could provide any relevant <strong>videos </strong>or <strong>screenshots </strong>that clearly show the issue. This will help us better understand the situation.</p>

<p>For quality assurance purposes, we also ask that you provide <strong>proof of purchase</strong>. This should include the order number, the date of purchase, the channel from which the purchase was made (such as the website or a retailer), and the model of your device.</p>

<p>If you have any questions or need further assistance, please don''t hesitate to reach out. We''re here to help!</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566W5EAI', 'AMR Email Templates', '2nd response for email', '第二封邮件回复', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>&nbsp;</p>

<p>Thank you for getting back to us.</p>

<p>We are sorry to hear that you are still experiencing issues with your Deebot. We are here to assist you in resolving this. To help us move forward, could you kindly confirm whether the following steps have already been checked:</p>

<p><span style="color:#c0392b;">[Insert Macro/Solution steps here]</span><br />
&nbsp;</p>

<p>If there''s anything else you need or if you have any further questions, please don''t hesitate to reach out. We''re more than happy to assist you further.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566XhEAI', 'AMR Email Templates', 'Macro1 - Collect info (Deebot)', '全新地宝从授权渠道购入享1年质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out to us regarding your machine.&nbsp;<br />
<br />
We provide a <strong>1-year warranty</strong> for a <strong>new </strong>ECOVACS <strong>Deebot </strong>purchased through our <strong>authorized </strong>resellers. If your machine is still within the warranty period, we''d be more than happy to offer warranty service for your unit.<br />
&nbsp;</p>

<p>To proceed with the warranty replacement, please provide the following information by replying to this email:</p>

<ul>
	<li><strong>Contact Information: </strong>Please include your <strong>full name </strong>(first and last), <strong>address </strong>(including the zip code and apartment/unit number if applicable), and <strong>contact number</strong>.<br />
	&nbsp;</li>
	<li><strong>Proof of Purchase: </strong>A screenshot showing the order number, date of purchase, original seller, machine condition, and model of the device.<br />
	<strong>&nbsp;</strong></li>
	<li><strong>Picture of the Deebot Serial Number</strong>: Located underneath the dustbin in the vacuum, starting with E0.</li>
</ul>

<div style="margin-left: 40px;"><img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image?oid=00D2x000005pVxV" style="max-width: 710.125px; width: 339.983px; height: 453.993px;" title="image" /></div>

<ul>
	<li><strong>Serial Number of the Base Station:</strong> Located at the back of the unit, near the adapter port with the barcode.</li>
</ul>

<div style="margin-left: 40px;"><img alt="image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_1?oid=00D2x000005pVxV" style="max-width: 710.125px; width: 331.979px; height: 440px;" title="image (1)" /></div>

<ul>
	<li><strong>Visual Documentation: </strong>A short video or screenshot of the issue to help us diagnose, replicate, and troubleshoot the problem.</li>
</ul>

<p><br />
<i>Once we have the requested information, we''ll be happy to guide you through the next steps accordingly.</i></p>

<p><br />
Should you have any questions or require further assistance, please do not hesitate to reply to this email or contact us.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566ZJEAY', 'AMR Email Templates', 'Close ticket (Rating)', '', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>&nbsp;</p>

<p>Thank you for keeping us informed!</p>

<p>We''re delighted to hear that the issue has been resolved. If you ever need further assistance, please don''t hesitate to reach out—we''re always here to help. We''d also greatly appreciate it if you could share your recent Ecovacs experience. Your feedback inspires us to keep improving and ensures we provide the best possible service.</p>

<p>Thank you once again for your support. We truly value your trust in Ecovacs!</p>

<p><i>*** Tips: To help you get the most out of your DEEBOT, here are some reference tutorial videos:</i></p>

<ul>
	<li><strong>X11</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-x11-omnicyclone">Click here</a></li>
	<li><strong>X9</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-x9-pro-omni">Click here</a></li>
	<li><strong>X8</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-x8-pro-omni#service-video">Click here</a></li>
	<li><strong>X5</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-x5-pro-omni#service-video">Click here</a></li>
	<li><strong>T30S</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-t30s-combo-cordless-handheld-vacuum">Click here</a></li>
	<li><strong>X2 </strong>Series: <a href="https://help.ecovacs.com/us/support/deebot-x2-omni">Click here</a></li>
	<li><strong>X1</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-x1-omni-black">Click here</a></li>
	<li><strong>T80</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-t80-omni">Click here</a></li>
	<li><strong>T50 </strong>Series: <a href="https://help.ecovacs.com/us/support/deebot-t50-pro-omni">Click here</a></li>
	<li><strong>T50 </strong>Max Series: <a href="https://help.ecovacs.com/us/support/deebot-t50-max-pro-omni">Click here</a></li>
	<li><strong>T20</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-t20-omni">Click here</a></li>
	<li><strong>T10</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-t10-plus">Click here</a></li>
	<li><strong>N30</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-n30pro-omni">Click here</a></li>
	<li><strong>N20</strong> Series: <a href="https://help.ecovacs.com/us/support/n20-pro-plus">Click here</a></li>
	<li><strong>N10</strong> Series: <a href="https://help.ecovacs.com/us/support/deebot-n10-plus-white">Click here</a></li>
	<li><strong>GOAT O1000R</strong>: <a href="https://help.ecovacs.com/us/support/goat-o1000-rtk">Click here</a></li>
	<li><strong>GOAT A2500R</strong>: <a href="https://help.ecovacs.com/us/support/goat-a2500-rtk">Click here</a></li>
	<li><strong>GOAT A3000L</strong>: <a href="https://help.ecovacs.com/us/support/goat-a3000-lidar">Click here</a></li>
</ul>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566avEAA', 'AMR Email Templates', 'Macro2 - No Need to Return Original Machine', '**不**需要寄回的旧机器需要满足： 1）**不是**X2、X5、X8、X9、X11、T30、T50、T80、GOAT 1000、2500、3000； 2）购买日至联系CC的时间大于9个月。', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for providing the required information.&nbsp;</p>

<p>We''re pleased to inform you that your replacement request has been successfully submitted.<br />
&nbsp;</p>

<p>✨ <strong>What to Expect Next</strong></p>

<p><strong>Replacement Process</strong></p>

<ul>
	<li>We will process your replacement and ship it as quickly as possible.</li>
	<li>You will receive an email with your tracking number within <strong>5-7 business days</strong> after we receive your information.</li>
	<li>Once shipped, your replacement typically arrives within <strong>5-10&nbsp;business days</strong>, though delivery times may vary based on your location.</li>
</ul>

<p><strong>Your Current Unit</strong></p>

<ul>
	<li><strong>No need to return it</strong>! You are welcome to keep, donate, or dispose of it at your discretion.</li>
</ul>

<p><strong>Warranty Details</strong></p>

<ul>
	<li>The replacement unit will carry over the <strong>remaining warranty period of your original machine</strong> or be covered for <strong>90 days</strong>, whichever is longer.</li>
</ul>

<p>Thank you again for your cooperation. If you have any further questions or need additional assistance, please don''t hesitate to reach out to us.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566cXEAQ', 'AMR Email Templates', 'Macro 4 - Inform Tracking#', '告知用户所换机器的物流。', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p><br />
We appreciate your patience.<br />
<br />
We are pleased to share the tracking number for your replacement unit: <strong>[Tracking Number]</strong>. You may click the link below to view the most up-to-date status of your shipment.</p>

<p><strong>[link]</strong></p>

<p>We sincerely appreciate your continued support and patience throughout this process. Should you have any further questions or require additional assistance, please do not hesitate to contact us—we are always here to help.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566e9EAA', 'AMR Email Templates', 'Macro 5 - Inform Label Status', '告知所安排回邮单的物流单号，以方便用户寄回原机器。', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p><br />
We would like to inform you that the <strong>return shipping label</strong> has been sent to you in a <strong>separate </strong>email. Please use this label to return your <strong>original </strong>unit.&nbsp;</p>

<p>Meanwhile, we are preparing your <strong>replacement unit </strong>for shipment and will share the tracking number with you as soon as it becomes available.</p>

<p>You may use the packaging from the replacement unit to return your original device. Alternatively, any sturdy box may be used, as long as the unit is well-protected with sufficient cushioning materials (such as foam, sponge, or newspaper) to ensure safe transit.</p>

<p>Please kindly note that the <strong><span style="color:#c0392b;">FedEx / Purolator</span> </strong>return label is <strong>valid for 14 days</strong> from the date of issuance, while the <strong>label download link will expire 5 days after you receive the email</strong>. After this period, the label will expire and can no longer be used.&nbsp;</p>

<p><i>To avoid any potential impact on your warranty coverage, we strongly recommend completing the return within this 14-day window.</i></p>

<p>If you have any questions or need further assistance, please feel free to contact us — we''re always happy to help.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566flEAA', 'AMR Email Templates', 'Macro 6 - Inform Replacement''s Tracking & Remind to Ship Original Machine', '提醒用户寄出原机器，并告知所换机器的物流单号。', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p><br />
We appreciate your continued patience.</p>

<p>We''re pleased to share the tracking number for your replacement unit: <strong>[Tracking Number]</strong>. You may click the link below to track the latest shipping status: <strong>[link]</strong></p>

<p>Additionally, we kindly remind you to return the original unit using the <span style="color:#c0392b;"><strong>FedEx / Purolator </strong></span>return label provided. If you did not receive the label, please let us know, and we''ll be happy to resend it.</p>

<p>Please note that the <strong>return label download link will expire in 5 days</strong>, and the <strong>return label itself is valid for 14 days from the date of issuance</strong>. We kindly ask that the return be completed within this 14-day period, as the label will expire afterward and can no longer be used.</p>

<p><i>To ensure continued warranty coverage and support, we strongly recommend returning the original unit before the label expires.</i></p>

<p>If you have any questions or need further assistance, please feel free to reach out—we''re here to help.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566hNEAQ', 'AMR Email Templates', 'Urge Return - Original Unit (Ultimatum)', '提醒用户原机器还未寄回，若不寄回，原机器和目前的机器保修都将作废。', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We noticed that the <strong>original </strong>unit has <strong>not </strong>yet been returned, and we''d like to follow up to see if there''s anything we can assist you with.</p>

<p>Please kindly note that the return label is valid for <strong>14 days</strong> from the date of issuance. We kindly remind you to return the original unit <strong>within this 14-day window</strong>, as the label will expire afterward and will no longer be usable.</p>

<p>Please also be aware that <strong>failure to return the original unit may result in the warranty becoming void for both the original and replacement devices</strong>.</p>

<p>If you have any questions or require any assistance, feel free to contact us—we''re happy to help.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000566izEAA', 'AMR Email Templates', 'Request Escalation (价保/耗材/功能配件/更高优惠券/Upgraded Model/Webstore Exchange', '用于在升级给DTC或AMR Tier 3前，给用户的回复', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>&nbsp;</p>

<p>Thank you for reaching out to us.</p>

<p>Your request for <span style="color:#c0392b;"><strong>Service Part /</strong> <strong>Function Part / Complimentary Consumables / Price Match /</strong> <strong>Replacement</strong> / <strong>Special Coupon</strong>&nbsp; <u><strong>(发送前请删除不适合的用词）</strong></u></span> has been forwarded to the relevant department for further confirmation and processing. The team will update you with further instructions or feedback as soon as possible.</p>

<p>We appreciate your patience and understanding. Please don''t hesitate to contact us if you need any additional support.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000567APEAY', 'AMR Email Templates', 'Besender', '对于购买凭证大于24个月的用户推荐BSD/IFR', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Dear {{{Recipient.FirstName}}},</p>

<p>Upon careful review of your receipt, we regret to inform you that your Deebot is beyond the one-year warranty period. To ensure a thorough diagnosis, we recommend sending the machine to a professional inspection service. In light of this, we are pleased to provide you with a referral to Besender.</p>

<p>Besender is the preferred vendor service center for Ecovacs Robotics AMR, staffed by highly skilled technicians devoted to ensuring expert servicing for your Deebot. They specialize in out-of-warranty repair services and replacement parts for Ecovacs Deebot robot vacuums. Every repair and part is supported by their exclusive 180-day warranty. Conveniently located in <i>California</i>, Besender is strategically positioned to meet your Deebot repair requirements with a combination of precision and professionalism.</p>

<p><i>Contact Information for Besender:</i><br />
<strong>Email:</strong> <a href="mailto:service@besender.com">service@besender.com</a><br />
<strong>Phone:</strong> +1 888-290-1685</p>

<p><strong>Website:</strong> <a href="https://service.besender.com/ecovacs/home">https://service.besender.com/ecovacs/home</a></p>

<p>In the event that your existing Deebot model cannot be serviced by Besender, we recommend IFIXROBOT as an alternative solution. IFIXROBOT also excels as a professional robot repair specialist! Please explore the following link for repair service:&nbsp;<br />
<strong>Email: </strong><a href="mailto:service@ifixrobot.com">service@ifixrobot.com</a><br />
<strong>Phone: &nbsp;</strong>+1 855-349-7626</p>

<p><strong>Website</strong>: <a href="https://www.ifixrobot.com/ecovacs-repair-service">https://www.ifixrobot.com/ecovacs-repair-service</a></p>

<p>Additionally, if you are interested in purchasing a new Deebot, you can explore our US Web Store at <a href="https://www.ecovacs.com/us">https://www.ecovacs.com/us</a> or our CA Web Store at <a href="https://www.ecovacs.com/ca">https://www.ecovacs.com/ca</a>. Should you decide to proceed with an upgrade, kindly inform us at your earliest convenience, and we will be delighted to apply a special discount to your order. Please note that orders are available only to the lower 48 states of the United States or Canada.</p>

<p>Feel free to reach out if you have any questions or concerns.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000567DdEAI', 'AMR Email Templates', 'Apologize Statement (Customer Feedback/Suggestion)', '道歉纯享版', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We sincerely appreciate your feedback and comments.</p>

<p>We truly apologize for the inconvenience this has caused, and we hope it does not affect your overall enjoyment of Ecovacs products. Please be assured that your feedback will be forwarded to our dedicated team for further improvement, and we hope to provide an update for customers in the near future.</p>

<p>Thank you again for being a loyal customer. Should you need any further assistance, please feel free to reach out.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000567FFEAY', 'AMR Email Templates', 'Apologize Statement (Escalation required)', '升级给Tier 3', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We appreciate you bringing your concerns to our attention.</p>

<p>We deeply value our customers, and providing exceptional service is always our top priority. We sincerely apologize for the inconvenience this has caused. Rest assured, we will mark this case as a priority and forward it to the dedicated team for further review and resolution.</p>

<p>Thank you so much for your understanding. We will get back to you as soon as possible with an update.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000567ITEAY', 'AMR Email Templates', 'Macro 1 - Collect Info (Winbot)', '全新窗宝从授权渠道购入享1年质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out to us regarding your ECOVACS <strong>WINBOT</strong>.<br />
<br />
We offer a <strong>1-year</strong> warranty on a new <strong>Winbot </strong>purchased through our <strong>authorized </strong>resellers. If your machine is still within the warranty period, we would be happy to assist with the warranty service.<br />
<br />
To proceed with the warranty replacement, please provide the following information by replying to this email:</p>

<ol>
	<li><strong>Contact Information</strong>: Please include your full name (first and last), address (including zip code and apartment/unit number, if applicable), and contact number.&nbsp;</li>
	<li><strong>Proof of Purchase: </strong>A screenshot showing the order number, date of purchase, original seller, machine condition, and model of the device.&nbsp;</li>
	<li><strong>Picture of the Winbot Serial Number</strong>: This can be found via the app, attached to the safety rope/pod, on the corner of the storage suitcase, or on the back of the OMNI station (if applicable).&nbsp;<img alt="Winbot SN 1" src="https://ecovacs2020.file.force.com/file-asset-public/Winbot_SN_1?oid=00D2x000005pVxV" style="max-width: 948.798px; width: 611px; height: 409px;" title="Winbot SN 1" />&nbsp;<img alt="Winbot SN 3" src="https://ecovacs2020.file.force.com/file-asset-public/Winbot_SN_3?oid=00D2x000005pVxV" style="max-width: 948.798px; width: 224px; height: 409px;" title="Winbot SN 3" /><img alt="Winbot SN 2" src="https://ecovacs2020.file.force.com/file-asset-public/Winbot_SN_2?oid=00D2x000005pVxV" style="max-width: 948.7976562499999px" title="Winbot SN 2" /></li>
	<li><strong>Visual Documentation</strong>: A short video or screenshot of the issue to help us diagnose and troubleshoot the problem.</li>
</ol>
<br />
<i>Once we have this information, we will guide you through the next steps accordingly.</i>

<p>If you have any questions or need further assistance, please don''t hesitate to reply to this email or contact us.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000567K5EAI', 'AMR Email Templates', 'Macro 1 - Collect Info (GOAT)', '官方授权渠道购入的全新割草机拥有2年质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out to us regarding your machine.&nbsp;<br />
<br />
We provide a <strong>2-year warranty</strong> for a <strong>new </strong>ECOVACS <strong>GOAT </strong>purchased through our <strong>authorized </strong>resellers. If your machine is still within the warranty period, we''d be more than happy to offer warranty service for your unit.</p>

<p>To proceed with the warranty replacement, please provide the following information by replying to this email:</p>

<ul>
	<li><strong>Contact Information: </strong>Please include your <strong>full name </strong>(first and last), <strong>address </strong>(including the zip code and apartment/unit number if applicable), and <strong>contact number</strong>.<br />
	&nbsp;</li>
	<li><strong>Proof of Purchase:</strong> A screenshot showing the order number, date of purchase, original seller, machine condition, and model of the device.<br />
	&nbsp;</li>
	<li><strong>Picture of the Goat Serial Number</strong> (located either at the rear end or the bottom of the unit)</li>
</ul>

<div style="margin-left: 40px;"><img alt="image (3)" src="https://ecovacs2020.file.force.com/file-asset-public/image_3?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image (3)" /><img alt="image (4)" src="https://ecovacs2020.file.force.com/file-asset-public/image_4?oid=00D2x000005pVxV" style="max-width: 710.125px; width: 376.997px; height: 212.986px;" title="image (4)" /></div>

<ul>
	<li><strong>Serial Number of the Base Station</strong></li>
</ul>

<p style="margin-left: 40px;"><img alt="image (5)" src="https://ecovacs2020.file.force.com/file-asset-public/image_5?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image (5)" /></p>

<ul>
	<li><strong>Visual Documentation: </strong>A short video or screenshot of the issue to help us diagnose, replicate, and troubleshoot the problem.</li>
</ul>

<p><br />
<i>Once we have the requested information, we''ll be happy to guide you through the next steps accordingly.</i></p>

<p><br />
Should you have any questions or require further assistance, please do not hesitate to reply to this email or contact us.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000567NJEAY', 'AMR Email Templates', 'Apologize Statement (Users Urge Escalation Update)', '用户催促升级进度', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out to us again.&nbsp;<br />
<br />
We are still awaiting confirmation and suggestions from the relevant team, but we are now prioritizing your case and will follow up with them again to ensure everything is moving forward.&nbsp;<br />
<br />
We truly value our customers, and exceptional service is always our top priority. Please accept our sincere apologies for any inconvenience this has caused. We aim to provide you with an update as soon as possible.</p>

<p>Thank you so much for your understanding. In the meantime, please don’t hesitate to let us know if you need further assistance.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000567OvEAI', 'AMR Email Templates', 'Factory Reset Deebot', '恢复出厂设置 - 地宝', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p><strong><u>Gentle Reminder</u>: </strong><br />
Kindly be informed that performing a reset on the Deebot will result in the deletion of all data, including the saved maps. Following the reset, Deebot will go offline and will require the network setup process to be redone in order to restore its online functionality.</p>

<p><strong><u>How to reset your Deebot:</u></strong><br />
To initiate a hard reset of the Deebot, press the Reset Button (a tiny grey button near the power switch) for approximately 5 seconds. You will hear a voice prompt stating "Reset to default settings," followed by the commencement of the boot music. This indicates that the default settings have been successfully restored.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000567QXEAY', 'AMR Email Templates', 'Warranty policy (Deebot)', '全新地宝从授权渠道购入享1年质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We provide a 1-year warranty for ''New'' ECOVACS Deebots purchased through our authorized resellers. If we find that the issues you are experiencing are related to product quality, we will definitely resolve your problems and concerns.</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000567S9EAI', 'AMR Email Templates', 'Technical Support Escalation', '升级到技术群', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We have forwarded your case and provided all the relevant information to our technical team for a more in-depth investigation.&nbsp;
<p>Our team is working diligently on your query, and we are hopeful to receive feedback from them soon. As soon as we have any updates or insights into your issue, we will immediately notify you.</p>

<p>If you have any further questions or require additional assistance in the meantime, please do not hesitate to reach out to us.</p>
</body>
</html>', 'Eric. L', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005698zEAA', 'AMR Email Templates', 'Charging Issue', '无法充电-通用排障', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Check the Station Power</strong><br />
Confirm if there is a light on the station.<br />
If not, please make sure the power cord is firmly plugged into the station.<br />
If your station has a rocker switch, kindly ensure it is turned to the <strong>"I"</strong> position.<br />
<br />
<strong>2. Check the Charging Dock Pins</strong><br />
Gently press the charging dock pins to confirm if they rebound smoothly.<br />
<br />
<strong>3. Check the Robot Power</strong><br />
Ensure the main switch button of the robot is in the <strong>"I" </strong>position.<br />
<br />
<strong>4. Clean the Charging Contacts</strong><br />
Please check if there is any dust or dirt on the charging dock pins or the robot''s charging contacts.<br />
Wipe them gently with a clean, dry cloth.<br />
⚠️ Reminder: Make sure the robot is switched OFF and the charging dock is unplugged before cleaning.<br />
<br />
<strong>5. Test Charging</strong><br />
Push the DEEBOT onto the charging dock and check whether it charges normally.<br />
<br />
<strong>6. Check the Outlet</strong><br />
Confirm whether the outlet is working.<br />
If not, please try another outlet.<br />
<br />
<strong>7. For N79 Series Only</strong><br />
Please try charging the DEEBOT directly by plugging in the charging cord. (The port is located next to the main power switch.)</body>
</html>', 'Dylan. Z', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000056miDEAQ', 'AMR Email Templates', 'Macro 3 - Must Return Original Machine', '需要寄回的机器满足以下条件： 1）购买时间不超过9个月； 2）X2、X5、X8、X9、T30、T50、T80、GOAT 1000、2500、3000。', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for providing the required information.</p>

<p>A <strong>return shipping label </strong>for your current unit will be issued and sent to you in a separate email after we dispatch the replacement unit to you.</p>

<p>In the meantime, we will begin processing your <strong>replacement </strong>and arrange for shipment at the earliest opportunity. Once we arrange the shipment, the tracking details will be sent to you from a separate email address as soon as they become available.<br />
<br />
After you receive the replacement unit, you can return the original unit using the<strong>&nbsp;</strong>return label provided. If you did not receive the label, please let us know, and we''ll be happy to resend it.</p>

<p>We sincerely appreciate your patience and understanding. Should you have any further questions or require additional assistance, please do not hesitate to contact us—we''re here to help.</p>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000056xx0EAA', 'AMR Email Templates', 'Pet Waste Avoidance', '地宝避不开宠物粑粑', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out, and we''re truly sorry to hear about the inconvenience this has caused.<br />
<br />
While your Deebot features <strong>Pet Waste Avoidance</strong> technology, its effectiveness can vary based on several factors. Pet waste can differ in <strong>size</strong>, <strong>shape</strong>, and <strong>color</strong>, which may impact recognition accuracy. Additionally, low lighting, complex floor patterns, or nearby clutter can further interfere with detection. Dirty or obstructed sensors and cameras may also reduce performance.<br />
<br />
To help achieve the best cleaning results, we recommend the following:
<ul>
	<li>Manually remove pet waste <strong>before </strong>starting a cleaning cycle.</li>
	<li><strong>Ensure the Deebot''s sensors and camera are clean</strong>, and the appropriate <strong>Obstacle Avoidance Strategy</strong> is selected.</li>
</ul>

<div style="margin-left: 40px;">If your model features <strong>AIVI™ 3D</strong> (especially <strong>AIVI™ 3D 3.0</strong>), try setting the obstacle avoidance sensitivity to <strong>High </strong>instead of Standard. This allows the Deebot to respond more sharply to objects in your environment.</div>

<ul>
	<li><strong>Run the robot in a well-lit environment.&nbsp;</strong></li>
</ul>

<div style="margin-left: 40px;">If your model supports Night Vision Supplementary Light, enable it in the app via: <strong>Settings &gt; Robot Advanced Settings &gt; Night Vision Supplementary Light</strong><br />
<em>This allows the robot to automatically activate lighting in low-light areas, enhancing obstacle avoidance using AI vision.</em></div>

<ul>
	<li>Use <strong>Auto Clean mode</strong> to allow optimal mapping and full-scope object detection.</li>
</ul>
<br />
Additionally, to help create a safer environment for your pets, we suggest enabling <strong>Protective Navigation Mode </strong>(available on models such as <strong>X9 PRO OMNI </strong>and <strong>X11 OMNICYCLONE</strong>). This setting increases the robot''s avoidance distance and automatically adjusts the side brush speed, providing extra protection for pets. Please note that enabling this mode may reduce cleaning coverage.<br />
<em>Performance may vary depending on environmental complexity, object shapes, and other factors.</em><br />
<br />
If you have any further questions or need assistance with settings, please don''t hesitate to reach out — we''re here to help.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000056yEjEAI', 'AMR Email Templates', 'Warranty Policy (Winbot)', '全新窗宝从授权渠道购入享1年质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We provide a 1-year warranty for ''New'' ECOVACS Winbots purchased through our authorized resellers. If we find that the issues you are experiencing are related to product quality, we will definitely resolve your problems and concerns.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000056yRdEAI', 'AMR Email Templates', 'Warranty Policy (Goat)', '全新割草机从授权渠道购入享2年质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We provide a <strong>2-year warranty</strong> for a ''<strong>new''&nbsp;</strong>ECOVACS <strong>GOAT </strong>purchased through our <strong>authorized </strong>resellers.&nbsp;If we find that the issues you are experiencing are related to product quality, we will definitely resolve your problems and concerns.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000570A5EAI', 'AMR Email Templates', '3rd Response for Email', '第三封邮件回复', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for keeping us updated.</p>

<p>To help us better identify the issue, could you please confirm if the following troubleshooting steps have already been completed:</p>

<p>&nbsp;</p>

<p><span style="color:#c0392b;">[Insert Macro/Solution steps here]</span></p>

<p>&nbsp;</p>

<p>If you need any further assistance, please don''t hesitate to reach out. We''re happy to help in any way we can.</p>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000571e1EAA', 'AMR Email Templates', 'Factory Reset Winbot', '恢复出厂设置 - Winbot MINI/W2P/W2M/W2MP', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>To perform a factory reset on the Winbot, please follow the steps below:</p>

<p>① Locate the reset button on the bottom left of the WINBOT.</p>

<p><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/el8wrMzJFXhwFuiPBqkWVZlSk?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..NjxKO_kDNYiYnDK9iPc8OQ.zIpxfe5MT2itlE4ziJaGLeslnwj-uWne7-POQcsAAMmJxDiNgIcOOXFD8Rvf-Gaa-Uy5XFNojGm8O5f_mixxWzmVMxCZ8jbvtmMCvZ6WPnOLrlHv36DbGX6Zp7Q4CA-WGZdm0orGZn8WUi5YqVmn-O3OKOVFiUrmunrlR6SFyX02EQ1NU-SuKcGjXGn_HiM2KX19GDnvf5h6AbGiYe-v1Jlze4ZTaTsFkOEIbgvjxosB0xag6Efw8_k33e4uacthBRMGEU_TFTv43E3qEMp-xEDeoXMTbhbl4Nh5_FTOa6WnsPQVEjf9nAmftXv2pHns.1tqNGxlkN9OfYYiJQ-BpNw" style="max-width: 657.029px; width: 524px; height: 438.641px;" title="User-added image" /><br />
<br />
② Use a paperclip or any sharp object to press and hold the reset button until you hear the fan restart.<br />
&nbsp;<br />
③ After resetting, perform a test run.<br />
&nbsp;<br />
If you have any other questions or need additional support, please don''t hesitate to reach out.</p>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000573HdEAI', 'AMR Email Templates', 'Other Region Service Inquiry', '其他国家或区域用户咨询', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Kindly be informed that you are currently connected with the North American support team. Our services are tailored specifically for handling product and warranty inquiries within the USA and Canada. Should you require assistance outside of this region, we recommend reaching out directly to your local support team, as they are better positioned to assist you with your query.<br />
<br />
Below, you''ll find the contact information for support in your country:<br />
<br />
Your understanding is greatly appreciated. Please feel free to let us know if you need any further assistance from our team.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000574FKEAY', 'AMR Email Templates', 'Yeedi Inquiries', 'Yeedi 产品相关咨询', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Kindly be informed that you are currently connected with ECOVACS customer service. Both Ecovacs and Yeedi are brands under the umbrella of ECOVACS Robotics. Yeedi operates as a sub-brand of ECOVACS, specializing in a range of robotic vacuum models, and has its own independent customer service system.<br />
<br />
For any inquiries related to Yeedi products, we recommend contacting Yeedi’s official customer service at <strong>support@yeedi.com</strong> or reaching out to the original seller for further assistance.<br />
<br />
We appreciate your understanding.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000574f7EAA', 'AMR Email Templates', 'Product Not Available', '用户所咨询产品暂时未上线', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you so much for your interest in ECOVACS.<br />
<br />
At this time, we are still awaiting updates from our dedicated team regarding the availability of the <span style="color:#c0392b;">[Insert Model]</span>. Unfortunately, the release date has not yet been confirmed. We recommend staying tuned or subscribing to our newsletter on the official website for the latest updates.<br />
<br />
Thank you once again for your patience. We look forward to welcoming you as part of the ECOVACS family!</p>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000574iLEAQ', 'AMR Email Templates', 'General Marketing Cooperation Inquiry', 'SEO等Marketing类合作咨询', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to Ecovacs Robotics.<br />
<br />
We value your business. We will forward your correspondence to our marketing team at <a href="mailto:na.marketing@ecovacs.com" rel="noreferrer">na.marketing@ecovacs.com</a>&nbsp;or you can directly reach out to them using this email address. For any PR inquiries, we have our own PR agency that handles all our public relations in NA.<br />
<br />
We look forward to working with you in the future.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000575CzEAI', 'AMR Email Templates', '1st response ( Video/ POP)', '第一封邮件回复', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for contacting Ecovacs Robotics.<br />
<br />
To ensure we can provide the best possible support and resolve your concern promptly, we may need some additional information from you. Specifically, a screenshot of the proof of purchase—whether it''s a receipt, invoice, or order number—would be helpful for verification purposes.<br />
<br />
If possible, sharing a brief video that demonstrates the issue you''re experiencing would also be greatly appreciated. This will enable our team to better understand the problem and work towards a solution more efficiently.<br />
<br />
Thank you in advance for your cooperation. Your prompt response will help us address your issue as quickly as possible.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000575mTEAQ', 'AMR Email Templates', 'Factory Reset N79 Series', '恢复出厂设置 - N79系列', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Steps to Reset the N79 Series:
<ol>
	<li>Place the Deebot on the charging dock. Turn off the main power switch, wait for 5 seconds, then turn it on again. Press the Auto button. Ensure the blue light is on.</li>
	<li>Press and hold the Auto button until you hear one initial beep, followed by three beeps.</li>
</ol>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000575zNEAQ', 'AMR Email Templates', 'Factory Reset M80/M81', '恢复出厂设置 - M80/M81系列', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">There is a reset button located under the cover of the Deebot. For your reference, the reset button is marked in red in the attached image.<br />
<br />
Follow these steps to reset the Deebot:
<ol>
	<li>Turn on the Auto button and ensure the blue light is illuminated.&nbsp;<img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/AW6hnyZZemyBJ8ctX1W2QXiAd?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..cN7iCDkUd9V7blx203MN-g.-wTGk420P_tfBDEKVk88fUYxfW_xBos6FIi4-2zcGYx16YC37tcWkksBNKGuxsPoLVFoz_TVWKKtX4zDzV-pBQxn3RcumSqo8znwHySZ4rTGfeTVNdMVhH8XTKM2QC10eTElnXB0B3q2bM1zDlodb1zXhSFSWzCHhUby08VfTwb1JKmIE5ib2EgDa0VlbWYe0HHhAPbfPZ4FQBjEb_7ACPoinPZHcROSmUpEoThTvlRrsfcxqzum0GfXSIg8lXwk4ly4aRk0rm-y3w4AsbW002CaCIVnVlj7OCq2itz-02w.dJ48HiSICQlqy5LsjC0ZXw" style="max-width: 657.02890625px" title="User-added image" /></li>
	<li>Using a sharp tool, such as a needle, insert it into the reset hole. Press and hold the reset button until you hear three beeps.</li>
</ol>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000576XFEAY', 'AMR Email Templates', 'Sales inquiry', '商务合作', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to ECOVACS Robotics.<br />
<br />
We greatly value your business. Your inquiry will be forwarded to our Sales team at <strong>thomas.climer@ecovacs.com</strong>, or you can directly reach out to them using this email address.<br />
<br />
We look forward to the opportunity to work with you in the future.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000576ozEAA', 'AMR Email Templates', 'Cooperation Inquiry w/ HQ', '普通合作类', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.<br />
<br />
We have forwarded your request to the relevant department, and they will contact you directly if they are interested.<br />
<br />
We truly appreciate your attention and support of ECOVACS.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000578POEAY', 'AMR Email Templates', 'Minimize App Promo Messages', '关掉App促销等推送', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for bringing this to our attention.<br />
<br />
To minimize the promotional notifications and pop-ups in the ECOVACS Home App, please follow the steps below to adjust your settings:<br />
<br />
1. <strong>Open the ECOVACS Home App</strong>, go to "<strong>Mine</strong>" → "<strong>Settings</strong>" → "<strong>Message Settings</strong>", then <strong>disable "Promotion Messages"</strong>.<br />
<img alt="App Promo (1)" src="https://ecovacs2020.file.force.com/file-asset-public/App_Promo_1?oid=00D2x000005pVxV" style="max-width: 671.16015625px" title="App Promo (1)" /></p>

<p>2. Under "<strong>Settings</strong>", navigate to "<strong>Recommendation Settings</strong>" and turn <strong>OFF&nbsp;</strong>the following options:</p>

<ul>
	<li>Subscribe to ECOVACS for operation instructions, membership benefits, and product recommendations</li>
	<li>App Activity Messages</li>
	<li>Allow to Receive Recommendations</li>
	<li>Promotions/Offers/Events</li>
	<li>User Surveys (optional)</li>
	<li>Customized Ad Management</li>
</ul>

<p><img alt="App Promo (2)" src="https://ecovacs2020.file.force.com/file-asset-public/App_Promo_2?oid=00D2x000005pVxV" style="max-width: 671.16015625px" title="App Promo (2)" /></p>

<p>3. Finally, under "<strong>Settings</strong>", go to "<strong>Privacy</strong>" → "<strong>Data Authorization Settings</strong>", locate "<strong>Other Data Authorization</strong>", and turn off "<strong>Promotion of Product and Service</strong>".<br />
<img alt="App Promo (3)" src="https://ecovacs2020.file.force.com/file-asset-public/App_Promo_3?oid=00D2x000005pVxV" style="max-width: 671.16015625px" title="App Promo (3)" /></p>

<p>We understand that this process may be a bit inconvenient, and we sincerely apologize for any disruption it may have caused. Please know that your feedback will be shared with our product team as we continue working to enhance the user experience.<br />
<br />
In the meantime, we appreciate your patience and continued support. Should you need any further assistance, please don''t hesitate to reach out — we''re always happy to help.</p>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000578agEAA', 'AMR Email Templates', 'Restore Map Manually', '手动恢复地图（老型号适用）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ol>
	<li>Remove the machine from the Charging Dock and turn it off. Wait a few seconds, then turn it back on. Reconnect the machine to the Charging Dock.</li>
	<li>It is recommended to keep some distance from the machine to avoid interference. The machine will announce "Map is recovering." After a short wait, it will confirm with "Map recovery succeeded." If the map recovery fails, we suggest trying the process a few more times.</li>
	<li>If the issue persists, we recommend rebuilding the map.</li>
</ol>

<ul>
	<li>Gentle Reminder: The map cannot be restored if it has been reset, either through the map or the machine itself.</li>
</ul>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000579IDEAY', 'AMR Email Templates', 'Other Region Model Inquiry', '咨询型号非北美销售', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us. We understand that the model you purchased is <strong>not </strong>sold in North America. As there may be design and component differences between models sold in different regions, we recommend contacting the service center in the region where the purchase was made for specialized assistance.<br />
<br />
<span style="color:#c0392b;">Insert Local Support Contact Details</span></body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057C81EAE', 'AMR Email Templates', 'Tineco Inquiries', 'Tineco 产品咨询', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please note that you are currently connected with ECOVACS Customer Service.<br />
<br />
While ECOVACS and Tineco are both brands under the ECOVACS Robotics umbrella, Tineco operates with its own independent customer support system.<br />
<br />
For any inquiries related to Tineco products, we kindly recommend contacting their official support team at <strong>support@tineco.com</strong>&nbsp;or reaching out to the original seller for further assistance.<br />
<br />
We sincerely appreciate your understanding.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057EJVEA2', 'AMR Email Templates', 'No Warranty - Open Box/Open Box (New)', '开过箱的新机: 不符合质保政策', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your continued patience and for providing the additional information.<br />
<br />
We would like to clarify that although the product may have been listed as "new," an open-box item does not qualify for warranty coverage under our policy. The ECOVACS warranty is applicable exclusively to factory-new units purchased directly by the original owner, and it is non-transferable.<br />
<br />
In light of this, we kindly recommend reaching out to the original seller to inquire about any available support or return options they may offer.<br />
<br />
We truly appreciate your understanding and trust in ECOVACS. Should you have any further questions or require additional assistance, please don''t hesitate to contact us.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057F2fEAE', 'AMR Email Templates', 'Walmart Order Verification', 'Walmart购买凭证核查话术', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Please be advised that Walmart Marketplace hosts both authorized and unauthorized sellers of ECOVACS products. To ensure product authenticity and eligibility for our warranty services, coverage is exclusively provided for purchases made from our authorized partners on the platform.<br />
<br />
These are specifically:</p>

<ul>
	<li><strong>"Sold and Shipped by Walmart"</strong></li>
	<li><strong>"Fulfilled by Walmart"</strong></li>
	<li><strong>"Sold and Shipped by ECOVACS Robotics"</strong></li>
</ul>

<p>&nbsp;<br />
To help us verify your purchase, could you please provide a clear screenshot of your Walmart order details? The screenshot must clearly show the <strong>seller information, including the seller''s name</strong> (e.g., "<strong>Sold by</strong>..."), <strong>shipping information</strong> (e.g., "<strong>Shipped by</strong>..."), to confirm qualification for warranty services.<br />
&nbsp;<br />
<strong>Example of required screenshot:</strong><br />
<img alt="Walmart Order Verification (1)" src="https://ecovacs2020.file.force.com/file-asset-public/Walmart_Order_Verification_1?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Walmart Order Verification (1)" /></p>

<p><img alt="Walmart Order Verification (3)" src="https://ecovacs2020.file.force.com/file-asset-public/Walmart_Order_Verification_3?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Walmart Order Verification (3)" /></p>

<p><img alt="Walmart Order Verification (4)" src="https://ecovacs2020.file.force.com/file-asset-public/Walmart_Order_Verification_4?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Walmart Order Verification (4)" /></p>

<p>If your order was fulfilled by a different seller, unfortunately, we will be unable to process the warranty claim, as these products are not covered by our official warranty policy. For further details, you may refer to this link for our detailed warranty policy: <a href="https://help.ecovacs.com/global/support/warranty">Ecovacs Warranty Policy</a></p>

<p><br />
<img alt="Walmart Order Verification (2)" src="https://ecovacs2020.file.force.com/file-asset-public/Walmart_Order_Verification_2?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Walmart Order Verification (2)" /><br />
<br />
We appreciate your understanding and cooperation. If you have any further questions, please do not hesitate to contact us.</p>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057HE9EAM', 'AMR Email Templates', 'Mop Plate Drop Near/On Carpets', '地宝抹布支架遇地毯脱落', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your feedback.<br />
<br />
Regarding the issue of the mop plates falling off when the Deebot runs over carpeted areas, we recommend the following to ensure continued smooth operation:
<ul>
	<li><strong>Secure the edges of your carpet</strong>: If the carpet edges tend to curl, we suggest securing them properly to prevent the mop plates from being dislodged as the Deebot passes over.</li>
	<li><strong>Use the Virtual Boundary feature</strong>: You can set up virtual boundaries in the ECOVACS app to restrict Deebot from entering/mopping specific areas where such issues are more likely to occur.</li>
</ul>
<br />
Additionally, please reinstall the mop plates and ensure you hear a "click" sound to confirm they are securely attached. Then, place the Deebot on a flat, open surface and allow it to run so you can observe its behavior.<br />
<br />
We appreciate your understanding and continued support. If you have any further questions or concerns, please don''t hesitate to reach out — we''re always happy to assist.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057ITZEA2', 'AMR Email Templates', 'Air Pump Abnormal Noise', '滚筒类地宝气泵异音', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out to us regarding the <strong>"gurgling" sound</strong> (similar to a knocking noise) emitted by the OZMO Roller Mop module. We understand your concern, and we are here to help clarify the cause and provide solutions to address this issue.<br />
<br />
<strong>Potential Cause of the Gurgling Sound:</strong><br />
This unusual sound is typically caused by a <strong>small amount of residual water</strong> in the Deebot''s <strong>Dirty Water Box</strong>, which may have flowed back into the <strong>air pump</strong> when the Deebot was flipped over prior to use. This can occasionally happen when the device is turned upside down.<br />
<img alt="Air Pump 1" src="https://ecovacs2020.file.force.com/file-asset-public/Air_Pump_1?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Air Pump 1" /></p>

<p><img alt="Air Pump 2" src="https://ecovacs2020.file.force.com/file-asset-public/Air_Pump_2?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Air Pump 2" /><br />
&nbsp;</p>

<p><strong>What Happens Next:</strong></p>

<ol>
	<li>When you start the <strong>vacuuming and mopping function</strong>, the <strong>air pump</strong> operates continuously.</li>
	<li>The residual water from the Dirty Water Box will naturally <strong>expel through the vents</strong> at the bottom of the machine.</li>
	<li><strong>A small amount of residual water may be left on the floor</strong> during this process, which is completely normal.</li>
	<li>The <strong>gurgling noise</strong> will gradually decrease and disappear as the remaining water is expelled, usually <strong>within 5-10 minutes</strong>.</li>
	<li>After this, the device will return to normal operation.</li>
</ol>
<br />
<strong>Suggested Troubleshooting Steps:</strong><br />
To avoid this issue in the future, we recommend the following:
<ul>
	<li><strong>Before flipping the Deebot</strong>, please ensure that the <strong>Dirty Water Box</strong> is removed from the rear end of the Deebot. This will help prevent any water from flowing back into the pump and causing noise.</li>
</ul>
<br />
Rest assured, this is usually a <strong>temporary occurrence</strong>, and the machine should work perfectly once the residual water is expelled. Should you experience any further concerns or if the issue persists beyond 5-10 minutes, please don''t hesitate to reach out to us.<br />
<br />
We hope this information helps, and we are always here to assist you should you need further support.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057KdREAU', 'AMR Email Templates', 'Mobile Hotspot Connection Method', '热点配网', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">You can connect the robot to a mobile phone hotspot. Once the connection is successful, you can set functions in the <strong>ECOVACS Home App</strong>, such as scheduled cleanings. <em><strong>Note:</strong> Turning off the hotspot will only affect remote control, but any functions that have already been set will still work. If you need to modify settings later in the app, you will need to reconnect to the hotspot.</em><br />
<br />
<strong>How to Set Up the Hotspot:</strong>
<ul>
	<li>Enable a <strong>2.4GHz mobile hotspot</strong> on another family member''s phone (this can be done in your phone''s settings).</li>
	<li>Use your phone to connect to the Wi-Fi signal shared by that hotspot.</li>
	<li>Then, use the same phone to connect the robot and check if the connection is successful.</li>
	<li>To simplify the process, we recommend setting the hotspot name and password as a simple combination of numbers.</li>
	<li>After successfully connecting to the hotspot, you may also try changing your home Wi-Fi name and password to match the hotspot, and then test the connection again.</li>
</ul>
<br />
<em>Reason for Testing with a Hotspot:<br />
This test helps determine whether the issue lies with the robot or the home network.<br />
If the robot connects successfully to the hotspot, it indicates that the robot itself is functioning properly, and the connection failure is most likely related to the home Wi-Fi network.</em></body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057Mx0EAE', 'AMR Email Templates', 'Influencer Collab Inquiry', '红人营销相关', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We appreciate your interest in ECOVACS products!<br />
&nbsp;</p>

<p>Please take a moment to complete our short questionnaire to help us explore potential collaboration opportunities. If our dedicated department finds potential in working together, they will reach out to you directly.</p>

<p>🔗<a href="https://www.wjx.cn/vm/twB4F72.aspx" rel="noopener noreferrer">Fill out the form here</a>.<br />
&nbsp;</p>

<p>Thank you for your attention and support of ECOVACS.</p>
</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057SRJEA2', 'AMR Email Templates', 'Main Brush Tangled', '主刷缠绕 - 报警', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ol>
	<li>Please kindly check if there is any hair tangled around the main brush. We recommend removing the two end caps and using the multi-function tool to clean the hair. (Video attached for reference.)</li>
	<li>Please confirm whether the issue occurs only on carpets or also on flat floors (such as hardwood or tiles). If the problem happens only on carpets, it may be that the carpet is too thick for DEEBOT to clean effectively.</li>
	<li>If the issue also appears on flat floors, please try running the DEEBOT without the main brush to see if the alarm still goes off. If it does not, we suggest performing a factory reset on the DEEBOT.</li>
</ol>

<div style="margin-left: 40px;"><strong>Gentle Reminder:</strong><br />
Please note that resetting your DEEBOT will erase all data, including saved maps. After the reset, the robot will go offline and you will need to go through the network setup again to restore online functionality.<br />
<br />
<strong>How to Reset Your DEEBOT:</strong><br />
To perform a hard reset, press and hold the Reset button (the small grey button near the power switch) for about 5 seconds. You will hear the voice prompt "Reset to default settings" followed by the startup music, which indicates the default settings have been successfully restored.</div>
</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057SsjEAE', 'AMR Email Templates', 'Driving Wheel Stuck', '驱动轮卡困 - 保障', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ol>
	<li>Please turn the robot over and manually rotate both the left and right wheels at the same time. Check if the resistance feels the same on both sides. If one side feels different, kindly inspect both wheels for any tangled debris.&nbsp;</li>
	<li>Power the robot <strong>OFF </strong>and then <strong>ON </strong>again. Allow it to start working in an open area and check whether the driving wheel alarm disappears.</li>
	<li>If the issue persists, we recommend performing a<strong> factory reset </strong>on the robot.</li>
</ol>

<div style="margin-left: 40px;"><strong>Gentle Reminder:</strong><br />
Please note that resetting your DEEBOT will erase all data, including saved maps. After the reset, the robot will go offline, and you will need to go through the network setup again to restore online functionality.<br />
<br />
<strong>How to Reset Your DEEBOT:</strong><br />
To perform a hard reset, press and hold the Reset button (the small grey button near the power switch) for about 5 seconds. You will hear the voice prompt "Reset to default settings" followed by the startup music, which indicates the default settings have been successfully restored.</div>
</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057SuLEAU', 'AMR Email Templates', 'Anti-drop Sensor Alarm', '下视传感器沾灰- 报障', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please turn the robot over and check the bottom. Around the sides of the brushes and near the front universal wheel, you will find the Anti-Drop Sensors (the number may vary depending on the model, usually 3–6). Gently wipe these sensors with a clean, dry cloth.<br />
<br />
If the issue persists after cleaning, kindly try resetting your DEEBOT.<br />
<br />
<strong>Gentle Reminder:</strong><br />
Please note that resetting your DEEBOT will erase all data, including saved maps. After the reset, the robot will go offline, and you will need to go through the network setup again to restore online functionality.<br />
<br />
<strong>How to Reset Your DEEBOT:</strong><br />
To perform a hard reset, press and hold the Reset button (the small grey button near the power switch) for about 5 seconds. You will hear the voice prompt "Reset to default settings" followed by the startup music, which indicates the default settings have been successfully restored.</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057SvxEAE', 'AMR Email Templates', 'Bumper Stuck Alarm', '撞板卡住 - 报警', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Checking the Anti-Collision Bumper:
<ol>
	<li>Please place the DEEBOT in an upright position.</li>
	<li>Gently tap the left, middle, and right sections of the Anti-Collision Bumper with your hand, then release it to see if it rebounds smoothly.</li>
</ol>

<ul>
	<li style="margin-left: 40px;">If it rebounds normally, kindly wipe the bumper with a clean, dry cloth and restart the machine.</li>
	<li style="margin-left: 40px;">If it does not rebound, please factory reset the DEEBOT.</li>
</ul>

<div style="margin-left: 80px;"><strong>Gentle Reminder:</strong><br />
Please note that resetting your DEEBOT will erase all data, including saved maps. After the reset, the robot will go offline, and you will need to go through the network setup again to restore online functionality.<br />
<br />
<strong>How to Reset Your DEEBOT:</strong><br />
To perform a hard reset, press and hold the Reset button (the small grey button near the power switch) for about 5 seconds. You will hear the voice prompt "Reset to default settings" followed by the startup music, which indicates the default settings have been successfully restored.<br />
<br />
⚠️ Reminder: Before use, please make sure all protective strips have been removed from the bumper</div>
</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057SxZEAU', 'AMR Email Templates', 'Recharge Issue/ Unable to Find Docking Station', '回充问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Check Power Supply</strong>
<ul>
	<li>Please first confirm that the base station has power.</li>
	<li>To verify, check the indicator light on the front of the station:</li>
	<li style="margin-left: 40px;">If the light is on, the station has sufficient power.</li>
	<li style="margin-left: 40px;">If not, kindly check the back of the station to ensure the power cord is firmly plugged in.</li>
	<li style="margin-left: 40px;">If your station has a rocker switch near the power port, please make sure it is switched to the <strong>"I" </strong>position.</li>
</ul>

<p><strong>2. Test Return to Charging Dock</strong></p>

<ul>
	<li>Place DEEBOT about 39 inches (1 meter) straight in front of the Charging Dock.</li>
	<li>Press the Return to Charger button to see if it returns smoothly.</li>
	<li>If successful, please continue with the following checks:</li>
</ul>

<p style="margin-left: 40px;"><em>Further Troubleshooting Steps:</em><br />
a. Ensure all protective strips have been removed from the Charging Dock.<br />
b. Wipe both the bumper and the dock sensors with a clean, dry cloth.<br />
c. Confirm that DEEBOT starts cleaning from the Charging Dock.<br />
d. Check the placement of the Charging Dock:</p>

<ul>
	<li style="margin-left: 40px;">Place it in an open area (not in a narrow space).</li>
	<li style="margin-left: 40px;">Position it against a wall with at least 1.6 ft (0.5 m) clearance on both sides, and 5 ft (1.5 m) in front.</li>
	<li style="margin-left: 40px;">Keep it away from devices that may cause signal interference (e.g., routers, TVs).</li>
	<li style="margin-left: 40px;">Avoid placing it near reflective surfaces (e.g., mirrors, glass windows).</li>
</ul>

<p><strong>3. Relocate Dock if Needed</strong><br />
If the issue persists, try changing the location of the Charging Dock and observe whether DEEBOT can dock properly.</p>
</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057T0nEAE', 'AMR Email Templates', 'Incomplete Cleaning/Unable to Find Designated Areas', '无法找到指定清洁区域  (通用)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ol>
	<li>Please first confirm if the environment has changed (for example, if any furniture, or even the location of the Docking Station, has been moved).</li>
	<li>Make sure the DEEBOT has not been physically moved while it was powered on—<em>If it has, kindly power it off, restart it, and place it back on the base station before restarting.</em></li>
	<li>If you see the error message "Unable to find designated area" when using Room or Zone mode, please try running <strong>AUTO vacuum only</strong> to check—<em>If it runs normally, let it complete the full cleaning cycle once, then try Room/Zone mode again.</em></li>
	<li>If the issue persists, please go to <strong>Map Management</strong>, <strong>back up</strong> the map, then <strong>restore </strong>it once completed, and try again.</li>
	<li>If it still does not work, kindly delete the current map and rebuild a new one.</li>
</ol>

<ul style="margin-left: 40px;">
	<li>When rebuilding, do not use Quick Mapping.</li>
	<li>Please select normal <strong>AUTO </strong>mode and let the DEEBOT run a full vacuum-only cleaning cycle for the entire house.</li>
</ul>
</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057T2PEAU', 'AMR Email Templates', 'Abnormal Noise', '机器异响（非工作噪音）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Please power&nbsp;<strong>OFF </strong>the DEEBOT and follow the steps below:<br />
<br />
<strong>1. Main Brush</strong></p>

<ul>
	<li>Remove the main brush from the machine.</li>
	<li>Clean and check carefully if there is any dust or debris tangled around the ends.</li>
	<li>If no issues are found, please try running the machine <strong>without </strong>the main brush on a flat floor to check if the noise persists.</li>
</ul>
<strong>2. Side Brushes</strong>

<ul>
	<li>Remove the side brushes and clean both the brushes and their bearings.</li>
	<li>When reinstalling, please make sure the<strong> color of each side brush matches the color of its slot</strong>.</li>
</ul>
<strong>3. Main Brush Cover</strong>

<ul>
	<li>Remove the main brush cover, then take out the main brush.</li>
	<li>Remove and clean the accessories on both ends.</li>
	<li>When reinstalling the cover, ensure that <strong>all four sides are properly secured</strong>.</li>
</ul>
<strong>4. Universal Wheel</strong>

<ul>
	<li>Turn the universal wheel to check whether it moves smoothly.</li>
	<li>If it does not, remove the black and white universal wheel for cleaning.</li>
</ul>
<strong>5. Driving Wheels</strong>

<ul>
	<li>Slide both driving wheels to confirm they can rotate and rebound properly.</li>
	<li>Clean them if necessary.</li>
</ul>
<strong>6. Dust Bin &amp; Filter</strong>

<ul>
	<li>Regularly clean the dust bin and filter components.</li>
</ul>
⚠️ If the filter is washed with water, please ensure it is <strong>completely dry </strong>before reinstalling and using it again.</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057T41EAE', 'AMR Email Templates', 'Low Suction', '吸力小/不足', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please kindly note that the robot will use <strong>very low suction power</strong> in certain situations:
<ul>
	<li>During the first cleaning or when creating a new map</li>
	<li>When relocating/repositioning/recharging</li>
</ul>
This is normal behavior and not a malfunction.<br />
<br />
However, if you find the suction seems weak at other times, the intake may be blocked or the Main Brush / Side Brushes may be tangled with dirt and debris. For best performance, please clean the dust bin, sensors, and filter regularly.<br />
<br />
<strong>Cleaning Steps:<br />
<br />
1. Dust Bin</strong>

<ul>
	<li>Power OFF the robot.</li>
	<li>Remove the dust bin, empty it, and reinstall it securely.</li>
</ul>
<br />
<strong>2. Main Brush</strong>

<ul>
	<li>Turn the DEEBOT upside down.</li>
	<li>Remove the Main Brush Cover, then take out the Main Brush.</li>
	<li>Remove any tangled hair or debris, and reinstall the brush.</li>
</ul>
<br />
<strong>3. Side Brushes</strong>

<ul>
	<li>Remove the Side Brushes.</li>
	<li>Wipe both the brushes and their slots with a clean, dry cloth.</li>
	<li>Reinstall them properly.</li>
</ul>
<br />
<strong>4. Charging</strong>

<ul>
	<li>Ensure that DEEBOT is fully charged before starting a cleaning cycle.</li>
	<li>You may check the battery status in the APP.</li>
	<li>If the robot is not fully charged, please allow it to charge completely before use.</li>
</ul>
<br />
<strong>5. Dust Bin &amp; Filters</strong>

<ul>
	<li>Confirm whether the dust bin or filters have been washed.</li>
	<li>Please make sure they are completely dry before the next use.</li>
</ul>
<br />
<strong>6. Auto Resume (for models with advanced mapping)</strong>

<ul>
	<li>It is recommended to turn Auto Resume ON.</li>
	<li>With Auto Resume enabled, the robot will:</li>
	<li>Resume cleaning once the battery reaches about 50%.</li>
	<li>Return automatically to the last unfinished area and continue cleaning until the next low-battery cycle.</li>
</ul>
⚠️ Please note: Auto Resume will not activate if the cleaning task is manually interrupted.<br />
<br />
<em>Additional Note:</em><br />
Work time may decrease if the vacuum power is set to Max or if the robot is used in Mopping Mode.</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057T7FEAU', 'AMR Email Templates', 'Short Working Time', '地宝工作时间短', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Charging
<ul>
	<li>Ensure that DEEBOT is fully charged before starting a cleaning cycle.</li>
	<li>You may check the battery status in the APP.</li>
	<li>If the robot is not fully charged, please allow it to charge completely before use.</li>
</ul>
<br />
2. Dust Bin &amp; Filters
<ul>
	<li>Confirm whether the dust bin or filters have been washed.</li>
	<li>Please make sure they are completely dry before the next use.</li>
</ul>
<br />
3. Auto Resume (for models with advanced mapping)
<ul>
	<li>It is recommended to turn Auto Resume ON.</li>
	<li>With Auto Resume enabled, the robot will:</li>
	<li style="margin-left: 40px;">Resume cleaning once the battery reaches about 50%.</li>
	<li style="margin-left: 40px;">Return automatically to the last unfinished area and continue cleaning until the next low-battery cycle.</li>
	<li style="margin-left: 40px;">⚠️ Please note: Auto Resume will not activate if the cleaning task is manually interrupted.</li>
</ul>
<br />
<em>Additional Note:</em><br />
Work time may decrease if the vacuum power is set to Max or if the robot is used in Mopping Mode.</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057T8rEAE', 'AMR Email Templates', 'X11 - Navigation Module Malfunction', 'X11 导航模组异常', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ul>
	<li>Power off the Deebot, and verify that the highlighted <strong>protective film</strong> is fully removed before use.</li>
</ul>

<div style="margin-left: 40px;"><img alt="Remove Bumper Protective Film" class="" src="https://ecovacs2020.file.force.com/file-asset-public/Remove_Bumper_Protective_Film?oid=00D2x000005pVxV" style="max-width: 1239.52px; width: 410.99px; height: 214.948px;" title="Remove Bumper Protective Film" /></div>

<ul>
	<li>Please gently wipe the <strong>navigation module</strong> with a clean, dry cloth.</li>
</ul>

<div style="margin-left: 40px;"><img alt="Navigation Module 11" src="https://ecovacs2020.file.force.com/file-asset-public/Navigation_Module_11?oid=00D2x000005pVxV" style="max-width: 1417.24px; width: 411.997px; height: 182.986px;" title="Navigation Module 11" /></div>

<ul>
	<li>Power the Deebot back on&nbsp;to check whether the issue persists.</li>
	<li>If the issue continues, please perform a <strong>factory reset</strong> on the Deebot.</li>
</ul>

<div style="margin-left: 40px;"><strong>Gentle Reminder: </strong>Kindly be informed that performing a reset on the Deebot will result in the deletion of all data, including the saved maps. Following the reset, Deebot will go offline and will require the network setup process to be redone to restore its online functionality.<br />
&nbsp;<br />
<strong>How to reset your Deebot:</strong><br />
To initiate a hard reset of the Deebot, press the Reset Button (a tiny grey button near the power switch) for approximately 5 seconds. You will hear a voice prompt stating "Reset to default settings," followed by the commencement of the boot music. This indicates that the default settings have been successfully restored.<br />
&nbsp;</div>



<div id="" style="left: 47.9861px; top: 55.3125px;">&nbsp;</div>

<div id="" style="left: 47.9861px; top: 55.3125px;">&nbsp;</div>
</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000057TGvEAM', 'AMR Email Templates', 'Auto Empty Station Not Picking Up Dust', 'AES自集尘基站（非OMNI station）无法成功集尘', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Check Suction Sound</strong>
<ul>
	<li>When the DEEBOT returns to the station, you should hear a suction sound.</li>
	<li>If there''s no sound, confirm that the station''s auto-empty setting is set to <strong>Extra </strong>(not Auto). Only under "<strong>Extra</strong>" will auto-empty begin when the unit docks.</li>
	<li>If there is still no response, try initiating auto-empty manually from the main page by tapping the Station icon → Empty Dust to see if suction starts.</li>
</ul>
<br />
<strong>2. Basic Checks</strong>

<ul>
	<li>Ensure the lids under the dust bin and station inlet have been removed (use the key provided).</li>
</ul>

<div style="margin-left: 40px;"><img alt="11" src="https://ecovacs2020.file.force.com/file-asset-public/X1116?oid=00D2x000005pVxV" style="max-width: 624.239px; width: 324px; height: 148px;" title="11" /></div>

<div style="margin-left: 40px;"><img alt="12" src="https://ecovacs2020.file.force.com/file-asset-public/X12?oid=00D2x000005pVxV" style="max-width: 624.239px; width: 230px; height: 184px;" title="12" /></div>

<ul>
	<li>Confirm that the dust bin is installed properly.</li>
	<li>Check that the dust bag is correctly secured.</li>
</ul>

<div style="margin-left: 40px;"><img alt="13" src="https://ecovacs2020.file.force.com/file-asset-public/X13?oid=00D2x000005pVxV" style="max-width: 624.2390624999999px" title="13" /></div>
<br />
<strong>3. Clear Any Blockages</strong>

<ul>
	<li>Inspect the evacuation tube. If blocked, unscrew it with a screwdriver and clean it using the Multi-Cleaning tool.</li>
	<li>Check the intake for any obstructions.</li>
</ul>

<div style="margin-left: 40px;"><img alt="14" src="https://ecovacs2020.file.force.com/file-asset-public/X14?oid=00D2x000005pVxV" style="max-width: 624.2390624999999px" title="14" /></div>

<div style="margin-left: 40px;"><img alt="15" src="https://ecovacs2020.file.force.com/file-asset-public/X15?oid=00D2x000005pVxV" style="max-width: 624.239px; width: 407px; height: 205px;" title="15" /></div>

<ul>
	<li>Make sure the auto-empty outlet is not jammed. If it is, loosen it carefully.</li>
</ul>
<br />
<strong>4. Other Considerations</strong>

<ul>
	<li>Confirm that Do Not Disturb mode is not enabled.</li>
	<li>Maintain the dust bag every 30 days (or more frequently if you have pets).</li>
	<li>Try changing to another power outlet and test again.</li>
</ul>

<div id="" style="left: 8px; top: 1169px;">&nbsp;</div>
</body>
</html>', 'Bella', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058J2bEAE', 'AMR Email Templates', 'Invalid Inquiry', '其他品牌或不相关咨询', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for contacting <strong>ECOVACS Robotics</strong>.<br />
<br />
Please be informed that you are currently connected with the North American support team. Our services are specifically tailored to handle <strong>Deebot</strong>, <strong>Winbot</strong>, and <strong>Goat</strong> products, as well as warranty inquiries within the USA and Canada.<br />
<br />
If you require assistance with products outside of this scope, please contact the appropriate team for further support.</body>
</html>', 'Charlie G.', 1792029242028)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058T3ZEAU', 'AMR Email Templates', 'LDS Malfunction', 'LDS 异常', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>1. Gently tap and rotate the LDS sensor using a Q-tip or your fingers to check for dust or tangles, and remove any obstructions.<br />
2. Restart the Deebot.<br />
3. If the issue persists, perform a factory reset:</p>

<div style="margin-left: 40px;"><strong>Gentle Reminder: </strong>Kindly be informed that performing a reset on the Deebot will result in the deletion of all data, including the saved maps. Following the reset, Deebot will go offline and will require the network setup process to be redone in order to restore its online functionality.<br />
<br />
<strong>How to reset your Deebot:</strong><br />
To initiate a hard reset of the Deebot, press the Reset Button (a tiny grey button near the power switch) for approximately 5 seconds. You will hear a voice prompt stating "Reset to default settings," followed by the commencement of the boot music. This indicates that the default settings have been successfully restored.</div>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058T6pEAE', 'AMR Email Templates', 'Brushes'' Storage Box Stuck - COMBO Docking Station', 'COMBO基站刷子收纳盒卡住', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ol>
	<li>Press the four corners of the storage box and try to open it.</li>
	<li>If the storage box cannot be opened, lift the right side of the station and tap the side of the storage box gently but firmly.</li>
	<li>Once opened, place the <strong>Mini Power Brush</strong>, <strong>Crevice Brush</strong>, and <strong>Flat Brush</strong> in sequence inside the box.</li>
	<li>Close the storage box securely.</li>
	<li>If the storage box still <strong>cannot </strong>be opened, or any of the brushes are missing, apply for the Mini Power Brush, Crevice Brush, and Flat Brush (<u><em>if inventory is available</em></u>) after collecting the necessary information, such as <strong>proof of purchase</strong>, <strong>shipping details </strong>(address), and <strong>contact information</strong> (full name &amp; contact#).</li>
</ol>

<div style="margin-left: 40px;"><img alt="Storage Box Stuck" class="" src="https://ecovacs2020.file.force.com/file-asset-public/Storage_Box_Stuck?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Storage Box Stuck" /></div>
&nbsp;



<div id="" style="left: 48px; top: 200px;">&nbsp;</div>

<div id="" style="left: 48px; top: 200px;">&nbsp;</div>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058TI5EAM', 'AMR Email Templates', 'DTOF Malfunction', 'DTOF 异常', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>1. Turn OFF the Deebot.<br />
2. Gently tap the D-ToF sensor 5 times.<br />
3. Wipe around the sensor with a dry, clean cloth.<br />
4. Perform a <strong>factory reset</strong> if the issue persists.</p>

<p style="margin-left: 40px;"><strong>Gentle Reminder: </strong>Kindly be informed that performing a reset on the Deebot will result in the deletion of all data, including the saved maps. Following the reset, Deebot will go offline and will require the network setup process to be redone in order to restore its online functionality.<br />
<br />
<strong>How to reset your Deebot:</strong><br />
To initiate a hard reset of the Deebot, press the Reset Button (a tiny grey button near the power switch) for approximately 5 seconds. You will hear a voice prompt stating "Reset to default settings," followed by the commencement of the boot music. This indicates that the default settings have been successfully restored.</p>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058UndEAE', 'AMR Email Templates', 'HandHeld Stuck - COMBO Docking Station', 'COMBO 系列基站手持吸尘器无法拔出', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ol>
	<li>Disconnect the power of the station, wait 60 seconds, and then reconnect it.</li>
	<li>Perform Handheld Dust Collection by quickly pressing the station button twice.</li>
	<li>Repeat <u><em>Step 2</em> </u>several times if needed, as multiple attempts may be required.</li>
	<li>If the handheld vacuum still cannot be removed, please let us know, and we will guide you through the next steps.</li>
</ol>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058Wz7EAE', 'AMR Email Templates', 'Universal Wheel Maintaining', '万向轮养护', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>Steps to Remove Hair Tanglement &amp; Dust Residue from the Universal Wheel</strong>
<ol>
	<li>Power off the Deebot and place it upside down on a clean surface.</li>
	<li>Gently pull away any hair wrapped around the wheel axle using fingers, tweezers, or scissors.</li>
	<li>Wipe the wheel and the surrounding area with a dry cloth or cotton swab.</li>
	<li>For stubborn stains, use a lightly dampened cloth (avoid excessive moisture).</li>
	<li>After cleaning, restart the Deebot and run a short cycle to check smooth movement.</li>
</ol>

<div style="margin-left: 40px;"><em>⚠️ Reminder:</em></div>

<ul>
	<li style="margin-left: 40px;">Do not rinse the wheel module with water; moisture may damage internal components.</li>
	<li style="margin-left: 40px;">Regular cleaning of the universal wheel ensures smooth navigation and prevents unnecessary "wheel stuck" alerts.</li>
</ul>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058XyPEAU', 'AMR Email Templates', 'Deebot Circles in Original Place/Circle While Running/Backward and Circle', '地宝原地转圈圈', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Confirm whether the robot is in mopping mode. If yes, remove the cleaning mop plate first. (Ignore if the Deebot has two rotary mop plates or an OZMO Roller Mop.)<br />
<br />
2. Confirm the robot is operating under AUTO Cleaning Mode.<br />
<br />
3. Power OFF the Deebot. Remove the side brush(es) and clean both the brush(es) and their bearing(s).
<ul>
	<li>Single side brush: simply clean the brush and bearing, then reinstall.</li>
	<li>Dual side brushes: note the colors of the bearings (e.g., red and green) and ensure each brush is reinstalled in the correct slot matching its bearing color.</li>
</ul>
4. Remove the Main Brush Cover and take out the Main Brush. Disassemble both ends of the main brush and clean thoroughly using the multi-cleaning tool. Reinstall the main brush cover securely. (Ignore if no main brush is installed.)<br />
<br />
5. Tap the left, middle, and right sections of the Anti-Collision Bumper to ensure it rebounds correctly.<br />
<br />
6. Wipe the Anti-Drop Sensors on the bottom of the Deebot with a clean cloth.<br />
<br />
7. Press down on both sides of the Driving Wheels while sliding them to ensure smooth rotation/rebound, and clean any debris.<br />
<br />
8. Rotate the Universal Wheel and check for any tangled hair or debris.<br />
<br />
9. Place the robot in an open environment and restart a cleaning cycle. Avoid strong light exposure or dark surfaces, as these may affect the Deebot''s performance.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058ZXBEA2', 'AMR Email Templates', 'Water Tank Abnormal/Not properly installed', '水箱异常/未正常安装', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ol>
	<li>Remove the water tank from the station and inspect it carefully to ensure there is no damage or breakage.</li>
	<li>Check and clean the sealing plugs, making sure they are in good condition and properly installed.</li>
	<li>Reinstall the water tank onto the station. Then, power cycle the station by unplugging it for 60 seconds and plugging it back in. After that, check whether the alarm occurs again.</li>
</ol>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058aLCEAY', 'AMR Email Templates', 'Unable to Use Live View/Video Manager', '地宝视频管家功能无法使用', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Update the Firmware:</strong><br />
Ensure your Deebot''s firmware is updated to the latest version. To check, go to Settings &gt; About Deebot (or Settings &gt; Robot Advanced Settings &gt; About Your Robot &gt; Update).<br />
<br />
<strong>2. Check Wi-Fi Connection:</strong><br />
Confirm that your Wi-Fi connection is stable. The Video Manager/Live View works best in areas with a strong Wi-Fi signal. If it doesn''t load via Wi-Fi, try switching to cellular data to see if that works.<br />
<br />
<strong>3. Clear App Cache and Reinstall:</strong><br />
Clear the app''s cache by going to <strong>Mine &gt; Settings &gt; Clear Cache</strong>. Then, reinstall the app to ensure you have the latest version installed.<br />
<br />
<strong>4. User Authorization:</strong><br />
The Video Manager/Live View requires user authorization. Please confirm that you''ve agreed to the corresponding privacy agreement before using it.<br />
<br />
<u><em>5. If the issue persists, please provide the following:</em></u>
<ul>
	<li>A screenshot of the error message at the end of the loading phase.</li>
	<li>A picture of the serial number of your Deebot.</li>
</ul>

<div style="margin-left: 40px;">&nbsp;<img alt="X8 Deebot Sn" src="https://ecovacs2020.file.force.com/file-asset-public/X8_Deebot_Sn?oid=00D2x000005pVxV" style="max-width: 939.268px; width: 384px; height: 511.344px;" title="X8 Deebot Sn" /></div>

<div>&nbsp;</div>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058b9BEAQ', 'AMR Email Templates', 'Firmware Upgrade Instructions, Deebot/Goat', '固件更新指引', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">If you''re experiencing issues with the firmware upgrade on your robot, this general troubleshooting guide will help you resolve the problem and ensure a smooth upgrade process.<br />
<br />
<strong>Steps for a Successful Firmware Upgrade:<br />
1. Ensure Your App is Up-to-Date:</strong><br />
Make sure the <strong>Ecovacs Home App</strong> is up to date. An outdated app can sometimes interfere with the upgrade process. Check for any available updates in your app store.<br />
<br />
<strong>2. Ensure the DEEBOT/GOAT is On and On the Charging Dock:</strong><br />
Make sure your DEEBOT/GOAT is turned on and properly placed on the charging dock. The app will display a <strong>green lightning icon</strong> next to the power display when everything is set up correctly.<br />
<br />
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image4?oid=00D2x000005pVxV" style="max-width: 1098.223193359375px" title="image" /><br />
<br />
<br />
<strong>3. Charge the DEEBOT/GOAT or Ensure the Battery is Sufficient:</strong><br />
Charge the DEEBOT/GOAT for at least <strong>2 hours </strong>or ensure the battery is above <strong>50%</strong>. This is crucial for the firmware upgrade to proceed smoothly.<br />
<br />
<strong>4. Check Internet Connectivity:</strong><br />
Ensure both your <strong>mobile device and DEEBOT/GOAT</strong> are connected to the internet. A stable Wi-Fi connection is necessary for the firmware to download and install properly.<br />
<br />
<strong>5. Proceed to Click the Firmware Upgrade Option in the App:</strong><br />
After ensuring the above conditions are met, go to the app and select the <strong>Firmware Upgrade</strong> option to start the process.<br />
<img alt="img_v3_02q9_27993947-d1c0-49f7-9918-027ad64d764g" src="https://ecovacs2020.file.force.com/file-asset-public/img_v3_02q9_27993947d1c049f79918027?oid=00D2x000005pVxV" style="max-width: 1098.223193359375px" title="img_v3_02q9_27993947-d1c0-49f7-9918-027ad64d764g" /><br />
<br />
<strong>6. Wait for the Upgrade to Complete:</strong><br />
Once the firmware upgrade begins, allow the process to finish without interruption. Turning off or disconnecting the DEEBOT/GOAT during the upgrade could cause issues.<br />
<br />
<em><strong>If the Update Fails:</strong></em><br />
If the firmware upgrade fails, <strong>do not attempt to update immediately.</strong> Instead, try the following alternative resolutions:
<ul>
	<li><strong>Re-add the DEEBOT/GOAT to the App:</strong>
	<ul>
		<li>Delete the robot from the app and re-add it. This helps reset the connection and can resolve issues preventing the upgrade from completing.</li>
	</ul>
	</li>
	<li><strong>Use Mobile Hotspot:</strong>
	<ul>
		<li>Try connecting the DEEBOT/GOAT to your phone’s mobile hotspot. This can help bypass potential Wi-Fi network issues, allowing the upgrade to complete successfully.</li>
	</ul>
	</li>
</ul>
<br />
<em><strong>If the Issue Persists:</strong></em><br />
<strong>-Check the DEEBOT''s Firmware Version:</strong><br />
Verify the firmware version in the app. Take a screenshot of this screen for reference.<br />
<br />
<strong>-Contact Support:&nbsp;</strong><br />
If you''re still having issues, please contact customer support. When reaching out, provide us with the following details:
<ul>
	<li><strong>Ecovacs Home App version&nbsp;</strong>

	<ul>
		<li>Find this after you open the App, hit Mine &gt; About &gt; Version</li>
	</ul>
	</li>
	<li><strong>DEEBOT/GOAT Serial Number&nbsp;</strong>
	<ul>
		<li>For <strong>DEEBOT</strong>, find it in <strong>Settings &gt; Robot Advanced Settings &gt; About Your Robot &gt; Serial Number</strong>, or underneath the DEEBOT''s dustbin.&nbsp;</li>
		<li>For <strong>GOAT</strong>, the <strong>serial number is at the rear end of the GOAT, next to the QR Code,</strong> or at the bottom of the GOAT</li>
	</ul>
	</li>
	<li><strong>Screenshot of the robot''s firmware version</strong>&nbsp;
	<ul>
		<li>For <strong>DEEBOT</strong>, go to <strong>Settings &gt; Robot Advanced Settings &gt; About Your Robot &gt; Update</strong></li>
		<li>For <strong>GOAT</strong>, go to <strong>Settings &gt; Robot &gt; Upgrade</strong></li>
	</ul>
	</li>
</ul>
&nbsp;&nbsp;<br />
By following this troubleshooting guide, most firmware upgrade issues should be resolved. If you need additional assistance, don''t hesitate to reach out to us.</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058bVmEAI', 'AMR Email Templates', 'Inform Temporary PIN Code', '告知用户临时PIN码 (蓝牙模式进入仍无法修改PIN)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your continued patience.<br />
<br />
We''ve just received an update from our technical support team. Please use the temporary PIN code <strong><span style="color:#c0392b;">XXXX</span></strong> to unlock your GOAT.<br />
<br />
If you need any further assistance, please feel free to reach out.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058dnhEAA', 'AMR Email Templates', 'RTK Coverage', 'RTK 信号覆盖范围', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">In an ideal open environment, the typical signal coverage range of an RTK base station is 300-400 meters (approximately 1,000-1,300 feet).<br />
<br />
However, in more complex environments, such as courtyards with buildings and vegetation, the effective coverage range is usually reduced to around 80 meters (approximately 260 feet) due to signal obstructions.<br />
<br />
Additionally, scenarios that span across multiple streets are typically not feasible.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058eS2EAI', 'AMR Email Templates', 'Customer Requesting to Close Case', '用户主动要求关单', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for getting back to us.<br />
<br />
If you need further assistance in the future, please don''t hesitate to reach out—we''re always here to help.<br />
<br />
As per your request, we will be closing this support case to prevent any future disturbances or confusion caused by any potential automated system-generated email reminders.<br />
<br />
Thank you again for reaching out, and we appreciate your understanding!</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058g8rEAA', 'AMR Email Templates', 'Factory Reset Goat', '恢复出厂设置 - 割草机', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Follow the steps below to <strong>factory reset </strong>your GOAT:
<ol>
	<li>Power <strong>on </strong>the GOAT: Press and hold the <strong>OK </strong>button for about 3 seconds.</li>
	<li>Initiate Reset: Press and hold the <strong>Start </strong>and <strong>Home </strong>buttons simultaneously until the GOAT reboots.&nbsp;<img alt="Factory Reset Goat" src="https://ecovacs2020.file.force.com/file-asset-public/Factory_Reset_Goat?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Factory Reset Goat" /></li>
</ol>

<ul>
	<li><em>Note: This reset will erase all stored data on the device except for the accessory lifespan (e.g., blades and camera brushes).</em></li>
</ul>
<br />
Once the GOAT reboots, check the display screen. If a flashing Lock icon appears, set a new PIN code and continue with the setup process.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058gATEAY', 'AMR Email Templates', 'About to Apply for Temporary PIN', '即将申请GOAT的临时PIN', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your prompt response.&nbsp;<br />
<br />
We are assisting you with submitting a request for a temporary PIN. Please be assured that we will keep you informed and notify you as soon as we have any updates regarding your request.&nbsp;<br />
<br />
We appreciate your patience and understanding. Should you require any further assistance, please don''t hesitate to let us know.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058gbtEAA', 'AMR Email Templates', 'General Media Inquiry', '一般媒体合作咨询', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for your interest in working with us.<br />
<br />
For partnership inquiries, you can also reach out to the responsible team directly at:<br />
&nbsp;📧 marketingglobal@ecovacs.com.<br />
<br />
We appreciate your attention and continued support of ECOVACS!</p>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058kFiEAI', 'AMR Email Templates', 'Machine Offline', '地宝离线', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>Possible reasons the DEEBOT may appear offline:</strong>
<ol>
	<li>If the DEEBOT is not operated or placed back onto the Docking Station for a long time after being powered on or off, it may go offline.</li>
	<li>If the DEEBOT shows offline while on the Charging Dock, gently pull it back and forth to see if you hear the startup tone. If you do, the DEEBOT may have powered off automatically. In this case, please check whether the Docking Station&nbsp;is properly connected to power and that the socket connection is secure.</li>
</ol>
<br />
<strong>Check the Wi-Fi indicator light:</strong>

<ul>
	<li>Wi-Fi light ON: Exit the APP, log in again, and refresh.</li>
	<li>Wi-Fi light flashing:</li>
</ul>

<div style="margin-left: 40px;">a. Open the top cover, switch OFF the DEEBOT, then turn it back ON (make sure the network coverage is good). Refresh the APP to check if it comes online.<br />
b. Restart your router, then refresh the APP to see if the DEEBOT reconnects.<br />
<br />
<em>If the issue persists, please reconnect the DEEBOT to Wi-Fi by following the network setup steps in the APP.</em></div>
<br />
<strong>In a multi-router network environment:</strong>

<ul>
	<li>If your home has multiple routers (up to 10 are supported), the DEEBOT can automatically switch between them depending on signal quality.</li>
	<li>If you are using a mesh or extended router system, please first connect the DEEBOT to the main router. Once successful, turn on the extension routers one by one.</li>
</ul>
<br />
<strong>After changing the Wi-Fi/router:</strong>

<ul>
	<li>Please reconnect your DEEBOT to the network using the setup steps in the APP.</li>
</ul>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058kcHEAQ', 'AMR Email Templates', 'Change Goat PIN', '用户***记得***原始的PIN', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.&nbsp;<br />
<br />
If you would like to <strong>change </strong>the PIN code after the initial setup of your GOAT, please follow these steps:<br />
<br />
1. Open the robot control page via Standard Mode (WiFi Mode – no need to be near the machine) or Bluetooth Mode (recommended to be within 6 meters of the GOAT).&nbsp;<br />
<br />
2. Tap <strong>Settings</strong>, then select <strong>Robot</strong>.&nbsp;<br />
<br />
3. Go to <strong>Robot Settings</strong>, then enter <strong>Safety Settings</strong>.<br />
<img alt="Change Pin 1" src="https://ecovacs2020.file.force.com/file-asset-public/Change_Pin_1?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Change Pin 1" /><br />
<img alt="Change Pin 2" src="https://ecovacs2020.file.force.com/file-asset-public/Change_Pin_2?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 333px; height: 688px;" title="Change Pin 2" /><br />
<br />
4. Tap <strong>Change PIN Code</strong> and follow the on-screen instructions.<br />
<img alt="Change Pin 3" src="https://ecovacs2020.file.force.com/file-asset-public/Change_Pin_3?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 333px; height: 688px;" title="Change Pin 3" /><br />
<br />
If you need further assistance, please don''t hesitate to reach out again. We are always here to help!
<div id="" style="left: 8px; top: 1706px;">&nbsp;</div>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058knZEAQ', 'AMR Email Templates', 'Forgot PIN, Need Resetting', '用户***忘记***原PIN，需要自行重置', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.&nbsp;<br />
<br />
If you have <strong>forgotten </strong>your PIN code:<br />
1. Open the robot control page via Standard Mode (WiFi Mode) or Bluetooth Mode (recommended within 6 meters).<br />
<br />
2. Tap <strong>Settings</strong>, then select <strong>Robot</strong>.<br />
<br />
3. Go to <strong>Robot Settings</strong>, then enter <strong>Safety Settings</strong>.<br />
<img alt="Change Pin 1" src="https://ecovacs2020.file.force.com/file-asset-public/Change_Pin_1?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Change Pin 1" /><br />
<img alt="Change Pin 2" src="https://ecovacs2020.file.force.com/file-asset-public/Change_Pin_2?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 333px; height: 688px;" title="Change Pin 2" /><br />
<br />
4. Tap Forgot PIN Code and follow the prompts to reset it.<br />
<img alt="Change Pin 4" src="https://ecovacs2020.file.force.com/file-asset-public/Change_Pin_4?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 334px; height: 654px;" title="Change Pin 4" /><br />
<br />
If you need further assistance, please don''t hesitate to reach out again. We are always here to help!</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058l5JEAQ', 'AMR Email Templates', 'Collect Goat SN - Temporary PIN Needed to Unlock Goat', '割草机开箱就有PIN锁定，无法使用', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.&nbsp;<br />
<br />
If your GOAT shows a <strong>Lock </strong>symbol in the top-left corner of the display when you first receive it, the device is locked before initial setup and binding to your Ecovacs account.<br />
&nbsp;<br />
To <strong>unlock </strong>the GOAT, please provide the following information so we can issue a temporary PIN code:<br />
<br />
1. A <strong>picture </strong>of the GOAT''s serial number: Located at the rear of the mower next to the QR code or on the bottom of the device.<br />
<img alt="Goat SN 1" src="https://ecovacs2020.file.force.com/file-asset-public/Goat_SN_1?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Goat SN 1" />&nbsp;<img alt="Goat SN 2" src="https://ecovacs2020.file.force.com/file-asset-public/Goat_SN_2?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Goat SN 2" /><br />
<br />
2. <strong>Proof of purchase</strong>: A complete invoice or receipt including order date, order number, purchase channel, original seller, and machine condition.<br />
<br />
<u>Once unlocked, you can perform a<strong> factory reset </strong>on the GOAT and complete the setup and binding process at your own pace.</u><br />
<br />
<strong>GOAT Factory Reset Instructions:</strong>
<ul>
	<li>Power on the GOAT: Press and hold the OK button for about 3 seconds.</li>
	<li>Initiate Reset: Press and hold the Start and Home buttons simultaneously until the GOAT reboots.</li>
</ul>

<div style="margin-left: 40px;"><em>Note: This reset will erase all stored data on the device, except for the accessory lifespan (e.g., blades and camera brushes).</em></div>
<br />
<br />
If you need further assistance, please don''t hesitate to reach out again. We are always here to help!</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000058lgPEAQ', 'AMR Email Templates', 'Data Acquisition Time Out', '数据采集​​超时', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">If you encounter issues such as data submission exceptions, information acquisition timeouts, or the interface not loading, it may be related to the network. Please try the following steps:<br />
<br />
<strong>1. Check Permissions</strong>
<ul>
	<li>Go to your phone''s settings → application permissions → ensure the App has network access.</li>
	<li>Alternatively, uninstall and reinstall the App, and allow all permission prompts during installation.</li>
</ul>
<br />
<strong>2. Clear Cache &amp; Restart</strong><br />
Clear the app''s cache by going to <strong>Mine &gt; Settings &gt; Clear Cache</strong>. Then, restart the App.<br />
<br />
<strong>3. Switch Network</strong>

<ul>
	<li>Turn off Wi-Fi and switch to mobile data, then exit and reopen the App.</li>
	<li>Or connect your phone to a mobile hotspot and try again.</li>
</ul>
<br />
<strong>4. Reinstall App</strong><br />
Delete the App and re-download it.<br />
<br />
<strong>5. Reconnect Device</strong><br />
Remove the device from the App and reconnect it to the network.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059Fp5EAE', 'AMR Email Templates', 'Goat Blade Issue', '刀片问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out. Please try the steps below:</p>

<ol>
	<li>Check if any grass or debris is blocking the blades or blade disc.</li>
	<li>Remove and reinstall the blades and blade disc.&nbsp;</li>
	<li>Restart the machine.</li>
</ol>
&nbsp;

<div style="margin-left: 40px;"><em>Maintenance Video References:</em></div>

<ul>
	<li style="margin-left: 40px;">Goat A series: <a href="https://youtu.be/GXPj_qClXZc">https://youtu.be/GXPj_qClXZc</a></li>
	<li style="margin-left: 40px;">Goat O series: <a href="https://youtu.be/eIun45yeb28">https://youtu.be/eIun45yeb28</a></li>
</ul>

<div style="margin-left: 40px;">&nbsp;</div>

<div>&nbsp;</div>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059J29EAE', 'AMR Email Templates', 'App Connecting Issue/How to Connect', '联网', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>1. Please ensure your APP is updated to the latest version. Then you may refer to the <strong>"Scan to Connect"</strong> page. Then, use the<strong> Ecovacs Home App to scan the QR code</strong> on the DEEBOT. (If you do not have the QR code sticker, you may refer to the bottom to select a robot.)<br />
&nbsp;&nbsp;<img alt="20251015-222509" src="https://ecovacs2020.file.force.com/file-asset-public/X20251015222509?oid=00D2x000005pVxV" style="max-width: 710.125px; width: 287px; height: 594px;" title="20251015-222509" /><img alt="20251015-222837" src="https://ecovacs2020.file.force.com/file-asset-public/X20251015222837?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="20251015-222837" /></p>

<p><br />
2. DEEBOT <strong>only supports 2.4GHz Wi-Fi</strong>. If you are using a dual-band router, kindly select the 2.4GHz network when setting up, or temporarily disable the 5GHz band in your router settings.</p>

<p><br />
3. Double-check your home Wi-Fi password. We recommend using a simple combination of letters and numbers. Special characters (such as Chinese symbols or underscores) may not be recognized by DEEBOT.<br />
<br />
4. Follow the instructions shown in the APP during the setup. (Tip: Short-press the <strong>RESET button</strong> until you hear the voice prompt "<strong>Ready for network setup/Bluetooth hotspot has been released,"</strong>&nbsp;then continue to the next step.)<br />
&nbsp;<br />
PS: Please <strong>do not hold down the RESET button for too long (More than 3 seconds)</strong>. It will reset the robot to factory settings instead of initiating the network connection.&nbsp;<br />
<img alt="20251015-223129" src="https://ecovacs2020.file.force.com/file-asset-public/X20251015223129?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="20251015-223129" /><br />
<br />
5. Once your phone connects to the Wi-Fi signal "<strong>Ecovacs-XXXX"&nbsp;</strong>(Sometimes, <strong>it will show up as Ecovacs_XXXX wants to join your network,</strong> please press "<strong>Join</strong>") broadcast by DEEBOT, you should hear the prompt "DEEBOT is connected with the mobile phone, please wait for the result in the APP." (Note: Some Android phones may skip this step.) Make sure to return to the DEEBOT APP right away and wait there—otherwise, you may need to restart from Step 2.<br />
<br />
6. If your home has multiple Wi-Fi networks, we recommend turning off the unused ones temporarily. This ensures your phone stays connected to the correct Wi-Fi during the setup and avoids failed connections.<br />
&nbsp;<img alt="20251015-223222" src="https://ecovacs2020.file.force.com/file-asset-public/X20251015223222?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="20251015-223222" /><br />
<br />
Here are some video tutorials for our popular models for your reference:<br />
<a href="https://youtu.be/T5I_l5NuMNc?t=90">X11 Series</a><br />
<a href="https://youtu.be/ug5iDv2aLBU?t=15">X9 Series</a></p>
</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059L8nEAE', 'AMR Email Templates', 'Map Lost/Map Mess/Map Overlap', '丢图/图乱/图堆叠', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">If your model supports the <strong>Restore Map</strong> function in the app, please go to <strong>Map Management</strong> and select <strong>Recover Map</strong>.<br />
<img alt="20251015-232031" src="https://ecovacs2020.file.force.com/file-asset-public/X20251015232031?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="20251015-232031" /><img alt="20251015-232123" src="https://ecovacs2020.file.force.com/file-asset-public/X20251015232123?oid=00D2x000005pVxV" style="max-width: 710.125px; width: 278.993px; height: 550.972px;" title="20251015-232123" /><br />
<br />
&nbsp;If your model <strong>does not support</strong> <strong>this function</strong>, kindly follow the steps below:<br />
1. Remove the DEEBOT from the Charging Dock and turn it <strong>OFF</strong>, then turn it back <strong>ON</strong>. After that, place it back on the Charging Dock.<br />
2. Stay a short distance away from the robot to avoid interference. The DEEBOT will announce, "<strong>Map is recovering</strong>." After a short while, it should confirm "<strong>Map recovery succeeded."</strong>&nbsp;If recovery fails, please repeat the process several times.<br />
3. If the map still cannot be restored, we recommend rebuilding a new map.<br />
<br />
<strong>Gentle Reminder:</strong><br />
Maps cannot be restored after performing a <strong>map reset</strong> or a <strong>factory reset</strong> on the robot.<br />
<br />
<strong>Possible Causes of Map Loss:</strong><br />
1. The robot is moved or lifted during cleaning. If using multiple maps, always power off the robot first and restart it from the Charging Dock.<br />
2. The robot gets stuck during operation and is manually carried back to the Charging Dock.<br />
3. The robot is powered off before the map has been successfully saved.<br />
4. The Charging Dock is moved, or the surrounding environment near the dock is changed.<br />
5. Pets follow or interfere with the robot while it is cleaning.</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059PQvEAM', 'AMR Email Templates', 'Connect to Alexa', '连接Alexa', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Set up your DEEBOT</strong><br />
Download the ECOVACS App and complete the Wi-Fi setup for your DEEBOT.<br />
<br />
<strong>2. Prepare Alexa</strong>
<ul>
	<li>Download the Alexa App and sign in.</li>
	<li>Power on your Echo device and connect it to a Wi-Fi network.</li>
	<li>Test Alexa by talking to it to confirm it''s working.</li>
</ul>
<strong>3. Link DEEBOT with Alexa</strong>

<ul>
	<li>Open the Alexa App and search for the "ECOVACS"&nbsp;or "DEEBOT" skill.</li>
	<li>Select Enable and sign in with your ECOVACS account to link your robot.</li>
</ul>
<br />
<strong>4. Video Reference</strong>

<ul>
	<li>For step-by-step setup guidance, please refer to this video:</li>
</ul>
<a href="https://www.youtube.com/watch?v=Mk7sglrsdqk&amp;list=PLNYDAtVmKTnw3m-4hbPP64o7lRIMY1Bcg&amp;index=51">Alexa &amp; DEEBOT Setup Tutorial</a><br />
<br />
<br />
<em><strong>Reminders</strong></em>

<ul>
	<li>If your ECOVACS account already has a supported DEEBOT connected to Wi-Fi, Alexa will display it in the device list.</li>
	<li><strong>If you see the message "You have no devices in your Ecovacs account or your devices are currently not supported," it means your model is not compatible with Alexa.</strong></li>
	<li>Once setup is complete, Alexa will confirm. You can then control your DEEBOT with voice commands, such as:
	<ul>
		<li><em>"Alexa, ask DEEBOT to start cleaning."</em></li>
	</ul>
	</li>
</ul>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059PltEAE', 'AMR Email Templates', 'DEEBOT & Station Communication Malfunction', '地宝与基站断联/通信异常', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please try the following troubleshooting steps:
<ul>
	<li>First, check the firmware version in the app and ensure it is updated to the latest version.</li>
	<li>If the issue continues, unplug the power cord from the station, and in the meantime, turn off the DEEBOT. Wait for 3–5 minutes, then plug the station back in.</li>
	<li>Restart the DEEBOT and check if the error persists.</li>
</ul>
<br />
If the problem continues after completing these steps, please let us know, and we will be happy to assist you further.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059UqREAU', 'AMR Email Templates', 'X1 Omni: How to divide area', 'X1 划分区域/区域不能划分', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">For the area dividing function, please kindly refer to the information below:<br />
<br />
D-ToF-equipped models are generally designed with this feature. The machine will automatically scan and map your home, dividing it into different areas. Once this is complete, you can intelligently select specific areas or key zones for cleaning.<br />
<br />
<strong>Please note the following when dividing areas manually:</strong>
<ul>
	<li>Ensure there are no obstacles in between the area you intend to divide.</li>
	<li>The area must be enclosed (i.e., a closed space).</li>
	<li>When drawing division lines in the app, please make sure the points you select "hit" the walls accurately.</li>
</ul>
</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059WnNEAU', 'AMR Email Templates', 'X8/T80/X9 Cannot Find Base Station', 'X8/T80/X9 无法找到基站位置', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us. If your robot is unable to return to the station, please try the following troubleshooting steps based on the issue you''re experiencing:<br />
&nbsp;<br />
<strong>1. If the robot cannot find the station:&nbsp;</strong>
<ul>
	<li>Make sure the station has power:<br />
	Check for the indicator light on the front of the station. If the light is off, please inspect the back of the station. Near the power port, you should see a rocker switch—make sure it is set to the “I” position. Also, confirm that the power cord is fully plugged into the station and the wall outlet. <strong>Once powered correctly, the indicator light on the station should turn on.</strong></li>
</ul>
&nbsp;<br />
<strong>2. If the robot finds the station but fails to enter or exit automatically:</strong>

<ul>
	<li>Check for water stains on the station base and the surrounding floor. If present, wipe them away with a dry cloth.</li>
	<li>Ensure the roller mop is properly installed. If it appears properly installed but still doesn''t function, try reinstalling it.</li>
	<li>Verify that the base and mop washing tray are properly installed. If not, remove and reinstall both components.</li>
	<li>Check if the station''s charging contacts are dirty. If so, clean the contacts and ensure that the spring-back mechanism functions properly.</li>
	<li>Ensure the ejector rod inside the station is not raised. If it is, power off the station and restart it.</li>
</ul>
&nbsp;<br />
We hope these steps help resolve the issue. If you continue to experience difficulties or need further assistance, please don''t hesitate to reach out.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059XptEAE', 'AMR Email Templates', 'Winbot Stuck Outside/Cannot Return to Start Point', '窗宝在外窗卡住/无法回到清洁起点', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for contacting us. We understand you''re experiencing difficulty controlling your Winbot through the app, and we want to help resolve the issue promptly. Please refer to the following troubleshooting steps based on whether your Winbot is connected or not.<br />
<br />
<strong>Scenario 1: Winbot is Connected to the Network (Online)</strong><br />
<br />
<strong>1. Use the App for Remote Control:</strong><br />
First, try operating the Winbot via the ECOVACS Home App. If you are unable to access the control interface, continue with the next steps.<br />
<br />
<strong>2. Check the Distance Between the Phone and Winbot:</strong><br />
Ensure that your phone is <strong>within 5 meters (about 16.4 feet)</strong> of the Winbot. A distance beyond this could result in a Bluetooth connection drop.<br />
<br />
<strong>3. Check for Multiple Phones Connected:</strong><br />
If you have more than one phone connected to the Winbot, it could cause a conflict. Please try disabling Bluetooth on one of the phones and retry.<br />
<br />
<strong>4. Device May Have Frozen:</strong><br />
If, after the above checks, you still cannot access the device, the Winbot may have frozen. In this case, the only solution is to pull the power cord directly to reset the device.<br />
<br />
<strong>Note: </strong>For corded models, turn off the device first, then gently pull the power cord. For non-corded models, simply pull the power cord directly.<br />
<br />
<br />
<strong>Scenario 2: Winbot is Not Connected to the Network (Offline)</strong><br />
<br />
<strong>1. Manual Network Addition:</strong><br />
If your Winbot is not connected, you can manually add the device to your app and proceed with the network setup, even if the device is in operation.<br />
<br />
<strong>2. Unable to Remote Control After Network Setup:</strong><br />
If the device connects successfully but you still cannot control it remotely, the only solution is to pull the power cord directly to reset the device.<br />
<br />
<strong>Note:</strong> For corded models, unplug the device and plug it back in. For non-corded models, simply pull the power cord to reset.<br />
<br />
<strong>App Download (If Necessary):</strong><br />
If you have not yet downloaded the ECOVACS Home App, please ensure it is installed and you are properly registered to connect your device.<br />
<br />
We hope this resolves the issue, but if the problem persists, please do not hesitate to reach out for further assistance.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059crCEAQ', 'AMR Email Templates', 'X1+/T10+: No water seepage', '强拖水箱不出水', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Check whether there is sufficient water in the clean water tank and ensure both the tank and mopping plate are properly installed.<br />
&nbsp;• Inspect the water outlets at the bottom and confirm they are clean and free of blockages.<br />
<img alt="e392224a-bb45-4015-8525-23da5b13db2c" src="https://ecovacs2020.file.force.com/file-asset-public/e392224abb454015852523da5b13db2c?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="e392224a-bb45-4015-8525-23da5b13db2c" /><br />
&nbsp;• Set the mopping water level to "High" and the scrubbing intensity to "Strong."<br />
<img alt="image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_14?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image (1)" /><img alt="1f9be516-efef-4630-a76a-4625019f7bbd" src="https://ecovacs2020.file.force.com/file-asset-public/X1f9be516efef4630a76a4625019f7bbd?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="1f9be516-efef-4630-a76a-4625019f7bbd" /><br />
&nbsp;• Restart the cleaning process from the charging base to further test the performance.</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059dYjEAI', 'AMR Email Templates', 'Too Much Foam In Mop Washing Tray', '清洁槽泡沫累积', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">To help us resolve this matter efficiently, we would like to kindly ask if you could confirm the following:<br />
<br />
<strong>1. Use of Recommended Cleaning Solution</strong><br />
Please ensure that you are using the <a href="https://www.ecovacs.com/us/deebot-winbot-accessories/deebot-cleaning-solution-1l">Ecovacs Deebot Cleaning Solution</a>. We recommend this solution as it is specially formulated to be gentle, neutral, and low-foam. Using other cleaning solutions may affect the softness and fluffiness of the <strong>mop pads</strong> or the <strong>OZMO ROLLER</strong> mop, potentially leading to decreased cleaning performance.<br />
<img alt="image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_13?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image (1)" /><br />
<br />
<strong>2. Correct Solution Addition</strong><br />
If you are using the <strong>Ecovacs Deebot Cleaning Solution</strong> and have added it to the clean water tank but <strong>not </strong>to the <strong>Solution Container</strong>, please ensure that the correct amount is being used while having the "<strong>Intelligent addition of Cleaning Solution</strong>" feature <strong>disabled</strong>. If this step has not been properly followed, we kindly ask you to:
<ul>
	<li>Empty the clean water tank, rinse it thoroughly until foam-free, and dry it in a well-ventilated area before use.</li>
</ul>
<strong>3.</strong> <strong>Important Reminder</strong>: The ideal solution-to-water ratio is 1 part cleaning solution to 200 parts water. If the <strong>"Intelligent addition of Cleaning Solution"</strong> feature is enabled, the station will automatically dispense the correct amount during the cleaning process. If this feature is <strong>disabled</strong>, and you are manually adding the solution, please ensure that you add <strong>2 bottle caps </strong>of the cleaning solution for every 4L of water in the tank.<br />
<img alt="884f2add-5ba9-4ed7-887d-c2c83eef0a0c" src="https://ecovacs2020.file.force.com/file-asset-public/X884f2add5ba94ed7887dc2c83eef0a0c?oid=00D2x000005pVxV" style="max-width: 1098.223193359375px" title="884f2add-5ba9-4ed7-887d-c2c83eef0a0c" /><br />
<br />
<strong>4. Solution Container Care</strong><br />
If you are adding the cleaning solution directly to the Solution Container, please ensure that the solution <strong>does not exceed the outlet.</strong> For reference, we have provided an image below showing the approximate proper amount.<br />
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image5?oid=00D2x000005pVxV" style="max-width: 1098.223193359375px" title="image" /><br />
<br />
<strong>If the foam persists,</strong> we kindly suggest the following steps:<br />
1. Temporarily disable the <strong>"Intelligent addition of Cleaning Solution"</strong> feature.<br />
2. Perform <strong>3 (three) full cleaning cycles (Auto Mode)</strong> without the solution feature enabled.<br />
3. After completing these cycles, enable the solution dispensing feature again and observe whether the foam issue continues.</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059e6cEAA', 'AMR Email Templates', 'N30 Not Connecting to App', 'N30 联网问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us regarding the connection issue with your Deebot. In order to resolve the problem efficiently, please ensure that you have followed these steps:<br />
<br />
<strong>1. Power Off and On:</strong>
<ul>
	<li>Turn off the Deebot by holding the power button for about 3 seconds.</li>
	<li>Then, turn it on again by pressing the power button for 3 seconds, until you hear the startup music.</li>
</ul>
<br />
<strong>2. Connect via App:</strong>

<ul>
	<li>Scan the QR code near the dustbin with the Ecovacs Home App.</li>
	<li>Ensure that your phone is connected to a 2.4GHz Wi-Fi network.</li>
	<li>Enter your home Wi-Fi name and password carefully.</li>
</ul>
<br />
<strong>3. Activate Network Setup:</strong>

<ul>
	<li>Remove the top lid/cover of the Deebot.</li>
	<li>Press and hold the <strong>Spot Clean and Return to Base&nbsp;(Home) buttons</strong> together for no more than 1 second.&nbsp;</li>
	<li>Listen for the "Entering Network Setup Mode" sound.</li>
	<li>If you hear it, check the app for a notification to join the Deebot''s Wi-Fi (e.g., Ecovacs_xxxx). Press "Join" and proceed. If not, press the Wi-Fi button again until you hear the sound.</li>
	<li>If this doesn''t work, locate the Reset button under the plastic cover above the QR code and press it briefly to release the signal.</li>
</ul>

<div style="margin-left: 40px;"><img alt="N30 Connecting App Method" class="" src="https://ecovacs2020.file.force.com/file-asset-public/N30_Connecting_App_Method?oid=00D2x000005pVxV" style="max-width: 650.3640624999999px" title="N30 Connecting App Method" /></div>
<br />
<strong>4. Confirm Connection:</strong>

<ul>
	<li>Once the connection is established, the Deebot will say, "Connected, please return to the app."</li>
	<li>Stay in the app to finalize the setup.</li>
	<li>If successful, you''ll be prompted to name your Deebot.</li>
</ul>
<br />
<em>If the issue persists:</em><br />
In order to better investigate the issue, it would be highly appreciated if you could send us any relevant videos or screenshots that indicate the problem.<br />
<br />
For quality assurance purposes, please kindly provide us with proof of purchase, including the order number, the date of purchase, the purchase channel, and the model of the device.<br />
&nbsp;<br />
Please feel free to let us know if you have any questions.


<div id="" style="left: 48px; top: 584px;">&nbsp;</div>

<div id="" style="left: 48px; top: 584px;">&nbsp;</div>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059ekvEAA', 'AMR Email Templates', 'X1 Omni: How to Change the Time Zone', 'X1 Omni: 改时区', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">After confirming in the app, please try to synchronize the time zone with your mobile device. The app is designed to automatically sync with your phone''s time zone. You may follow the steps below for guidance:<br />
<br />
1. Open the ECOVACS app.<br />
2. Swipe up to access more options on the Deebot control page.<br />
3. Tap on <em>Settings </em>and navigate to the <em>About Deebot </em>section.<br />
4. Select <em>Time Zone</em> for more details.<br />
5. You may either press the blue button at the top of the page to sync with your phone''s time zone or manually select your preferred time zone using the "Use" button.<br />
<img alt="image (2)" src="https://ecovacs2020.file.force.com/file-asset-public/image_2220902202803?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image (2)" /><br />
<img alt="image (3)" src="https://ecovacs2020.file.force.com/file-asset-public/image_31?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image (3)" /><br />
<img alt="image (4)" src="https://ecovacs2020.file.force.com/file-asset-public/image_41?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image (4)" /><br />
<img alt="c42e2fa1-3894-4a12-a9b3-b3f038b260f5" src="https://ecovacs2020.file.force.com/file-asset-public/c42e2fa138944a12a9b3b3f038b260f5?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="c42e2fa1-3894-4a12-a9b3-b3f038b260f5" /></body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059fM1EAI', 'AMR Email Templates', 'X1 Omni: How to adjust suction power', '调节吸力', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please kindly select "Enter".<br />
2. Then, swipe up for more available options.<br />
3. Next, tap on the Vacuum Power section and set the suction power to Standard to check if the issue persists.<br />
<img alt="2f44ea2c-38b3-4dd3-ab26-eab228b38075" src="https://ecovacs2020.file.force.com/file-asset-public/X2f44ea2c38b34dd3ab26eab228b38075?oid=00D2x000005pVxV" style="max-width: 710.125px; width: 236.979px; height: 489.983px;" title="2f44ea2c-38b3-4dd3-ab26-eab228b38075" /><img alt="1b53fa99-be71-4123-bd17-3b2f4066363b" src="https://ecovacs2020.file.force.com/file-asset-public/X1b53fa99be714123bd173b2f4066363b?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="1b53fa99-be71-4123-bd17-3b2f4066363b" /><br />
&nbsp;
<div id="" style="left: 7.98611px; top: 101.319px;">&nbsp;</div>
</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059fU5EAI', 'AMR Email Templates', 'X1+/T10+: Unable to detect OZMO Pro water tank/Air Freshener', 'X1+/T10+强拖水箱检测问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Reinstall the OZMO Pro or air freshener a few times and make sure the AUTO light turns blue.<br />
2. Try switching from the air freshener to the OZMO Pro and back again to see if it reconnects properly.<br />
3. Gently tap the mopping plate to ensure nothing is stuck or obstructing movement.<br />
4. Please only use <strong>disposable mopping pads</strong> with the OZMO Pro.<br />
5. Restart the robot: turn the power switch OFF ("O") and then back ON ("I").<br />
6. You may also adjust the mopping mode in the app:<br />
Click on Enter &gt; Swipe up from the bottom &gt; Tap Mopping Preference &gt; Choose Quick or Deep Scrubbing.<br />
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image6?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image" /><br />
7. Reinstall the air freshener or water tank and gently wipe the area with a dry mop to clear any moisture or debris.<br />
8. If the issue still persists, we recommend performing a reset of your DEEBOT</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059gtBEAQ', 'AMR Email Templates', 'N30 Mop Washing Tray Error', 'N30 清洁槽异常', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We''re sorry to hear that you''re still experiencing issues with your Deebot. To help us resolve this, please confirm whether the following steps have already been checked:<br />
&nbsp;<br />
1. Open the dirty water tank and check for foreign objects on the sealing ring. Ensure it is properly in place.&nbsp;<br />
<img alt="N30 Sink 1" src="https://ecovacs2020.file.force.com/file-asset-public/N30_Sink_1?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="N30 Sink 1" />&nbsp;<img alt="N30 Sink 2" src="https://ecovacs2020.file.force.com/file-asset-public/N30_Sink_2?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="N30 Sink 2" /><br />
<img alt="N30 Sink 3" src="https://ecovacs2020.file.force.com/file-asset-public/N30_Sink_3?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 380px; height: 269px;" title="N30 Sink 3" /><br />
<br />
2. Verify that the dirty water tube is installed correctly, then close the tank tightly.&nbsp;<br />
<img alt="N30 Sink 4" src="https://ecovacs2020.file.force.com/file-asset-public/N30_Sink_4?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 478px; height: 347px;" title="N30 Sink 4" /><br />
<br />
3. Remove and clean the sealing plug, then reinstall it, ensuring no foreign objects are between the tank and station.<br />
<img alt="N30 Sink 5" src="https://ecovacs2020.file.force.com/file-asset-public/N30_Sink_5?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 478px; height: 347px;" title="N30 Sink 5" /><br />
<br />
4. Press and hold the return button to see if the dirty water drains.<br />
<img alt="N30 Sink 6" src="https://ecovacs2020.file.force.com/file-asset-public/N30_Sink_6?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="N30 Sink 6" /><br />
<br />
5. If the water does not drain, remove the detachable tray, pour out the water, clean the filter, and reinstall the tray.<br />
<img alt="N30 Sink 7" src="https://ecovacs2020.file.force.com/file-asset-public/N30_Sink_7?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 477px; height: 332.156px;" title="N30 Sink 7" /><br />
<br />
6. Disconnect and reconnect the power supply to the station. Once the robot is docked and charging, execute the self-cleaning function to see if it resolves the issue.<br />
&nbsp;<br />
Please let us know if these steps resolve the issue or if you need further assistance. We''re happy to help!</p>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059hkQEAQ', 'AMR Email Templates', 'Collect Info - Accessory/Function Part Inquiry', '搜集用户信息，以申请免费耗材或服务配件', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out to us regarding your machine.<br />
<br />
To assist you further, we would like to help you submit a request for the needed item(s). In order to move forward, we kindly ask for the following materials:<br />
<br />
<strong>1. Proof of Purchase</strong>: A screenshot or image showing the order number, purchase date, original seller, machine condition, and the model of the device.&nbsp;<em>This will help us verify your <strong>warranty</strong> coverage and ensure we process your request accurately.</em></p>

<p><br />
<strong>2. Picture of the Robot''s Serial Number:&nbsp; &nbsp; <u><span style="color:#c0392b;">！！！请删掉不适合的部分 &amp; 这段话！！！</span></u></strong><br />
<br />
<em>The serial number is essential for verifying the model and production details of your robot. It helps us confirm that the correct device is being serviced and ensures that any parts or service provided are compatible with your machine.</em></p>

<ul>
	<li><strong>Deebot: </strong>Serial number located underneath the dustbin, starting with "E0".&nbsp;</li>
</ul>

<div style="margin-left: 40px;"><img alt="Deebot SN" class="" src="https://ecovacs2020.file.force.com/file-asset-public/Deebot_SN?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 490.996px; height: 652.988px;" title="Deebot SN" /></div>

<ul>
	<li><strong>Goat: </strong>Serial number located at the bottom of the mower or at the rear end of the unit next to the QR code.</li>
</ul>

<div style="margin-left: 40px;"><img alt="Goat SN 1" src="https://ecovacs2020.file.force.com/file-asset-public/Goat_SN_1?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Goat SN 1" />&nbsp;<img alt="Goat SN 2" src="https://ecovacs2020.file.force.com/file-asset-public/Goat_SN_2?oid=00D2x000005pVxV" style="max-width: 657.02890625px" title="Goat SN 2" /><br />
&nbsp;</div>

<ul>
	<li><strong>Winbot: </strong>Serial number can be found via the <strong>Ecovacs Home App</strong> by going to <strong>Settings &gt; Serial Number</strong>, attached to the safety rope/pod, on the corner of the storage suitcase, or on the back of the OMNI station (if applicable).</li>
</ul>

<div style="margin-left: 40px;"><img alt="Winbot SN 1" src="https://ecovacs2020.file.force.com/file-asset-public/Winbot_SN_1?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 380px; height: 255px;" title="Winbot SN 1" />&nbsp;<img alt="Winbot SN 2" src="https://ecovacs2020.file.force.com/file-asset-public/Winbot_SN_2?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 312px; height: 416px;" title="Winbot SN 2" /></div>

<div style="margin-left: 40px;">&nbsp;</div>

<p><strong>3. Shipping Information: Full name</strong> (first and last), shipping address (including zip code, apartment/unit number if applicable), and <strong>contact number</strong>.<br />
<br />
<em>Once we receive the requested information, we''ll be able to proceed and guide you through the next steps.</em><br />
<br />
Should you have any questions or need further assistance, please don''t hesitate to reach out to us. We''re here to help!</p>

<div id="" style="left: 48px; top: 360px;">&nbsp;</div>



<div id="" style="left: 47.9883px; top: 348.984px;">&nbsp;</div>

<div id="" style="left: 47.9883px; top: 348.984px;">&nbsp;</div>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059iLVEAY', 'AMR Email Templates', 'X8 PRO OMNI Ostacle Crossing Ability', 'X8 PRO OMNI 爬坡能力', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">The X8 PRO OMNI can generally climb slopes up to 0.78 inches (2 cm), but performance can vary depending on factors such as floor material, humidity, and dirt buildup on the wheels (which should be cleaned regularly).<br />
<br />
To improve climbing, make sure the roller mop assembly is properly installed. You can also add a threshold ramp in the Ecovacs Home App, extending it up to 7.87 inches (20 cm), to help the robot navigate slopes more effectively. Additionally, using a physical threshold ramp matching your home''s threshold height can enhance the robot''s ability to climb over raised areas.<br />
<br />
<img alt="Threshold Ramp" src="https://ecovacs2020.file.force.com/file-asset-public/Threshold_Ramp?oid=00D2x000005pVxV" style="max-width: 650.3640624999999px" title="Threshold Ramp" /><br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059kqLEAQ', 'AMR Email Templates', 'X1 Omni: Unable to find designated area', '找不到指定区域', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please kindly run the machine under <strong>AUTO </strong>mode throughout your entire home.<br />
<br />
1. Running the machine in <strong>AUTO mode</strong> helps update the map and refresh the navigation data.<br />
2. Once the map data has been refreshed, please rerun the machine using Area mode to see if the issue is resolved.
<ul>
	<li>If the problem disappears, we recommend backing up your current map via Map Management in the app.</li>
	<li>Should the issue recur in the future, simply hit the <strong>Restore button</strong> to revert to the backed-up version.</li>
</ul>
<img alt="20251016-034535" src="https://ecovacs2020.file.force.com/file-asset-public/X20251016034535?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="20251016-034535" /><br />
<br />
3. If the issue persists, please delete the current map and remap your home environment.<br />
4. If the same issue still occurs after remapping, we suggest performing a reset on the unit.<br />
<br />
<strong>Gentle Reminder:</strong> Kindly be informed that performing a reset on the Deebot will result in the deletion of all data, including the saved maps. Following the reset, Deebot will go offline and will require the network setup process to be redone in order to restore its online functionality.<br />
<br />
<strong>How to reset your Deebot:</strong><br />
<br />
To initiate a hard r<strong>eset of the Deebot</strong>, press the Reset Button (a tiny grey button near the power switch) for approximately 5 seconds. You will hear a voice prompt stating "Reset to default settings," followed by the commencement of the boot music. This indicates that the default settings have been successfully restored.</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059mSLEAY', 'AMR Email Templates', 'OOW Courtesy Service (No BSD/IFR<24 months)', 'OOW少于24个月内的，请用此macro提供保修服务', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for allowing us to review your case.<br />
<br />
While your machine is currently outside our standard <strong>1-year</strong> limited warranty period, <strong>we truly value your trust and loyalty as a customer.<br />
<br />
As a special gesture of goodwill, we are pleased to offer you a one-time courtesy warranty service, free of charge.</strong> Please note that the warranty service will <strong>not </strong>include <strong>additional </strong>warranty coverage, but we hope it demonstrates our commitment to your satisfaction.&nbsp;<br />
<br />
To get started, simply reply to this email with:<span style="color:#c0392b;">&nbsp;&nbsp;<strong><u>（如果用户已经提供下列信息，视情况删减）</u></strong></span></p>

<ol>
	<li>Your<strong> full name</strong> (first and last), <strong>address </strong>(including the zip code and apartment/unit number if applicable), and<strong> contact number</strong>.</li>
	<li><strong>Photos/videos</strong> of the issue (optional but helpful)</li>
	<li><strong>Picture of Deebot''s Serial Number</strong>: Located underneath the dustbin on the vacuum, starting with E0.&nbsp;<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image1?oid=00D2x000005pVxV" style="max-width: 710.125px; width: 700.957px; height: 935.996px;" title="image" /></li>
	<li><strong>Serial Number of the Base Station</strong>: Located at the back of the unit, near the adapter port with the barcode.&nbsp;<img alt="image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_11?oid=00D2x000005pVxV" style="max-width: 710.125px; width: 647.969px; height: 860.996px;" title="image (1)" /></li>
</ol>
<br />
Your satisfaction is our priority, and we''re truly grateful for the chance to continue earning your trust. Please don''t hesitate to reach out if you have any questions.
<div id="" style="left: 47.9883px; top: 1228.98px;">&nbsp;</div>

<div id="" style="left: 47.9883px; top: 1228.98px;">&nbsp;</div>

<div id="" style="left: 47.9883px; top: 1257.99px;">&nbsp;</div>

<div id="" style="left: 47.9883px; top: 1257.99px;">&nbsp;</div>
</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059n1pEAA', 'AMR Email Templates', 'No Global Warranty 在美/加购买，目前其他地区用', '跨地区适用机器', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We would like to kindly inform you that our North America warranty policy applies exclusively to products purchased and used <strong>within </strong>the United States and Canada. <em><strong>Regrettably, we do not offer a global warranty.</strong> </em>As such, if your machine has been taken <strong>outside </strong>North America, it will <strong>not </strong>qualify for warranty coverage under our policy.<br />
<br />
You may consider the following independent options at your own discretion:<br />
<br />
<strong>1. Explore Local Repair Services: </strong>You may seek assistance from reputable third-party repair providers in your current region. Please note that any service performed by non-authorized providers will not be covered or reimbursed by our warranty.<br />
&nbsp;<br />
<strong>2. Purchase a Local Replacement:</strong> If repair services are unavailable or impractical, purchasing a replacement product from a local authorized retailer may be a more convenient solution.<br />
&nbsp;<br />
We sincerely appreciate your understanding and cooperation in this matter. Our support team remains available to assist with any further inquiries or concerns.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059nQ1EAI', 'AMR Email Templates', 'No Global Warranty 想从美/加买，其他地区用', '对***想要购买机器***跨地区使用的用户进行风险提示', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your interest in our product.<br />
<br />
We would like to kindly inform you of some important considerations if you plan to purchase a machine in North America and use it in <strong>another country</strong>:
<ol>
	<li><strong>Voltage Differences:</strong> Electrical voltage standards vary by region, and using the machine in a country with a different voltage standard may <strong>result in damage to the device</strong>.</li>
	<li><strong>Warranty Limitations:</strong> Our North America warranty policy applies exclusively to products used <strong>within </strong>the United States and Canada. Using the machine outside of these regions will <strong>void the warranty</strong>.</li>
	<li><strong>Repair Challenges: </strong>Should the machine encounter any issues, authorized repair services in your region may not be able to service North American devices due to differences in specifications and parts availability.</li>
</ol>
<br />
For a seamless experience, <strong>we strongly recommend purchasing the product locally</strong> in the country where it will be used. This ensures compatibility with local voltage standards and provides access to warranty and repair services tailored to your region.<br />
&nbsp;<br />
If you have any further questions or need assistance, our team is here to help. Thank you for your understanding, and we appreciate your interest in our product.</body>
</html>', 'Charlie G.', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059oUAEAY', 'AMR Email Templates', 'X2 Omni: ''Cleaning sink is full'' alarm', 'X2 Omni: ‘清洁槽已满’警告', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please kindly confirm the image of the X2 OMNI detachable tray sample below. We’d like to clarify that this part is designed to be symmetrical, and it is normal for only one side to have the part with the white plug.<br />
Please also ensure that this piece is properly installed on the detachable tray.<br />
<img alt="b202afcd-78a0-41a9-9e58-0fa1011cdbdc" src="https://ecovacs2020.file.force.com/file-asset-public/b202afcd78a041a99e580fa1011cdbdc?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="b202afcd-78a0-41a9-9e58-0fa1011cdbdc" /><br />
<br />
Additionally, the “Sink Is Full” alarm may be caused by water on the metal components triggering the water level detector incorrectly. We recommend drying both the water level detector sensors and the sink area thoroughly before reinstalling the detachable tray.<br />
<img alt="c6ed67e5-782a-44b2-a4c7-8b9fdb94db3b" src="https://ecovacs2020.file.force.com/file-asset-public/c6ed67e5782a44b2a4c78b9fdb94db3b?oid=00D2x000005pVxV" style="max-width: 708.214px; width: 338.984px; height: 451.973px;" title="c6ed67e5-782a-44b2-a4c7-8b9fdb94db3b" /><img alt="69cdbeb8-b121-4f7b-b36d-0c45a6777f6d" src="https://ecovacs2020.file.force.com/file-asset-public/X69cdbeb8b1214f7bb36d0c45a6777f6d?oid=00D2x000005pVxV" style="max-width: 708.214px; width: 338.984px; height: 451.973px;" title="69cdbeb8-b121-4f7b-b36d-0c45a6777f6d" /></body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000059prdEAA', 'AMR Email Templates', 'X1/T10 Omni:No water seepage from clean water tank/Wastewater cannot be recycled', 'X1/T10 基站不出水/污水不循环', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please remove both the clean and dirty water tanks from the station. Under the tanks, you will find cone-shaped rubber sealing plugs. Kindly rinse these sealing plugs with clean water. When reinstalling them, press down firmly to ensure they are properly sealed with the station.<br />
<img alt="image (2)" src="https://ecovacs2020.file.force.com/file-asset-public/image_2220902202804?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image (2)" /><br />
<br />
2. Open the clean/dirty water tank and press along the seal strip on the sides. Also, please check if the lid of each tank is closed securely—press it down gently to make sure it is installed correctly.<br />
<img alt="675d3e24-ca3d-4f43-bcaa-71144fedb304" src="https://ecovacs2020.file.force.com/file-asset-public/X675d3e24ca3d4f43bcaa71144fedb304?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="675d3e24-ca3d-4f43-bcaa-71144fedb304" /><br />
<br />
3. Short-press the [Add/Pump water in the cleaning tank] button on the station. After hearing the voice prompt, short-press the button again to confirm whether the dirty water can be recycled normally.
<ul>
	<li>If the recycling works, please wipe the water level sensors on both sides with a dry cloth, then power off the robot, restart it, and observe if the issue is resolved.</li>
</ul>
<img alt="image (3)" src="https://ecovacs2020.file.force.com/file-asset-public/image_32?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="image (3)" />
<ul>
	<li>If the recycling does not work, please check the recycling port for any foreign objects. If blocked, clean it with the cleaning brush and then run a self-cleaning cycle at the station</li>
</ul>
<br />
4. If no water comes out from the clean water tank, please remove the blue filter cotton, wash it thoroughly, and reinsert it into the bottom of the tank.<br />
<img alt="5af044b0-2b6a-4663-a8eb-fdd3388e3358" src="https://ecovacs2020.file.force.com/file-asset-public/X5af044b02b6a4663a8ebfdd3388e3358?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="5af044b0-2b6a-4663-a8eb-fdd3388e3358" /><br />
<img alt="7b157a46-e717-447a-8552-65c571ab0349" src="https://ecovacs2020.file.force.com/file-asset-public/X7b157a46e717447a855265c571ab0349?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="7b157a46-e717-447a-8552-65c571ab0349" /><br />
If the station is still unable to pump water into the dirty tank, kindly check both tanks and ensure the magnets at the back of each tank are intact.</body>
</html>', 'Alex. W', 1792029242029)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005BhTOEA0', 'AMR Email Templates', 'T30S/T30 Combo: Dustbag detection issue', 'T30S/T30 Combo: 尘袋检测问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>Please follow the steps below to check and troubleshoot the dust collection system:</strong><br />
1. Gently press the dust box to pull out the drawer.<br />
2. Confirm that the dust bag is installed correctly — please refer to the picture below for reference.<br />
3. Make sure the dust bag drawer is pushed back firmly and securely.<br />
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image7?oid=00D2x000005pVxV" style="max-width: 616.3125px" title="image" /><br />
4. Clean the dust collection cabin thoroughly.<br />
<img alt="image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_15?oid=00D2x000005pVxV" style="max-width: 616.3125px" title="image (1)" /><br />
5. Use a dry paper towel to wipe the sensor located in the drawer area, ensuring there''s no debris or tangled dirt.<br />
<img alt="image (2)" src="https://ecovacs2020.file.force.com/file-asset-public/image_2220902202805?oid=00D2x000005pVxV" style="max-width: 608.3760803222656px" title="image (2)" /><br />
<br />
<strong>Next, kindly try the following troubleshooting steps:</strong><br />
1. Unplug the station and power off the DEEBOT.<br />
2. With the DEEBOT powered off, place it back onto the charging station.<br />
3. Wait for about 30 seconds.<br />
4. Reconnect the power to the station and turn the DEEBOT back on.<br />
5. Reinstall the dust bag, and then open the app to check the device status.</body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005BlGrEAK', 'AMR Email Templates', 'T50 OMNI/T50 PRO OMNI: Self-Cleaning Components Installation', 'T50 OMNI/T50 PRO OMNI:自清洁左右盘安装指南', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>To ensure the Self-Cleaning Components are installed correctly for your Deebot, please follow the steps below:<br />
<br />
1. Place the components as shown in the picture below.<br />
<img alt="image (4)" src="https://ecovacs2020.file.force.com/file-asset-public/image_42?oid=00D2x000005pVxV" style="max-width: 616.3125px" title="image (4)" /><br />
2. Refer to the following picture, which demonstrates the condition once you have uninstalled the plates'' holder and the plates from the tray.<br />
<img alt="image (5)" src="https://ecovacs2020.file.force.com/file-asset-public/image_51?oid=00D2x000005pVxV" style="max-width: 616.3125px" title="image (5)" /></p>

<p>3. Turn the plates'' holder over and remove the plates (see attached). You will notice the L and R marks, which will guide you in installing the plates correctly.<br />
<img alt="image (6)" src="https://ecovacs2020.file.force.com/file-asset-public/image_6?oid=00D2x000005pVxV" style="max-width: 616.3125px" title="image (6)" /><br />
<img alt="image (7)" src="https://ecovacs2020.file.force.com/file-asset-public/image_7?oid=00D2x000005pVxV" style="max-width: 666.5437499999999px" title="image (7)" /><br />
<img alt="download_image" src="https://ecovacs2020.file.force.com/file-asset-public/download_image?oid=00D2x000005pVxV" style="max-width: 666.5437499999999px" title="download_image" /><br />
4. Ensure both arrows on the plates are aligned with the ones on the holder rack. The arrows should be facing the same direction.<br />
<img alt="download_image" src="https://ecovacs2020.file.force.com/file-asset-public/download_image1?oid=00D2x000005pVxV" style="max-width: 666.5437499999999px" title="download_image" /></p>
5. Once the plates are installed correctly, you should hear a quick, crisp clicking sound to confirm that they are securely in place.<br />
<img alt="image (8)" src="https://ecovacs2020.file.force.com/file-asset-public/image_8?oid=00D2x000005pVxV" style="max-width: 666.5437499999999px" title="image (8)" /><br />
<img alt="image (9)" src="https://ecovacs2020.file.force.com/file-asset-public/image_9?oid=00D2x000005pVxV" style="max-width: 666.5437499999999px" title="image (9)" /><br />
<br />
Thank you again for being a loyal customer. Should you need any further assistance, please feel free to reach out.</body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005BnXBEA0', 'AMR Email Templates', 'T50 Max Pro Omni: Cleaning solution auto addition issue:', 'T50 Max Pro Omni: 清洁液无法自动添加', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">The T50 PRO OMNI supports the automatic addition of cleaning solution to the clean water tank at a ratio of 1 part solution to 200 parts water.<br />
&nbsp;<br />
If, after refilling the Cleaning Solution Unit with Deebot Cleaning Solution, no solution is being added to the clean water tank, please manually start the Wash Mop process by opening the app, pressing "Enter," selecting "Station," and tapping "Wash Mop." Once the process is complete, open the cover of the OMNI Station''s Dirty Water Tank and check if there is any obvious foam in the wastewater from the procedure.<br />
<br />
<img alt="download_image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_1?oid=00D2x000005pVxV" style="max-width: 616.3125px" title="download_image (1)" /><br />
<br />
If the wastewater appears mostly clear, please follow the steps below:<br />
<br />
<strong>Confirm that the ECOVACS Deebot Cleaning Solution is in use. (Not other brands of cleaning solution)</strong><br />
Open the <strong>Ecovacs Home App</strong> and press "<strong>Enter</strong>".<br />
<img alt="image (10)" src="https://ecovacs2020.file.force.com/file-asset-public/image_10?oid=00D2x000005pVxV" style="max-width: 608.3760803222656px" title="image (10)" /><br />
<br />
Ensure the Deebot’s firmware is up to date. <strong>Go to Settings</strong> &gt; <strong>Robot Advanced Settings </strong>&gt; <strong>About Your Robot</strong>, then click on <strong>Update </strong>to check for updates. If you prefer, toggle on Automatic Update to allow the robot to automatically update the firmware between midnight and 6 AM, whenever a newer version is available.<br />
<img alt="download_image (2)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_2?oid=00D2x000005pVxV" style="max-width: 608.3760803222656px" title="download_image (2)" /><br />
<br />
Navigate to <strong>Settings </strong>&gt; <strong>Station Advanced Settings.</strong><br />
<img alt="image (11)" src="https://ecovacs2020.file.force.com/file-asset-public/image_111?oid=00D2x000005pVxV" style="max-width: 608.3760803222656px" title="image (11)" /><br />
<br />
Please ensure that the Intelligent Addition of Cleaning Solution is enabled (this feature is enabled by default). If this feature was previously turned off, kindly toggle it back on to reactivate the functionality.<br />
<img alt="20251017-232946" src="https://ecovacs2020.file.force.com/file-asset-public/X20251017232946?oid=00D2x000005pVxV" style="max-width: 608.3760803222656px" title="20251017-232946" /><br />
Unplug the OMNI Station. Remove the Cleaning Solution Container and draw a line on the outside of the box to help verify fluid usage for convenience comparison. Once done, reinstall the container, plug the station back in, and observe the system for one week.<br />
<img alt="download_image (3)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_3?oid=00D2x000005pVxV" style="max-width: 608.3760803222656px" title="download_image (3)" /><br />
<br />
<strong>Important Notes:</strong>
<ul>
	<li>We recommend using ECOVACS Deebot Cleaning Solution for optimal performance.</li>
	<li>Do not use cleaning fluids from other brands, as they may cause blockages that could prevent the automated cleaning solution from being added successfully. Additionally, we advise against adding cleaning solution directly into the base station’s clean water tank while the cleaning solution box is still filled. You may choose either method, but mixing both is not recommended.</li>
</ul>
</body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Ch9ZEAS', 'AMR Email Templates', 'Other Region Inquiry - South Africa', '南非用户进线咨询，指引用户联系南非经销商网站', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out.<br />
<br />
Please be informed that you are currently connected with the <strong>North American</strong> support team, and our services are tailored specifically for handling product and warranty inquiries <strong>within the USA and Canada</strong>.<br />
<br />
If you are located outside of this region, we recommend contacting your <strong>local support team</strong>, as they are better equipped to assist you with your specific inquiry. For your convenience, here is the support information for <strong>South Africa</strong>:
<ul>
	<li>Website: <a href="https://www.ecovacs.co.za/">https://www.ecovacs.co.za/</a></li>
	<li>Phone: +27 21 201 1131</li>
	<li>Find a nearby shop: <a href="https://www.ecovacs.co.za/pages/where-to-find-us">Store Locator</a></li>
</ul>
<br />
Your understanding is greatly appreciated. If you have any further questions or require additional assistance, please feel free to reach out.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ChhREAS', 'AMR Email Templates', 'Request Pictures of Robot Serial Numbers', '再次要求用户提供机器SN', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for the update.<br />
<br />
In order to complete the warranty profile and verify the details of your robot, we kindly request that you provide documentation, including <strong>clear pictures</strong> of the <strong>serial numbers</strong> for both the <strong>Robot </strong>and the <strong>Docking Station</strong>.<br />
<br />
Once we receive these two items, we will be able to proceed with the next steps of your request.<br />
<br />
Thank you for your understanding and cooperation. We look forward to resolving this for you as soon as possible.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Chj3EAC', 'AMR Email Templates', 'Cleaning Path/Route Erratic or Messy', '清扫路径乱（多见于滚筒类）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">To address the issues,&nbsp; please confirm the following:
<ul>
	<li>Please check if the <strong>navigation and obstacle avoidance module</strong> is dusty. If so, gently wipe it with a dry tissue.</li>
	<li>Note that due to indoor obstacles, the high-precision obstacle avoidance feature may cause the cleaning path to appear slightly disorganized.</li>
	<li>If the machine is slipping, wipe the <strong>driving wheels </strong>with a <strong>dry </strong>cloth. Avoid using laundry detergent or any cleaning liquids <em>not </em>designed for ECOVACS products.</li>
	<li>For optimal performance, we recommend using <strong>Auto Clean</strong> instead of Agent Hosting or AI Intelligent Hosting. Auto Clean is specifically designed to enhance the robot''s cleaning path and efficiency, providing a smoother and more consistent cleaning experience.</li>
</ul>
<br />
If the issue persists, please share a short <strong>video </strong>or <strong>screenshots </strong>of the <strong>recent cleaning log details</strong>. <em>To access the logs, go to Settings, find Cleaning Log or Log, and click on it to review relevant details.</em> This will help our team better understand the problem and find a solution more efficiently.<br />
<br />
Thank you for your cooperation, and we look forward to assisting you further.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ChkfEAC', 'AMR Email Templates', 'DTOF Working Noise - Normal', 'DTOF 工作噪音', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us with your concern.<br />
<br />
The noise you are hearing from the D-TOF module is completely normal. The D-TOF module needs to rotate continuously during scanning and positioning in both operating and non-charging states. This rotational movement can generate some noise, which is part of its standard operation and does not indicate a malfunction.<br />
<br />
<strong>Troubleshooting Steps:</strong><br />
&nbsp;<br />
<strong>Check for Obstructions: </strong>Inspect the D-TOF area for any debris or obstructions and clean them if necessary. After cleaning, observe the robot during use to see if the noise persists.<br />
&nbsp;<br />
<strong>Persistent Noise:</strong> If the noise continues after clearing any obstructions, it could suggest an internal issue.&nbsp;In this case, please let us know, and we will guide you through the necessary next steps.<br />
&nbsp;<br />
<strong>Rotation Scenarios</strong> (For Your Reference)<strong>:</strong>
<div style="margin-left: 40px;"><strong>D-TOF rotates:</strong><br />
When the charging base experiences a sudden power loss.<br />
When the robot is idle outside the charging station.<br />
During cleaning tasks, pauses, or other operational states.<br />
&nbsp;<br />
<strong>Non-rotation Scenario:</strong><br />
The D-TOF stops rotating when the robot is in charging mode.</div>
<br />
We hope this helps clarify the noise you are hearing. If the issue persists or you have further questions, please do not hesitate to reach out. We are here to assist!</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ChmHEAS', 'AMR Email Templates', 'Roller Mop Tangled', '滚筒缠绕', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.<br />
<br />
If your DEEBOT is indicating that the roller mop is entangled, this may be due to the mop being too dry or heavily soiled, particularly with oily residues. To help resolve the issue, please follow the steps below:<br />
<br />
<strong>Update the Firmware</strong>
<ul>
	<li>Ensure your DEEBOT’s firmware is up to date:</li>
	<li>Go to <strong>Settings &gt; Robot Advanced Settings &gt; About Your Robot &gt; Update</strong>.</li>
</ul>
<br />
<strong>Check for Debris</strong>

<ul>
	<li>Inspect the roller mop and the surrounding area for any tangled debris.</li>
	<li>If debris is found, clean the roller thoroughly using a cleaning tool or a flathead screwdriver.</li>
	<li>After cleaning, manually rotate the roller’s bearing to ensure it moves smoothly.</li>
</ul>

<div style="margin-left: 40px;"><img alt="Roller Mop Tangled 2" src="https://ecovacs2020.file.force.com/file-asset-public/Roller_Mop_Tangled_2?oid=00D2x000005pVxV" style="max-width: 622.6062499999999px" title="Roller Mop Tangled 2" /></div>
<br />
<strong>Ensure the Mop is Moist</strong>

<ul>
	<li>The roller mop should be slightly moist during cleaning.</li>
	<li>If it feels too dry, place the DEEBOT back on the charging dock, wait a few moments, and then restart the cleaning task.</li>
</ul>
<br />
<strong>Clean Heavily Stained Mops</strong>

<ul>
	<li>If the mop appears heavily stained or oily, we recommend manually washing it before the next use.</li>
	<li>Once cleaned, reinstall it and test the robot again.</li>
</ul>

<div style="margin-left: 40px;"><img alt="Roller Mop Tangled 2" class="" src="https://ecovacs2020.file.force.com/file-asset-public/Roller_Mop_Tangled_21?oid=00D2x000005pVxV" style="max-width: 622.6062499999999px" title="Roller Mop Tangled 2" /></div>
<br />
We hope these steps help resolve the issue. If the problem persists or you have any further questions, please don’t hesitate to reach out — we’re here to help.


<div id="" style="left: 48px; top: 837px;">&nbsp;</div>

<div id="" style="left: 48px; top: 837px;">&nbsp;</div>
</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Chr7EAC', 'AMR Email Templates', 'OZMO Roller Leaving Water Marks During Mopping', '滚筒类地宝拖地时留下水珠/脏水珠', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out regarding the water marks from your DEEBOT with OZMO Roller Mop. Please find below step-by-step guidance to help address this issue:<br />
<br />
<strong>1. Clean the Dirty Water Box</strong>
<ul>
	<li>Hold down the blue latch at the back of the DEEBOT to release the Dirty Water Box.&nbsp;</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/4VBcT7YMWsEM5mU5ia9xeh2lB?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..s0Fm7by47Ih2KcMRRV_nvA.Ynx1KH4ID0kg2_eMPHlFPbzx8uxAC6TwLhzS7hn-8J6HlYh3bDSE648-r_YvHZHnoQxWMw3jy5MA8gFEEfJDAe-WrN7XdOjZbCX8WZfhnYbZlahezbqMbC4XhztR3B4psYMk_9ByxLzCe-tajFn1Ex9GV2IgLYl4_MGBPK9cyoIjY4bhy2D8_xTzWUI3982um9xiyKNvODlJKxFfhWfZ7f_lWIeuPBgW0FXRziSoUVMBc3lhlC5Z9QNkmBKgCCMtSZbPfV1xlMC2nqUhMAZ_BLwNgaKXedWH3dx61z8ZggZF5LdqdyZEIlUY4FrzX51L.WEGn6dJBjutNouyj6AvwXg" style="max-width: 622.606px; width: 289px; height: 197px;" title="User-added image" /></div>

<ul>
	<li>Turn the Dirty Water Box over, press down and then lift up the outlet (highlighted) to allow dirty water to flow out.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/ZzngxO0ySi1ZNIhu0duuuoKus?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..PGN7rZ35-xINMZfzgjvsaw.TgqJvSAg43jQayGVDO9c5iUyDjMH1j7o8-FJ0waPMwuF295bujPZU7lNk1KGWxhUcm9aeBiX-ObRQYhXk9wwcMG80AyHLn60yrbMxTa63PKLnfVlIK2cqJaI9PxS13IIWA9g_-CGOmvrHB1N5e13C7sTFjjBBmG9e33rbquWrNmmbvnH9wJzdxCIUdt6G4zT3KRrC0hPnhJrwkCJFphghpBnMW5-Qc_BY9BkIpVn3bczHTAWwTH03bmM1bI3zCVsZ99GX2nR_uZJycbFklXfwQCqEQmna-7vtIH4WzeBKVqc8Qrty3mUETK-JuMeLszx.hVEdYvxQxVFVf1MFb-QWHw" style="max-width: 622.606px; width: 266px; height: 199px;" title="User-added image" />&nbsp;<img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/XXwzqe9L2cR8nwBuIo049o2Bv?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..Lutf3urAJtv41wmee50C4g.fas5KJg553HLmVl7SNiG83YpaC6GycUzB7F61ouJfMnIKBknVEA0bsCNvU1rzVFAC95il1qXdIYDv26UwX18KFXy3r-3lB1iMX89H4A1KshpAKNAlck671cVO2kh_Y7oPMFjIl6XFDkuWJlr9onDBS8j3I1IxGfvEsUYLG1jMUwCbBmzop6W-FfAxvh2yQclfGxEs1LBZuN09jniSH7P4cq_-5scCqhdCy8uuuYUke_yeNJx6o2mDcgRKftzqXkIuLCaWHzAf2GJNZ-fHaLTsugZDFYEO3UYMIFtm1aaJ7ENbmRzZ28-YP2y8nNYOtiJ.mPWGuE-CB-nOmMr6PiFfoA" style="max-width: 622.606px; width: 266px; height: 199px;" title="User-added image" /></div>

<ul>
	<li>If any water remains, open the cover and empty the box directly.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/i0Bp6wW397cmCaNYg9tMa5lPN?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..XfUX3c0ehLrk-SXvzbZBCw.gAsk0iV_xPpCxLNa-hhD7f8u1QKwpmSWab7VystNTGUx61xRlrhBNv835CaUtEGw9K0zsn5KSoP5qdLo8szKVrhiEc5-Yc3ooY3U1gkY8Km9eyF7bL_ONPfjT9Hh0SarUFfQifpL_dAaXbRQ8R5gSleXppmDhWpLpzLnKlVTopLcQdfwLNJ1ZStFuf33foXn2nu0SzoKBSGMxn4g4t2J70vRpvqo1j_F-0Wi0zB_RKUQA6Am9VvnIYqmT_IqOfMSZX1Zue_yYoJ3V3WIVv3MDyfmmces9yjfmpe2Mxsm7tZDsONWF6hV3eVDzriaiGhD.UdnrBu38EjXVmWLZg9wBiA" style="max-width: 622.606px; width: 256px; height: 193px;" title="User-added image" />&nbsp;<img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/rDJxTNDI83DTbHmqfpzQyAW5G?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..qTkoDxBmNeM7aztdUCDC7A.qwS0MiE23x16S84dDTWLYwtWaSAdF3GLSx_Yh3sNm8D1aKcZAxutgcnpRXcxsQVK1LB7Fd_coYd4p_GzOYzHkv-srgOAgH3otDq1hsfRbI1oxREXjA6wu3kcFOlTMvvmfs20hk2kF4__TdRTo89ISb8Pvrn1ZXcTxZNWermRf0r_HrMgtXklH42ugry7CqkJn5QdKEl5_KlfdnfYIBF4K7HzsR22khj62oJ6yFU9SeA0d8FwBGUcwpvIftTqkvfIpJtcGyzxKbi4WUQudMVOd_e_-gQc4vYnTykzzjXpXlf5LIoeKKveZQYODU2CDyH2.j0DXp7qPMvzRFOvDUxkkTQ" style="max-width: 622.606px; width: 241px; height: 193px;" title="User-added image" /></div>

<ul>
	<li>Inspect the small filter inside the Dirty Water Box, as well as the interior, for any blockages. Rinse both the filter and the inside of the box to remove residue or debris.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/6f1CwUJVvdojbBZVmACubYIvZ?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..qrmqp5NBKf7qrNUDO2phpg.gw2EWLdOVkbhDza1Q7S-zC8nnCkmqibYlQLmydNV-DMhIkcDILDIjXSGd_YvPqL1qbiyzHxRZcpU34GlpLafBgtPkOS1oZRhoIZtPPifKN-dNbrTAPBbsUuuEC3AfCJbmchLrT96XZPeWdOQPRQCC2NuiYgJ7L3792Ddi7paJiGx69FD2ivRZvcfELkfMjMiMCXSnqKZ_-hpsXuLyDnKsIBqf4EYKuYoifzoENmfAJ5uTvgOb2YXbtzU2UuuYVfT7_vNElhAJ-GZHEuWg0kKae5e8qEzGCxdGCA4q3-snqN0ORA7LAuT-VsGzcehgVyn.HVtg2-fMhIeXciOWpIbWhw" style="max-width: 622.606px; width: 266px; height: 199px;" title="User-added image" />&nbsp;<img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/Q5WyP5DhJWHLQgHl3KxbCDr7E?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..U9MYXARCyWj-ksT-MWfUMg.XjM2EjrwYSZeEM4pfjzONzKFCeGbknIvRvQ7FAVfZq0-11HFr8Fyt6bmhGgrq_n73LrqgjoobyYIvG3cdg20QH1W5DCyfLS8D0s9MNVJPWtz9C5-yBlCvdjFT0Lcnaor4Sa5WbBM6eI1O4xiDODC2-rD4kschHbBMIDzdmn8Jz_f9y7Rg3KWSEC05MIxZO78C9OvoRUcPbwGMhy__tkJeT6tWWNhJ4RB_vmcZrZJ380oCY-2LvX2hFNUXkaUXhbx3JPmhILtAM7K2VHQH3-oIeidB8VfU-BDkCSkxggFDiRL0EEC_F8PizevMLCC9SXX.Y_WQYeHfT9Kr7ctIIa6DIw" style="max-width: 622.606px; width: 266px; height: 199px;" title="User-added image" /></div>

<ul>
	<li>Reinstall the filter and the cover, then securely place the Dirty Water Box back into the DEEBOT.</li>
</ul>
<br />
<strong>2. Clean the Water Tray Filter</strong>

<ul>
	<li>Remove the filter from the water tray.</li>
	<li>Rinse thoroughly under running water and ensure it is free of debris.</li>
	<li>Reinstall the filter securely before restarting the device. Make sure it''s installed correctly, hearing a gentle click sound.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/OuSRURQLfQRCiRmje6UgVJHun?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..16akEB3tC3INB-ZpIB5r3A.wOx7yWtgA2zJ9-xpwpzNBv45iT4S0789K874sPwLY_7Jz4w17OG7mkDv4FsoBeUD5Dx_ZIWHo6bnWkhyoUFdPF1OSSNiug8u1DYTxpwg5AsuDVUXgx6FkIfefwqVNdP5ub0GjTLqC57fHrfThYXNgNQeNfBZXsYUaaXKBFSQUqmSkOKL9h5okwefskVVB7wOJBq4uPmAZdS7m9WaLf06wFkqyh4qlDtEbthHHHAexlgbj7-eXPatGdCWi4OOkzcpihWOdsNRFMYLEgmQT4RyuM5BfmZ7N2XaURs6nRwDfH_WMwguh7gSjrP97UCI50je.HBzRSKEO56fPRuDhCAhtbw" style="max-width: 622.606px; width: 388px; height: 278px;" title="User-added image" /></div>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/lXR19ows6YOBVMpvCaaN535Sy?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..4eiVNLYcMRTjIH4nRrdBTQ.MFsmk0H_6C_7e4foKeWyPlpT0v6VcSbc6R8BnOvP2zDzIIuj4J2nAYRLbutVIfXTQwKuNlJolu5C0IsISpq4JEosse1cLIGiKitfUJAuKxthfkTiee3ZQ4WpNxO8cWRgQQJqeJZnJyKPYH02Kr4btk8-od-aeBHtc9fOkinSxUKen6FJxhCbXC6LhPphixfh1HkRne4VjDH-p3PfdOHRtD0GbJGYa8HoDi0gqdwn4_KsYot115X5RNRou4w3SoDhLq6YHpsb7uZXw7WcX4QFwA95eziSz7iWxYPkt-CxG6qNQpAuQpUOufN9Z7d2bI-0.6vKwW3O3Baj0FXM6KbELgw" style="max-width: 622.606px; width: 387px; height: 257px;" title="User-added image" /></div>
<br />
<strong>3. Check the Roller Mop</strong>

<ul>
	<li><strong>Debris:</strong> Inspect the roller mop for any entangled debris. If found, remove it using the cleaning tool or a flathead screwdriver. Clean the roller cavity and rotate the roller bearing manually to confirm it moves smoothly.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/6rPcVwnK3Dt36uqhKJiWAOHL5?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..2XNkqNE41VrRUAqiF33Vfg.QZtX_XvBzEEWwvl3vk_lcns8Yuaw7uPEWnMQxF0bBQlVHxffk3MhkRhfITRSLh5uwLwJmlXvQJoLDeZwBuH4r8IfuoNJnGZFuZQ5jzgRJmq_eqXMOch_93UjdPubWH6RGBYgkD5XaZ_uyOmVPoIbo2r6d2xLiWKb0YfA84uPk7s41B37X49IHiK5Z6vndt3VFIYtTdH7s7CHyFpO03qaTlGH3uOIQVL3tjIZKFVgTf-b_GZOONP9dqeNvksUc4FewFOVyp3sxp0NiJxBgJ1rQpVLvOFTcl1h88oJiEDFy6WG9XMasfWr3gi_sFhr1XzB.Ko-3Ol9Vhjf71pupUB0FVA" style="max-width: 622.606px; width: 344px; height: 136px;" title="User-added image" /></div>

<ul>
	<li><strong>Heavily Stained Mop:</strong> If the mop is heavily stained with oil, we recommend washing it manually before reuse, then testing the unit again.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/q2lKLgRVvdIQxg9Y3IVInn2Fb?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..OsS5vcD29ZPtHlnMYRXdOA.nuaUJm22CcVqPt0NNHaLjzB6pZBlnXwgQuySHIb3o6rp80epEKni_gMZyMS3xmtUIrQIatv78rEoXU-b5csrEuHhrgot85l9AHDZ267O8O2EvCOZezNvE7s9uc4HjkPMXI7ULUfGNtcYSE9Z0y-_bC9qpnPNO9DcrlEXzGwmAZBCoIwRUFw_quRgzdXTPWPqKMhL0gdb90WA-q4dchg9ZO26ij1c2qV0HyYPmm6GsEFN6FwDVZR1dzoBXkL8cJ1hbRCiYaayICMcUtkD98E4Q_PiFxqP71s8BSs6VOYVOeIDotxL_a3HKtSzaJocTuZ2.pkcHdwvymuV0J25Y_fs5FQ" style="max-width: 622.6062499999999px" title="User-added image" /></div>
<br />
<br />
<strong>4. Common Causes of Water Marks</strong>

<ul>
	<li><strong>Floor Material:</strong> High-gloss surfaces such as tiles or marble absorb and evaporate water differently, which may leave visible marks.</li>
	<li><strong>Repeated Wiping:</strong> When the robot passes over the same area multiple times due to obstacle avoidance, water can accumulate.</li>
	<li><strong>Insufficient Cloth Drying: </strong>If the cleaning cloth is not fully spun dry during the cleaning process, excess water may leave marks.</li>
</ul>
<br />
<strong>5. Recommended Adjustments</strong>

<ul>
	<li>After connecting the robot to the network, set the water level to <strong>Low </strong>and select a longer interval for <strong>Mop Auto Wash Frequency</strong> (Settings &gt; Station Advanced Settings).</li>
	<li>Allow the mop cleaning process to finish <strong>without interruption </strong>to ensure the mop is fully spun dry. You may also choose a longer drying duration.</li>
	<li>Keep the floor free of obstacles during cleaning to reduce collisions and minimize the risk of scratches.</li>
</ul>
<br />
If the issue persists after following these steps, please do not hesitate to contact us. We will be glad to assist you further.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ChuLEAS', 'AMR Email Templates', 'Warning: Unauthorized Battery Replacement May Void Warranty', '未经授权的电池更换可能会导致保修失效', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us regarding your machine.<br />
<br />
We would like to inform you that replacing the battery with one that is <strong>not authorized or approved by Ecovacs </strong>may lead to an unstable power supply, potentially causing damage to your DEEBOT, WINBOT, or GOAT. As a result, we will be unable to provide warranty coverage for any issues arising from such modifications, <em>provided your original unit was purchased as a new machine from an authorized reseller</em>.<br />
<br />
To ensure optimal performance and the longevity of your device, we strongly recommend using only <strong>official replacement parts and batteries</strong> from our <strong>authorized partners</strong>.<br />
<br />
If your machine is still <strong>within warranty coverage</strong>, kindly provide a copy of your <strong>proof of purchase </strong>(A screenshot showing the order number, date of purchase, original seller, machine condition, and model of the device). This will allow us to verify your warranty status and assist you in resolving any issues promptly.<br />
<br />
If your machine is <strong>no longer under warranty</strong>, providing <strong>proof of purchase</strong> will still enable us to understand your purchase history and offer appropriate recommendations for repairs or potential solutions.<br />
<br />
We appreciate your understanding and cooperation. Should you have any further questions or need assistance, please feel free to contact us.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ChvxEAC', 'AMR Email Templates', 'OFF THE FLOOR / Machine Suspending Alarm', 'Off the Floor 报警', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">If your DEEBOT displays an "<strong>OFF THE FLOOR</strong>" or "<strong>Machine Suspending</strong>" alarm, it is typically caused by either manual movement of the machine, failure to overcome an obstacle, or an object causing the machine to lift off the ground. This issue is often resolved by simply repositioning the robot on a flat surface. However, if the issue persists after ruling out these factors, a restart or reset of the machine may be necessary.<br />
<br />
To help resolve this issue and maintain optimal performance, please follow these steps:<br />
<br />
<strong>1. Clean the Anti-Drop Sensors:</strong><br />
Wipe the Anti-Drop Sensors (located in front of the Universal Wheel/little front wheel at the bottom of the machine and near the Driving Wheels) with a clean cloth to ensure they are free from dust or debris.<br />
<br />
<strong>2. Check the Driving Wheels:</strong><br />
Switch the DEEBOT OFF. Press the <strong>Driving Wheels</strong> at the bottom of the machine to check if it rebounds. If it does not, inspect for any tangles or blockages and clean as needed.<br />
<br />
<strong>3. Test in Auto Clean Mode:</strong><br />
Restart the DEEBOT, and place it in an open space. Try running the DEEBOT in Auto Clean Mode to ensure the robot can function without interruption.<br />
<br />
<br />
If you have excluded all the potential causes above and the issue continues, consider performing a<strong> factory reset </strong>on the machine, following the guidelines below:<br />
<br />
<strong>How to reset your Deebot:</strong><br />
To initiate a hard reset of the Deebot, press the Reset Button (a tiny grey button near the power switch) for approximately 5 seconds. You will hear a voice prompt stating "Reset to default settings," followed by the commencement of the boot music. This indicates that the default settings have been successfully restored.<br />
<br />
<em><strong>Gentle Reminder: </strong>Kindly be informed that performing a reset on the Deebot will result in the deletion of all data, including the saved maps. Following the reset, Deebot will go offline and will require the network setup process to be redone in order to restore its online functionality.</em><br />
<br />
<br />
Should you need further assistance or have additional questions, please don’t hesitate to contact us.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ChxZEAS', 'AMR Email Templates', 'Robot is Gift - Unable to Verify Warranty Using Manufacture Date', '无法使用生产日期验证质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.<br />
<br />
We understand that the machine you have was a <strong>gift</strong>, and we appreciate you contacting us. However, in order to proceed with warranty coverage, we do require <strong>proof of purchase</strong>. This can be in the form of the original order details, receipt, or gift receipt.<br />
<br />
As per our policy, the 1-year warranty is only applicable to the <strong>original purchaser</strong>, and unfortunately, it is <strong>non-transferable</strong>. <em>Without this information, we won''t be able to offer warranty services.</em><br />
<br />
We recommend that you reach out to the gift sender for the relevant details. Once you have the necessary documentation, please feel free to get in touch with us again.<br />
<br />
Thank you for your understanding and cooperation. We look forward to assisting you further.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ChzBEAS', 'AMR Email Templates', 'Share Robot', '与另一个账号分享机器', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for contacting Ecovacs Robotics.&nbsp;<br />
&nbsp;<br />
To share your Deebot with a second user''s phone, please follow these steps:<br />
<br />
1. The second user must create an Ecovacs account using their email address.<br />
<br />
2. The second user then downloads the Ecovacs Home app and logs in using the same email address and password.<br />
<br />
3. On the first user’s phone, open the Ecovacs Home app and locate the Deebot in the device list. Tap the "&gt;" button next to the Deebot''s name.&nbsp;<br />
<img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/DfR6XS86UGXMrMp9VpsTd1lIk?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..ExoOPXZpbZcSVgrPEm_zog.9RoYQXp6QirzDB-3xJVm9XFLXgZwF1cG5cq5_IhHEldRHpcaP4jo0QM96s8wAf28md7bTktoxH_45jEh5FQXjnG57Ehq-qf2Boye-yoJ-Y-r_ILZLPh36jZ--N96SKd_VYj2mWxQ1mDuB0uXO9pff7fGLQU-NUkPIyQp0NUWBAvTQrz7nRbcwHdcIRrSy5cFS9OFpt3fzAgLeKm-RhqYLr0QMpLyUwsxT0WrUVDiFyoLvDxvWdFRIH3tgPlVsgqmU5cePHE2HRE0ZMY8bDhe0zbCkriq92bo71FAunStcJKu4IDXnl-fZr3X2BvjXtRx.feB8aICxLPBnzVXjQWRJpw" style="max-width: 622.6062499999999px" title="User-added image" /><br />
<br />
4. Press "Share" to enter the Share Details page.&nbsp;<br />
<img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/MdNo0FPHVl6XVPrZSuU8jQp47?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..YDQRrxVgjX8zXEmSQbzpUg.24vhYa5yrHO5E6N66XB-2Cn7h4fZZrp2ByLcw6ytwu5fSZwuQTxEHWYqpzVrWqeLhKfSkbfGbybWgoD144HJ_gbGR9w_-mkU9UbhRjb2CjcYXgpBVYkvZ5SyOIR_gf9kGb9nuxwh793NIgRgVjHGRT2WM78qogsLdm95LQo8mAtMkXMOqeDduvlvJdt_Ul4wGcgmgsdNj8GGyscuNM6bPTCoJNEkhxLXluzONqrelKBer-M-ronFXyvQ8nJGkYB-BsGVEUg_FnwiQvhoA9xvQ6k59mTlmqa9NVwtsX0atUyC5r6oMSaP8nx8nAVfzgzx.GbsomL4AoxxZtDlfXwok2w" style="max-width: 622.6062499999999px" title="User-added image" /><br />
<br />
5. At the bottom of the page, enter the second user’s email and press "Share" again.&nbsp;<br />
<img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/O194DUkZoeRH8zF8j0LUYUJGE?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..9pMHcYBi1c3sPBW3JKaDqQ._JFEweKzvtLJHeO0Z2McfjHMO3Bl5xHeDYAq8O2tOYzoD3f8zELrjEfwxioYGab6MDtxDiMxPqxhnm5e8uYDZVuqsyQO-oOFVtLcIRhtH1J3XO7JLB6X33RT_4C8pAc1FGE-cqH_UiWs1dH8FLtkDtDsQ0YBVESF8j_45H8RUjCYGH7FZZK73rTG21U4ZH3iijiFOWfW2okUOQnHZoVwy1rE3fA6t-GkneExpFqUZ2905L6WaHvYo9_m5E9PQ6AGm6w6LZ-1G5TWIFZYGx-jmTvltCsksPadN-YvD0tAcFYK6oLfsC7YPJvE797IYeor.mhvNdzDD5c7qinodd4FuSQ" style="max-width: 622.6062499999999px" title="User-added image" /><br />
<br />
6. The second user will receive an invitation in their Ecovacs Home app. They will need to press "Accept."<br />
<br />
7. Once the sharing process is complete, both users will be able to access and control the Deebot.
<p>&nbsp;<br />
If you have any questions or need further assistance, please feel free to reach out.</p>
</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Ci41EAC', 'AMR Email Templates', 'Career Opportunities w/ NA Ecovacs', '想要在科沃斯北美工作', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your interest in working with ECOVACS!<br />
<br />
At ECOVACS, we are committed to preparing individuals for new opportunities and challenges in their careers. We offer positions at every level, across multiple disciplines, and in a variety of markets. With offices around the globe, we foster an environment where you can learn, grow, and thrive.<br />
<br />
If you share our dedication to doing what''s best for clients, enjoy working as part of a team, and hold yourself to the highest ethical standards, we believe you''ll be a great fit. For opportunities in the Americas, please reach out to us at: <a href="na.career@ecovacs.com">na.career@ecovacs.com</a>.<br />
<br />
​​​​​​​We look forward to the possibility of working together.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Ci7FEAS', 'AMR Email Templates', 'General Quick Tips - Cleaning Solution Not Adding', '基站不自动加液 - 适用型号：T30C/T50MP/T50MPW/T50XP/X8M/X9M', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out. Please refer to the following instructions to ensure the proper operation of your Deebot''s automatic cleaning solution dispensing feature.<br />
<br />
<strong>Automatic Dispensing Overview</strong><br />
Your Deebot’s Docking Station is designed to automatically add cleaning solution to fresh water at a ratio of 1 part solution to 200 parts water.<br />
<br />
If, after refilling the Cleaning Solution Container with ECOVACS Deebot Cleaning Solution, no solution appears to be added to the clean water tank, please follow the steps below.<br />
<br />
<br />
<strong>Step 1: Initial Functionality Check</strong>
<ul>
	<li>Open the ECOVACS Home App.</li>
	<li>Tap "Enter", then select "Station".</li>
	<li>Tap "Wash Mop" to manually start a mop washing cycle.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/b8w3R2yw0JiWPkLelAivCtdEF?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..TLZHweGKEuog3cZqE_WV1w.Uh1E2XJXgckP1KWAzAEqRxGA_39sY7IzC-XPkUmyjxxGTj3SfphaL3_56_y7Gz6mH3P404O2NKaeDzni9iaHnMd7-jTFMJa9cyDZcOqR0G3OgI9faGd6U_0EA0oKwo7vtD8tokroFj9dhiizTEHmUH6P1Yq1j_Gy2gowOyubhbrGMiB6hiF4WRLoOrnQS-7hKC35D1WiodSNdMFAoakaDQ8BqUoCl_gd7FfefX8AWocYX0K2_BCWCTy-B7Ebr1ilK4zo75Zwm8KbMF-0NAFVxlYie1js_67QRneFUAIYSMaricINZFSeQl2VjDFU5tBc.6b9MiuzpMFxw1h9aps_wtg" style="max-width: 622.606px; width: 589px; height: 1272.52px;" title="User-added image" /></div>

<ul>
	<li>Once the cycle is complete:
	<ul>
		<li>Remove the Cleaning Solution Container.</li>
		<li>Check for any moisture at the cleaning outlet (see highlighted area in your user manual or reference image).</li>
	</ul>
	</li>
</ul>
<br />
This helps determine whether the cleaning solution is being dispensed correctly.<br />
<br />
<br />
<strong>Step 2: Verify System Settings and Configuration</strong><br />
<br />
<em>If the issue persists</em>, please verify the following:<br />
<br />
<strong>1. Cleaning Solution</strong>

<ul>
	<li>Ensure that only ECOVACS Deebot Cleaning Solution is being used.</li>
	<li>Do not use third-party cleaning products, as they may cause blockages or interfere with proper operation.</li>
</ul>
<br />
<strong>2. Firmware Version</strong>

<ul>
	<li>Open the ECOVACS Home App and tap "Enter".</li>
	<li>Go to Settings &gt; Robot Advanced Settings &gt; About Your Robot.</li>
	<li>Tap "Update" to check for the latest firmware. If preferred, enable Automatic Updates to allow the robot to install firmware overnight (between 12:00 AM and 6:00 AM).</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/lBBhXxST23JApyOKG4WqISoqv?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..WB959KNzOCYsf9lOwUzNsw.0s2sAYbukwaiCjyl-mYQmlOWQvPaRar0NVAMCLacND4l6lsfdlJkAfBZBqqiA7TNnVIwpQbQjlh8Ov4Kf0_Zr1N7EEg6k4HI5v3PvRd4asU-t7D6jP5id9QXF5qJbbr9xRsS8gyy3k9MNzfzb2uRSsHqY2G70XvHfnC0khiTnhQ8MjUctyyTKOSLLMqHzkYq4gvJ72FIX_wCT4rukxVPxtwbLuUTzOZ7kc1Af6lEetFokalOsDpetYtc35sEeRQeh_XKTaDICuR1c2g4ePLtJiSn81xsBkfpzXQ_5YP7icJs2tUMz926hhUu8H4aJJrm.wy7cz8c4R5IBWqhi2CHkag" style="max-width: 622.6062499999999px" title="User-added image" /></div>
<br />
<strong>3. Intelligent Addition Setting</strong>

<ul>
	<li>Navigate to Settings &gt; Station Advanced Settings.</li>
	<li>Ensure that "Intelligent Addition of Cleaning Solution" is enabled.</li>
	<li>Please note: This setting is disabled by default.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/hHcfrf161NKBDcvLqZBUMQYnC?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..aeEST0OB0uB11uvD3KbPQw.RAphHVZvtUXVnGbVrSJZjwZK5HOP-EpUtjIZ4eAPe_msjh2wv-FxsjIA-04y5Ev_BhA-FmCa4iFo9HqVJAwNImGcVrUXqLWk54R1rnOG_JXFvkTV1BA9PNdFArvxXq6oM2_UYC4-QhWONfNh4sDAenuePDjiEfMt9M3VAUuwqRyrdqJCNPlXCRidKYSo1lW26p2atFFBl8nP7eLN1b6AhAQoHEqeFIfUYmkOHroGljzIG1OWxnNlE21QqgOnxOv_DKo8TmsDIZG6jdZn4WsRHIGVpmXgb8zJIsrdpW61I2LULwTCtOykpKbzBvX_AL9z.RI3m29CdQtfsdXC7wt4Fpg" style="max-width: 622.6062499999999px" title="User-added image" /></div>
<br />
<strong>4. System Monitoring</strong>

<ul>
	<li>Unplug the OMNI Station.</li>
	<li>Remove the Cleaning Solution Container.</li>
	<li>Mark the fluid level on the outside of the container to monitor solution usage.</li>
	<li>Reinstall the container, plug the station back in, and observe the system over the next few days.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/OF37CXZFkcVyWri5iVDFG3TM8?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..10H51a8slzwfd63myDQe_A.mJGrHh4tmgLQMwNzpBxU1fk5DrZk8vMgbvkQna31nkywz4fXBOx1r_2K8Y-c7cTu6wxKTXIN9JGiPBCX8uMnVv1phBCuTaT2xhZrthTBvGCbLpVcSALoMyMbVeOKGoN0ki8BGhOFsXszGoqmDf1MPfhRjGRm4kIVqnxkC-b2boSeA3JNeXP8RIpcmVsc2icJEoJjIogFzwZcH0-gV0sYuzd3Kia62ZtoHtKUQqLYeZ-ZuUX-lt7FsskmvEzLVghY44-yxDrBRTtnYwP2S_smn25CuB3h_qoHKJseJr32ZZA6oY_V_g5E-g_vVKLNlVnQ.TVLDvOkYGYVybg0viOWi6Q" style="max-width: 622.6062499999999px" title="User-added image" /></div>
<br />
<br />
<strong>Important Usage Notes</strong>

<ul>
	<li>Do not mix dispensing methods. Use either:
	<ul>
		<li>The Cleaning Solution Container, or</li>
		<li>Manually add cleaning solution directly to the clean water tank (only if the container is empty).</li>
	</ul>
	</li>
	<li>Using both methods simultaneously is not recommended and may interfere with proper operation.</li>
</ul>
<br />
Please let us know if you require further assistance. We are happy to help.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Ci8rEAC', 'AMR Email Templates', 'X11 Auto Cleaning Solution Dispense', 'X11 自动加液功能（重污+普通）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out regarding the issue with the dual automatic cleaning solutions dispensed on your Deebot X11 OmniCyclone. <em><strong>Please be informed that the amount of cleaning solutions used each time is relatively modest, which might make it harder to notice.</strong></em><br />
<br />
To ensure the proper functionality of both the <em>Regular </em><strong>Auto Cleaning Solution Dispense</strong> and the <strong>Auto <em>Heavy-duty</em> Cleaning Solution Dispense</strong>, please follow the steps below to verify the necessary settings and station configurations.<br />
<br />
<strong>1. Check Cleaning Solution Levels</strong><br />
- Open the lids of both cleaning solution containers and place them on a stable, flat surface.<br />
- Ensure the Regular (Blue) Cleaning Solution Container is filled with Ecovacs Deebot Cleaning Solution, and the Heavy-duty (Dark/Black) Cleaning Solution Container is filled with Ecovacs Heavy-duty Cleaning Solution.<br />
<img alt="X11 Solution 1" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_1?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 1" /><br />
<br />
<strong>2. Update the Deebot’s Firmware</strong><br />
- Open the <strong>Ecovacs Home app</strong>.<br />
- Tap "<strong>Enter</strong>" &gt; <strong>Settings &gt; Robot Advanced Settings &gt; About Your Robot</strong>.<br />
<img alt="X11 Solution 2" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_2?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 2" /><br />
<br />
- Tap "<strong>Update</strong>" to check for firmware updates.<br />
<img alt="X11 Solution 3" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_3?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 3" /><br />
<br />
<em>For automatic updates, toggle "<strong>Automatic Update</strong>" to enable updates between midnight and 6 AM.</em><br />
<img alt="X11 Solution 4" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_4?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 4" /><br />
<br />
<strong>3. Enable Auto Cleaning Solution Dispense</strong><br />
- In the Ecovacs Home app, navigate to <strong>Settings &gt; Station Advanced Settings</strong>.<br />
- Ensure that <strong>Auto Cleaning Solution Dispense </strong>and <strong>Auto Heavy-duty Cleaning Solution Dispense</strong> are both enabled. If previously disabled, toggle these options back on.<br />
<img alt="X11 Solution 5" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_5?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 5" /><br />
<br />
<br />
<strong>Automatic Use of Heavy-Duty Cleaning Solution</strong><br />
If <strong>no </strong>"<strong>Heavily Soiled Areas</strong>" have been set on the map, the Deebot will automatically recognize areas like the kitchen or any user-defined "Kitchen" zone. In these areas, the Heavy-duty Cleaning Solution will be used during the mop washing phase—ideal for tackling grease commonly found in kitchens.<br />
<br />
<br />
<strong>Setting Heavily Soiled Areas on the Map:</strong><br />
To customize these areas, follow these steps:<br />
Go to<strong> Settings &gt; Station Advanced Settings &gt; Auto Heavy-duty Cleaning Solution Dispense</strong>.<br />
Tap <strong>Settings </strong>under <strong>Heavily Soiled Area Settings</strong>, then tap on the map to mark the necessary zones.<br />
Once set, the Deebot will only use the Heavy-duty Cleaning Solution in these specified areas during the mop washing process.<br />
<img alt="X11 Solution 6" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_6?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 6" /><br />
<img alt="X11 Solution 7" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_7?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 7" /><br />
<br />
<em>During mop rinsing, the mop absorbs the Heavy-duty Cleaning Solution and carries it to clean floors in the designated heavy-duty zones, boosting grease removal effectiveness.</em><br />
<br />
<br />
<strong>Post-Cleaning Maintenance of the OZMO Roller Mop</strong><br />
Regardless of whether you’re cleaning in kitchen or heavy-duty zones, the station will automatically clean the mop after each task using Heavy-duty Cleaning Solution. This helps reduce grease residue and buildup, ensuring the roller’s lifespan and continued performance.<br />
<br />
<br />
<strong>Important Notes:</strong><br />
<strong>- Filling the Containers:</strong><br />
Keep the liquid level <strong>below </strong>the maximum fill line, it should be below the round piece.&nbsp;<br />
After filling, press the lid firmly to avoid leakage.<br />
<img alt="X11 Solution 8" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_8?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 8" /><br />
<br />
<strong>- Installing the Containers:</strong><br />
When installing the cleaning solution containers, push them all the way into the docking station to ensure they are properly seated.<br />
<img alt="X11 Solution 9" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_9?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 9" /><br />
<br />
<strong>- Sealing the Covers:</strong><br />
Ensure the cover panels, including the dust collection cabin and cleaning solution container covers, are properly sealed.<br />
<img alt="X11 Solution 10" src="https://ecovacs2020.file.force.com/file-asset-public/X11_Solution_10?oid=00D2x000005pVxV" style="max-width: 899.60546875px" title="X11 Solution 10" /><br />
<br />
<strong>- Avoid Frequent Container Removal:</strong><br />
Avoid frequently removing the cleaning solution containers during use. Due to backflow in the internal water system, removing the container while it is full may cause slight leakage. Wipe off any spills; this is normal and not a defect.<br />
<br />
<strong>- Vent Hole in the Container:</strong><br />
The small vent hole on the top of the cleaning solution container is designed to release air for smooth pressing. This is not a manufacturing defect and does not affect normal use.<br />
<br />
Please let us know if you require further assistance. We are happy to help.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005CiDhEAK', 'AMR Email Templates', 'Winbot W1 Pro "Connect to Power Source" Alarm', '“Connect to Power Source” 报警', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out to us regarding your Winbot. To ensure your Winbot charges properly, please follow the steps outlined below:<br />
<br />
<strong>1. Safety Tether and Carabiner Connection</strong><br />
Ensure that the Safety Tether and Carabiner are properly connected to the Winbot before use.&nbsp;(These components are connected by default and should not be disconnected prior to use.)<br />
<img alt="Winbot Charging 0" src="https://ecovacs2020.file.force.com/file-asset-public/Winbot_Charging_0?oid=00D2x000005pVxV" style="max-width: 622.6062499999999px" title="Winbot Charging 0" /><br />
<br />
<strong>2. Connecting or Reconnecting the Power Cord</strong><br />
Follow the steps below to connect or reconnect the Power Cord, Power Adapter, and Plug to the Winbot.<br />
<img alt="Winbot Charging 1" src="https://ecovacs2020.file.force.com/file-asset-public/Winbot_Charging_1?oid=00D2x000005pVxV" style="max-width: 622.6062499999999px" title="Winbot Charging 1" /><br />
<br />
Ensure the components are connected in the specified order to prevent charging abnormalities or potential damage to the battery.<br />
<br />
It is important to ensure the battery is fully charged before using the device. The charging time is approximately 2 hours.<br />
<br />
<em>Note: Please do not disconnect the power while the Winbot is running, as this may result in failure or damage.</em><br />
<br />
<strong>3. Power Switch Position</strong><br />
Verify that the main power switch of the Winbot is in the "I" (ON) position.<br />
<img alt="Winbot Charging 2" src="https://ecovacs2020.file.force.com/file-asset-public/Winbot_Charging_2?oid=00D2x000005pVxV" style="max-width: 622.6062499999999px" title="Winbot Charging 2" /><br />
<br />
<strong>4. Testing the Power Outlet</strong><br />
Test the power outlet to ensure it is functioning correctly.<br />
<br />
If possible, try connecting the device to a different outlet to confirm whether the issue persists. If the current outlet is not working, please connect the Winbot to another outlet and test again.<br />
<br />
<br />
If you continue to experience any issues or have further questions, please don''t hesitate to contact us for assistance.</p>
</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005DTFpEAO', 'AMR Email Templates', 'EOLed Model Parts out of stock', 'EOLed Model Parts 没库存', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We sincerely appreciate your continued loyalty as a valued member of the Ecovacs family. However, we regret to inform you that the specific part you are requesting is currently unavailable in our inventory.<br />
<br />
In such instances, we highly recommend reaching out to our authorized service center, Besender, to inquire about the current availability of the required part.&nbsp;<br />
<br />
<em><strong>Contact Besender at:</strong></em><br />
Email: service@besender.com<br />
Phone: +1 888-290-1685<br />
Website: <a href="https://service.besender.com/ecovacs/home">https://service.besender.com/ecovacs/home</a><br />
<br />
If, unfortunately, Besender is also out of stock for the part you need, we have a couple of alternative suggestions:<br />
<br />
1. Consider upgrading your Deebot through our official webstore (US Webstore at <a href="https://www.ecovacs.com/us">https://www.ecovacs.com/us</a> or CAN Webstore at <a href="https://www.ecovacs.com/ca">https://www.ecovacs.com/ca</a> ). As a token of appreciation for your continued support, we are pleased to offer you a special coupon for your purchase.<br />
<br />
2. Check out Amazon for the part. However, please be advised that purchases from unauthorized resellers may not be covered by the Ecovacs warranty or guarantee, and we cannot be held responsible for any issues that may arise from such transactions.<br />
<br />
<br />
Once again, thank you for your understanding, and we remain committed to providing you with exceptional service.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005DTpJEAW', 'AMR Email Templates', 'Parts Not for Sale', '配件无货/不对外销售', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thanks for contacting Ecovacs Robotics.<br />
<br />
We regret to inform you that the part you are seeking is <strong>not </strong>available for sale. If your Deebot is not functioning properly and requires repair services,<br />
<br />
1) If your Deebot is still within the one-year manufacturer warranty, please respond to this email with a copy of the proof of purchase, the serial number of your Deebot, your shipping address, and your contact information.<br />
-Serial Number of the unit (usually found underneath the dust bin, starting with E0).<br />
-For the current shipping address, kindly provide a <strong>non-P.O. box</strong> shipping address, as we are unable to ship to a P.O. box address.<br />
<br />
2) If your Deebot is out of warranty, please reach out to our authorized service center, Besender, for repair services or for the parts you are seeking.<br />
Email: ​service@besender.com<br />
Phone: +1 888-290-1685<br />
Website: <a href="https://service.besender.com/ecovacs/home">https://service.besender.com/ecovacs/home</a><br />
<br />
3) Alternatively, if you''re interested in purchasing an upgraded Deebot, visit our US Web Store&nbsp;<a href="https://www.ecovacs.com/us ">https://www.ecovacs.com/us </a> or CA Web Store https://www.ecovacs.com/ca<a href="https://www.ecovacs.com/ca">https://www.ecovacs.com/ca</a> . As a loyal customer, you are eligible for a special discount. Reply to this email, and we will apply the special coupon on your behalf.<br />
<br />
Thank you for choosing Ecovacs. Feel free to contact us if you need further assistance.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005IzOjEAK', 'AMR Email Templates', 'X1 Omni: Too much water seepage/Water drops when mopping', 'X1 Omni: 出水过多', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We would like to kindly inform you that the X1 Omni is suitable for most types of hard surface flooring, including wooden floors. If you''re concerned about the amount of water being dispensed, you can adjust the water level in the app settings to better accommodate your floor type.<br />
Please refer to the suggested settings below for optimal performance on wooden flooring:
<ul>
	<li><strong>Cleaning Times: Once</strong></li>
	<li><strong>Water Level: Low</strong></li>
	<li><strong>Mopping Mode: Standard</strong></li>
	<li><strong>Cleaning Interval: Efficient</strong></li>
	<li><strong>Hot Air Drying Time: 4 hours</strong></li>
</ul>
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image8?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image" /><img alt="image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_112?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 252px; height: 547.992px;" title="image (1)" /><img alt="image (2)" src="https://ecovacs2020.file.force.com/file-asset-public/image_2220902202806?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (2)" /><br />
<br />
If you are experiencing issues with water droplets, please try the following steps:
<ul>
	<li>Ensure there is sufficient water in the clean water tank.</li>
	<li>Check if the clean water tank and mopping plate are properly installed.</li>
	<li>Inspect the water outlets at the bottom of the unit and clean them if necessary.</li>
	<li>Make sure the magnets where the mopping plates attach are free of dust or debris (please refer to the photo below for guidance).</li>
</ul>
<img alt="image (3)" src="https://ecovacs2020.file.force.com/file-asset-public/image_33?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (3)" /></body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005IzYPEA0', 'AMR Email Templates', 'X1/T10 Omni: How to restore/backup/delete maps', 'X1/T10 Omni: 恢复/备份/删除地', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Navigate to <strong><em>Map Management</em></strong> for more options.<br />
2. Select the map currently in use and tap the <strong><em>Edit </em></strong>button.<br />
3. Choose <strong><em>Restore Map</em></strong> to revert to the previous version. Once restored, you may then select <strong><em>Back up Map</em></strong> to save the current version again.<br />
<br />
<img alt="image (4)" src="https://ecovacs2020.file.force.com/file-asset-public/image_43?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (4)" /><img alt="image (5)" src="https://ecovacs2020.file.force.com/file-asset-public/image_52?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (5)" /><img alt="image (6)" src="https://ecovacs2020.file.force.com/file-asset-public/image_61?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (6)" /></body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005IzyDEAS', 'AMR Email Templates', 'X1/T10 Omni: Dustbag detection issue', 'X1/T10 Omni: 尘袋检测问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please press the button to pull out the drawer.<br />
2. Confirm that the dust bag is installed correctly, as shown in the picture.<br />
3. Ensure the drawer is firmly pushed back into place.<br />
<img alt="image (7)" src="https://ecovacs2020.file.force.com/file-asset-public/image_71?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (7)" /><br />
4. Wipe the sensor located underneath the drawer area to remove any dust or debris—this sensor becomes visible once the drawer is fully removed. Please use a dry paper towel to clean this area.<br />
<img alt="516b7073-3af1-4c47-a5fa-ac353bd1a19d" src="https://ecovacs2020.file.force.com/file-asset-public/X516b70733af14c47a5faac353bd1a19d?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="516b7073-3af1-4c47-a5fa-ac353bd1a19d" /><br />
5. Also, check that the small outlet on the drawer itself is clear and unobstructed.<br />
<img alt="8a965fe5-5fb6-421d-b8b2-44aefb128be5" src="https://ecovacs2020.file.force.com/file-asset-public/X8a965fe55fb6421db8b244aefb128be5?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 653.977px; height: 426.984px;" title="8a965fe5-5fb6-421d-b8b2-44aefb128be5" /><br />
Then proceed with the following troubleshooting steps:
<ul>
	<li><strong>Unplug the station and power off the DEEBOT.</strong></li>
	<li><strong>Place the DEEBOT back on the station while it is still off.</strong></li>
	<li><strong>Wait 30 seconds.</strong></li>
	<li><strong>Plug the station back in and turn the DEEBOT on.</strong></li>
	<li><strong>Reinstall the dust bag and check the app for updates on the status.</strong></li>
</ul>
</body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005J0PdEAK', 'AMR Email Templates', 'No Warranty - Used Deebot', '二手地宝无法享受质保服务', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for sharing your concerns with us.<br />
<br />
As per our policy, we provide a <strong>1-year warranty</strong> for <strong>new </strong>ECOVACS Deebots purchased through our <strong>authorized </strong>resellers. Based on the proof of purchase you provided, your Deebot&nbsp;was purchased as a "<u>used</u>" unit, which unfortunately does <strong>not qualify for warranty coverage</strong>.<br />
<br />
The 1-year warranty is available only to the<strong> original purchaser </strong>and is <strong>non-transferable</strong>. We sincerely wish we could offer service for your unit, but as the product does not meet the eligibility criteria, we are unable to proceed with warranty support.<br />
<br />
We recommend reaching out to the <strong>original seller</strong> directly to explore available service options, or continuing the communication you have already established with them.<br />
<br />
We truly appreciate your understanding, and should the situation change or if we have the opportunity to assist you in the future, we look forward to it.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005J0kbEAC', 'AMR Email Templates', 'T10/X1 Omni:No water seepage from clean water tank/Wastewater cannot be recycled', 'T10/X1 Omni: 基站不出水/污水不循环', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please remove both the clean and dirty water tanks from the station. Under the tanks, you will find cone-shaped rubber sealing plugs. Kindly rinse these sealing plugs with clean water. When reinstalling them, press down firmly to ensure they are properly sealed with the station.<br />
<img alt="6b6dd98a-f93b-4d12-8cfc-9a5f9cd153af" src="https://ecovacs2020.file.force.com/file-asset-public/X6b6dd98af93b4d128cfc9a5f9cd153af?oid=00D2x000005pVxV" style="max-width: 664.3171874999999px" title="6b6dd98a-f93b-4d12-8cfc-9a5f9cd153af" /><br />
2. Open the clean/dirty water tank and press along the seal strip on the sides. Also, please check if the lid of each tank is closed securely—press it down gently to make sure it is installed correctly.<br />
<img alt="image (8)" src="https://ecovacs2020.file.force.com/file-asset-public/image_81?oid=00D2x000005pVxV" style="max-width: 664.3171874999999px" title="image (8)" /><br />
3. Short-press the <strong>[Add/Pump water in the cleaning tank]</strong> button on the station. After hearing the voice prompt, short-press the button again to confirm whether the dirty water can be recycled normally.
<ul>
	<li>If the recycling works, please wipe the water level sensors on both sides with a dry cloth, then power off the robot, restart it, and observe if the issue is resolved.</li>
</ul>
<img alt="image (9)" src="https://ecovacs2020.file.force.com/file-asset-public/image_91?oid=00D2x000005pVxV" style="max-width: 664.3171874999999px" title="image (9)" />
<ul>
	<li>If the recycling does not work, please check the recycling port for any foreign objects. If blocked, clean it with the cleaning brush and then run a self-cleaning cycle at the station.</li>
</ul>
<img alt="image (10)" src="https://ecovacs2020.file.force.com/file-asset-public/image_101?oid=00D2x000005pVxV" style="max-width: 664.317px; width: 661.969px; height: 375px;" title="image (10)" /><br />
<img alt="image (11)" src="https://ecovacs2020.file.force.com/file-asset-public/image_113?oid=00D2x000005pVxV" style="max-width: 664.3171874999999px" title="image (11)" /><br />
4. If no water comes out from the clean water tank, please remove the blue filter cotton, wash it thoroughly, and reinsert it into the bottom of the tank.<br />
<img alt="image (12)" src="https://ecovacs2020.file.force.com/file-asset-public/image_121?oid=00D2x000005pVxV" style="max-width: 664.3171874999999px" title="image (12)" /><br />
<img alt="image (13)" src="https://ecovacs2020.file.force.com/file-asset-public/image_131?oid=00D2x000005pVxV" style="max-width: 664.3171874999999px" title="image (13)" /><br />
<br />
5.&nbsp;If the station is still unable to pump water into the dirty tank, kindly check both tanks and ensure the magnets at the back of each tank are intact.</body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005J0vuEAC', 'AMR Email Templates', 'X2 Omni: Charging/Recharging Issue', 'X2 Omni: 充电/回充问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Improper Installation of the Detachable Water Tray: Ensure that the detachable water tray is correctly installed. Incorrect installation can create a height difference between the charging contacts on Deebot and the charging pins on the OMNI station, leading to poor contact. Make sure the detachable water tray is properly secured in place.<br />
<img alt="image (14)" src="https://ecovacs2020.file.force.com/file-asset-public/image_141?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (14)" /><br />
<br />
2. Remove Scratch-Resistant Plastic Covering: Check if there is a scratch-resistant plastic covering on both the charging contacts of the Deebot and the charging pins on the OMNI station. Remove any protective plastic coverings as they can obstruct the charging process.<br />
<img alt="image (15)" src="https://ecovacs2020.file.force.com/file-asset-public/image_151?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (15)" /><br />
<img alt="image (16)" src="https://ecovacs2020.file.force.com/file-asset-public/image_16?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (16)" /><br />
3. Verify that the main switch at the rear of the station is turned on: Locate the main switch on the bottom right-hand corner of the station and ensure it is in the "on" position.<br />
<img alt="image (17)" src="https://ecovacs2020.file.force.com/file-asset-public/image_17?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (17)" /><br />
4. Verify that the main switch for your Deebot is turned to the ''I'' position: Kindly turn the red switch to the right side to activate the main power for the Deebot.<br />
<img alt="image (18)" src="https://ecovacs2020.file.force.com/file-asset-public/image_18?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (18)" /><br />
<br />
5. Verify that the Deebot has been correctly positioned inside the charging dock: When the Deebot is placed correctly in the charging station, the light on top of the Deebot should flash blue slowly, indicating that the Deebot is charging steadily.<br />
<img alt="image (19)" src="https://ecovacs2020.file.force.com/file-asset-public/image_19?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (19)" /><br />
<br />
6. Verify the connection between the station and the Deebot: Please ensure that the power cord is securely plugged into both the station and the power outlet.</body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005J1QXEA0', 'AMR Email Templates', 'eBay Refurbished Machine 2-Year Warranty (Buydig/ecovacs_usa)', 'eBay 官方翻新机 - 超90天', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you so much for contacting Ecovacs Robotics.<br />
&nbsp;</p>

<p>According to your situation, it is recommended to claim the warranty via eBay through the reference link below:</p>

<p><a href="https://pages.ebay.com/refurbishedprogramwarranty/" rel="noreferrer" target="_blank">https://pages.ebay.com/refurbishedprogramwarranty/</a><br />
&nbsp;</p>

<p>Thank you so much for your understanding, and please feel free to let us know if you have any questions.</p>
</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005J6WhEAK', 'AMR Email Templates', 'X2/X5 - Square Bot Stuck Between Chair Legs', 'X2M/X5M 容易在椅子腿间隙卡住', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We sincerely regret any inconvenience this may have caused.<br />
<br />
This Deebot has a rectangular design at the front and a round shape at the rear. When it turns or changes direction, if the gap between the chair legs is approximately the same length as, or smaller than, the robot''s diagonal, it may become stuck. This is a result of the product''s design features.<br />
<br />
To help prevent this issue, we recommend setting up a virtual boundary or adjusting the position of your chairs.<br />
<br />
Thank you for your understanding. Please don''t hesitate to reach out if you need further assistance!</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JL7VEAW', 'AMR Email Templates', 'Test Products Warranty Verification', '测试产品质保验证', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We greatly appreciate your valuable contributions to our testing and review processes.<br />
<br />
To verify the warranty for the Ecovacs test unit, please provide the <strong>tester''s agreement</strong> from Ecovacs, along with the <strong>contact information of the designated point of contact (including name, email, and other relevant details)</strong>. This information is essential for warranty verification and to ensure the integrity of our testing program.<br />
<br />
Your cooperation is crucial in helping us maintain the quality of our products and services for our customers. We truly appreciate your continued support.<br />
<br />
Thank you again for your attention to this matter.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZATEA4', 'AMR Email Templates', 'Tracking Number (General Inquiries)', '告知物流信息 (非质保）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you so much for your patience.<br />
<br />
Please find your shipment details below:
<ul>
	<li><strong>Tracking #:</strong></li>
	<li><strong>Carrier:</strong></li>
	<li><strong>Tracking link:</strong></li>
	<li><strong>ETA:</strong></li>
</ul>
<br />
We truly appreciate your understanding throughout this process. If you have any further questions or need additional assistance, please don''t hesitate to reach out.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZC5EAO', 'AMR Email Templates', 'Suddenly stops for a second while working', '地宝工作时突然停下', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Before performing maintenance, please ensure the DEEBOT is switched OFF.<br />
<br />
<strong>1. Check the Side Brushes:</strong><br />
Confirm that the Side Brushes are installed correctly.<br />
<br />
<strong>2. Inspect the Universal Wheel:</strong><br />
Toggle the Universal Wheel and check for any tangles or debris. Clean it if necessary.<br />
<br />
<strong>3. Test the Driving Wheels:</strong><br />
Press down on both sides of the Driving Wheel and slide both wheels to ensure they can slide/rebound freely. Clean the wheels if needed.<br />
<br />
<strong>4. Clean the Bumper:</strong><br />
Tap and wipe the bumper to ensure it''s free from debris.<br />
<br />
<strong>5. Switch ON and Test:</strong><br />
Turn the DEEBOT back ON and confirm if it is functioning properly.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZDhEAO', 'AMR Email Templates', 'Deebot Won''t Hold a Charge', '地宝总是充不满电', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Power Reset</strong><br />
Turn the robot''s main power switch to the OFF position, then switch it back ON to reset it.<br />
<br />
<strong>2. Clean the Contacts</strong><br />
Wipe the robot’s contacts and the charging dock pins (charging electrodes) with a dry cloth to maintain optimal charging efficiency.<br />
<br />
<strong>3. Place on Charging Dock</strong><br />
Place the DEEBOT on the charging dock, ensuring that the charging contacts on the DEEBOT align with the charging dock pins for a secure connection.<br />
<br />
<strong>4. Try Another Power Outlet</strong><br />
If the robot is still not charging, plug the charging dock into a different power outlet and repeat step 3.<br />
<br />
<strong>Note:</strong><br />
If the robot’s battery is fully discharged or has not been used for a long period, its capacity may have decreased, which can affect charging performance.<br />
<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZFJEA4', 'AMR Email Templates', 'Check Network SSID', '查看网络 SSID', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Here''s how you will be able to check your network''s SSID.<br />
<br />
1. Log into your account. Open your browser and enter the manufacturer’s default IP address, typically located on the underside of your router or in the user manual or a custom one that you set. Using your username and password, log into your router settings page.<br />
<br />
2. Open the Wireless tab to edit your wireless settings. Once there, go to the “Primary Network” (or equivalent) tab if you’re not already on the correct page.<br />
<br />
3. Click to change your SSID to something personal. In the SSID field, you’ll want to change the SSID from the generic assigned identifier to something more personal and easy to remember (for example, Domanico’s WiFi). Think of a name that will be difficult for an outsider to guess, but not something so tough you’ll struggle to remember it. Write it down and keep the name of your network in a safe place.<br />
<br />
4. Manually enter your new SSID to connect devices to your network. To do so on your Windows laptop, open the Control Panel &gt; Network and Sharing Center. Click “Set up a new connection or network.” Then click “Manually connect to a wireless network,” and enter your SSID and password.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZIXEA4', 'AMR Email Templates', 'Cancel Ecovacs Account via App', '用户自行取消科沃斯账号（App）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please attempt to cancel your Ecovacs account from the Ecovacs Home App by following these steps:<br />
<br />
1. Open the Ecovacs Home App and navigate to <strong>Mine </strong>&gt;&nbsp;<strong>Settings</strong>.<br />
<img alt="App 1" src="https://ecovacs2020.file.force.com/file-asset-public/App_11?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="App 1" /><br />
<br />
<br />
2. Tap <strong>Account and Security</strong>.<br />
<img alt="App 2" src="https://ecovacs2020.file.force.com/file-asset-public/App_21?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="App 2" /><br />
<br />
3. Select <strong>Cancel Account</strong>.<br />
<img alt="App 3" src="https://ecovacs2020.file.force.com/file-asset-public/App_31?oid=00D2x000005pVxV" style="max-width: 710.1250579833984px" title="App 3" /><br />
<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZNNEA4', 'AMR Email Templates', 'AIVI Cannot Recognize Objects', 'AIVI 无法识别物体', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>AIVI Limitations</strong>
<ul>
	<li>AIVI Recognition must be manually enabled through the ECOVACS app for it to function.</li>
	<li>Currently, AIVI can recognize the following objects: shoes, slippers, socks, rugs, wires, and the charging dock.</li>
	<li>Lighting Conditions: AIVI performs best in well-lit environments. Low light may significantly impact its object recognition. It is recommended to use AIVI during the day or with room lights turned on.</li>
	<li>Clean the Camera Mirror: Gently wipe the camera mirror with a clean, soft cloth to ensure it is tidy and unobstructed for optimal performance.</li>
	<li>Environmental Complexity: If your home has a complex layout or if objects have unusual shapes, AIVI may take longer to react or may touch objects unexpectedly.</li>
	<li>To improve performance: Make sure your firmware is up-to-date. Regularly check for updates through the ECOVACS Home app for the best recognition performance.</li>
</ul>
<br />
<em>Additional Tips:</em><br />
If AIVI still fails to recognize objects consistently, consider repositioning your furniture or reducing clutter around the robot to improve its navigation.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZOzEAO', 'AMR Email Templates', 'DEEBOT Runs Out Without a Schedule', '没有设置定时清洁，地宝却跑出来', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ol>
	<li>Please confirm whether the robot’s time zone is correctly synced with your phone. You can find the robot’s time zone under <strong>Settings → About Robot → Time Zone</strong>.</li>
	<li>If the time zone is correct, please try deleting the current schedule and re-adding it.</li>
	<li>Ensure the Charging Dock is properly connected. Make sure the Dock is securely plugged into a wall socket, as a loose connection may cause abnormal behavior.</li>
	<li>If the issue persists, please perform a hard reset on the robot.</li>
</ol>
</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZQbEAO', 'AMR Email Templates', 'DEEBOT Keeps Going Back onto or Struggles with Carpet', '地宝在地毯处遇困', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">If your DEEBOT is getting stuck or struggling to navigate onto or off carpets, please check the following:<br />
<br />
<strong>1. Check Carpet Type</strong>
<ul>
	<li>Long-Haired Carpet: DEEBOT may struggle to move on long-haired carpets (more than 2 cm in length). These carpets can be challenging for the robot to climb or clean effectively.</li>
	<li>Short-Haired Carpet: If your carpet is short-haired (less than 2 cm), the robot should generally be able to move across it without issue.</li>
</ul>
<br />
<strong>2. Color of the Carpet</strong><br />
Dark-Colored Carpet: If your carpet is too dark, it may interfere with the anti-drop sensors on the DEEBOT, causing it to mistakenly detect a drop-off or ledge. This can result in the robot avoiding or getting stuck on the carpet. To prevent this, try adjusting the robot’s path or use Virtual Walls to block dark carpets from being detected.<br />
<br />
<strong>3. Cleaning Cloth Plate Installation</strong> (for older models <strong><u>without </u></strong>the mop plate lifting feature)<br />
If the Cleaning Cloth Plate is installed, the DEEBOT may have difficulty navigating carpets. This attachment is designed for hard floors, and using it on carpets can affect the robot''s ability to move properly.<br />
<br />
<br />
<strong>Additional Suggestions:</strong>

<ul>
	<li><strong>Virtual Walls or No-Go Zones: </strong>If you want to prevent the DEEBOT from cleaning certain areas, including carpets, set up Virtual Walls or No-Go Zones using the ECOVACS Home app.</li>
	<li><strong>Carpet Detection:</strong> For models that support Carpet Detection, make sure the setting is enabled in the app so the robot adjusts suction power when moving across carpets.</li>
</ul>
<br />
If the issue continues, please reach out to customer support for further assistance. We''re happy to help resolve this matter!</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZSDEA4', 'AMR Email Templates', 'Dust Coming Out from DEEBOT', '地宝掉灰 / 尘', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">If you''re noticing dust coming out of your DEEBOT, please follow these steps to ensure everything is clean and functioning properly:<br />
<br />
<strong>1. Clean the Side Brushes</strong><br />
Remove the Side Brushes and clean both the brushes and their slots thoroughly. Pay attention to the color of the brushes and the slot condition when reinstalling to ensure they fit correctly.<br />
<br />
<strong>2. Clean the Main Brush</strong><br />
Remove the Main Brush Cover and take out the Main Brush. Clean the brush and the accessories at both ends. When reinstalling the Main Brush Cover, make sure that all four sides of the cover are securely locked in place.<br />
<br />
<strong>3. Clean the Dust Suction Port, Dust Bin, and Filter</strong><br />
Inspect and clean the dust suction port, Dust Bin, and Filter components. If the Dust Bin is washed with water, ensure it is completely dry before reinstalling it and using the robot again.<br />
<br />
<strong>4. Check the Baffle in the Dust Bin</strong><br />
Verify whether the baffle at the suction port of the Dust Bin is missing or stuck. A malfunctioning or misaligned baffle can affect suction and cause dust to escape.<br />
<br />
<br />
<u><em>Additional Tip:</em></u><br />
For optimal performance, it is recommended to regularly clean these components, especially the side brushes and main brush, to prevent dust buildup.<br />
<br />
<br />
If the issue persists, please reach out to customer support for further assistance. We are here to help!</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZTpEAO', 'AMR Email Templates', 'Dividing the Area', '如何分割区域', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><br />
<strong>1. Ensure No Obstacles</strong><br />
Kindly ensure that there are no obstacles within the selected area that could interfere with the division process.<br />
<br />
<strong>2. Divide into a Close Area</strong><br />
The area you divide should be compact and close together. Avoid creating overly large or distant segments.<br />
<br />
<strong>3. Check Point-to-Point Alignment in the APP</strong><br />
When dividing, make sure that the point-to-point lines in the app connect to the walls properly, ensuring they "hit" the wall to accurately define the area.<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZX3EAO', 'AMR Email Templates', 'Why 2.4GHz Only for Deebot', '为什么地宝仅支持2.4G网络', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Currently, our DEEBOT models only support <strong>2.4GHz </strong>Wi-Fi. This is because 2.4GHz provides a more <strong>stable </strong>connection over a <strong>wider </strong>coverage area and is better at penetrating solid objects (such as walls and furniture). This ensures that your DEEBOT stays connected and reduces the chance of it going offline while cleaning around the house.<br />
<br />
For optimal performance, please make sure your router is set to<strong> 2.4GHz</strong> when connecting your DEEBOT.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005JZYfEAO', 'AMR Email Templates', 'Register for Warranty/ Warranty Registration', '暂不要求注册质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We would like to clarify that registering your warranty in advance is <strong>not </strong>required. ECOVACS offers a <strong>1-year</strong> warranty for <strong>Deebots </strong>purchased through our <strong>authorized </strong>resellers. Should you experience any issues within one year of the original purchase date, we will assist you in validating your warranty upon receipt of your proof of purchase.<br />
&nbsp;</p>

<p>To facilitate the warranty validation process, we recommend retaining a digital copy or screenshot of your proof of purchase, which should include the <strong>order number</strong>, <strong>purchase date</strong>, <strong>purchase channel</strong>, and <strong>model</strong> details.<br />
<br />
Should you require further assistance with troubleshooting, warranty verification, or potential repair/replacement services, please do not hesitate to contact us.</p>
</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005KQTJEA4', 'AMR Email Templates', 'Replacement Warranty Period', '替换机或维修后机器的质保时长', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We would like to clarify that warranty replacements <strong>do not </strong>restart the warranty period. The replacement unit will inherit the <strong>remainder of the original warranty</strong>, or <strong>90 days</strong>, whichever is longer.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005KblJEAS', 'AMR Email Templates', 'N20 Network Connection Guide', 'N20 联网步骤', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Regarding your inquiry about the app connection issue, we would like to confirm whether you have processed the troubleshooting steps below:
<ul>
	<li>Turn off the Deebot by pressing the <strong>power button</strong> for approximately 3 seconds.</li>
	<li>Scan the <strong>QR code</strong> located next to the dustbin using the Ecovacs Home App.</li>
	<li>Ensure your phone is connected to a <strong>2.4GHz Wi-Fi </strong>network.</li>
	<li>Enter the Wi-Fi name and password accurately.</li>
	<li><strong>Turn on the Deebot by pressing the power button for about 3 seconds. </strong>After the startup music plays, you will hear the Deebot''s initial thank-you/greeting message.</li>
	<li><strong>Check that you''ve switched on the robot in the app, then proceed to the next step.</strong></li>
	<li>Remove the lid/cover from the top of the Deebot and locate the Wi-Fi button. Press it briefly for no more than 1 second. Listen for the Deebot to emit <strong>the sound "ready for network setup." </strong>Check if you receive a notification in the app asking you to join <strong>Ecovacs_xxxx</strong>.<u><strong> If you do, press "join" and proceed to the next step. If you don’t hear the "ready for network setup" sound or see the Wi-Fi signal from the Deebot, press the Wi-Fi button again until you do.</strong></u></li>
	<li>Wait for the connection to initiate and listen for the Deebot to say "connected, please go back to the app."</li>
	<li>Stay in the app to allow the setup to be configured.</li>
	<li>If the connection is successful, you will be prompted to name your Deebot.</li>
</ul>

<div style="margin-left: 40px;"><img alt="User-added image" src="https://p23.zdusercontent.com/attachment/1730050/Bl6JJ6fGma0LJcaEcbAFagyiE?token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..Yi3Vcpk4_GR_Hk5SP0079Q.clu-WEIV-1fUCwgFAsJQknryMBZweTCYBOHrsN_DawrXpSPazmPp1sQAdjFZH-6zpamESMUm89CreSMBmc1tR0ptavX8L6qc0vRPoFazm1NjnYo_qmpLcg-vNfHhqthXB_K9jweRHjVw4i5UYraxuQePWVJ74YdjfOqbR6fc7sngVJMnqXOrNOxrfduGeuPmG5p3XAw7s2zsnFfq8nvOeJ3TC1mzYwbrDil8ICEj6D38Z9lPuzGyrtS0AfyFGcZn_bDavf_LpoW6D7SLhADAqd2E2ALaq93ZqWA2dO8d3K6VuSgU2eNsmqQhOflWXFEk.XL4pIZYKytPKJcOswjnM0g" style="max-width: 708.2138671875px" title="User-added image" /></div>
<br />
Please let us know if you need further assistance.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005KbrlEAC', 'AMR Email Templates', 'Deebot Enters Sleep Mode', '地宝休眠了', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We would like to clarify the following regarding your Deebot:
<ul>
	<li>When the Deebot is charging at its base station, the indicator light on the power (start/pause)&nbsp;button will slowly flash white.</li>
	<li>Once it''s fully charged or during operation, the power button will be lit solid white.</li>
	<li>If fully charged but not in operation, the indicator light will dim after turning solid white, and the Deebot will enter "sleep mode."</li>
</ul>
&nbsp;<br />
To "wake up" the Deebot from "sleep mode," simply send it out for a cleaning task, and the indicator light will light up again. If the Deebot has not been powered on, please press and hold the power button for 3 seconds to turn on the machine before charging it.<br />
&nbsp;<br />
If you need further assistance, please let us know.</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005N3FFEA0', 'AMR Email Templates', 'X11 Dirty Water Box Malfunction', 'X11 污水盒异常', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Remove the Dirty Water Box from the Deebot, pour out the wastewater, and rinse the tank with fresh flowing water.<br />
<img alt="Dirty Water Box 1" src="https://ecovacs2020.file.force.com/file-asset-public/Dirty_Water_Box_1?oid=00D2x000005pVxV" style="max-width: 708.214px; width: 321.992px; height: 407.969px;" title="Dirty Water Box 1" /><br />
<br />
2. Inspect the drainage port for any blockages, such as hair or debris, and clean it thoroughly.<br />
<img alt="Dirty Water Box 2" src="https://ecovacs2020.file.force.com/file-asset-public/Dirty_Water_Box_2?oid=00D2x000005pVxV" style="max-width: 708.214px; width: 326.992px; height: 437.246px;" title="Dirty Water Box 2" /><br />
<br />
3. Press the drainage port of the Dirty Water Box to ensure it rebounds properly. Afterward, reinstall the tank into the rear end of the Deebot.<br />
<img alt="Dirty Water Box 3" src="https://ecovacs2020.file.force.com/file-asset-public/Dirty_Water_Box_3?oid=00D2x000005pVxV" style="max-width: 708.214px; width: 290px; height: 360.957px;" title="Dirty Water Box 3" />&nbsp;<img alt="Dirty Water Box 4" src="https://ecovacs2020.file.force.com/file-asset-public/Dirty_Water_Box_4?oid=00D2x000005pVxV" style="max-width: 708.214px; width: 435.996px; height: 270.859px;" title="Dirty Water Box 4" /><br />
<br />
4. Press both charging pins on the base station for about 2 seconds to check if the wastewater drainage push rod can raise and lower normally.<br />
<img alt="Dirty Water Box 5" src="https://ecovacs2020.file.force.com/file-asset-public/Dirty_Water_Box_5?oid=00D2x000005pVxV" style="max-width: 708.214px; width: 580px; height: 400.02px;" title="Dirty Water Box 5" /><br />
<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NQ0YEAW', 'AMR Email Templates', 'T20 Omni: No Water Seepage from Clean Water Tank', 'T20 Omni: 基站不出水(清水箱不出水)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Kindly clean and press down the sealing plugs. Open the clean/dirty water tank and press the seal strip on the sides. Please also check if the lid of the clean/dirty water tank is closed and press downward to ensure it is installed properly.<br />
<img alt="download_image" src="https://ecovacs2020.file.force.com/file-asset-public/download_image2?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image" /><br />
<img alt="download_image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_11?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (1)" /><br />
<br />
2. Please short-press and hold the "Start/Pause" button on the base station and end the current task after hearing the voice prompt.<br />
<img alt="image (26)" src="https://ecovacs2020.file.force.com/file-asset-public/image_26?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (26)" /><br />
3. Then press for about 5s the [Add/Pump water in the cleaning tank] button on the station, and after hearing the voice prompt, press again for about 5s the button again to confirm whether the dirty water can be recycled normally.<br />
<img alt="image (27)" src="https://ecovacs2020.file.force.com/file-asset-public/image_27?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (27)" /><br />
If clean/dirty water can be recycled normally, please wipe the water level sensor on both sides with a dry cloth, shut down the robot and restart it, and then use and observe it.<br />
<br />
If the clean/dirty water cannot be recycled, please check the clean/dirty water recycling port to see whether it is blocked by foreign objects. If it is, please clean it up with the cleaning brush and process the self-cleaning of the station.<br />
<br />
Please kindly check both tanks and make sure that the magnets behind both tanks are intact.<br />
<img alt="image (28)" src="https://ecovacs2020.file.force.com/file-asset-public/image_28?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 346.992px; height: 523.992px;" title="image (28)" /><img alt="download_image (2)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_21?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 323.977px; height: 522px;" title="download_image (2)" /><br />
<br />
You may also refer to the attached videos for how to clean the sealing plugs and the dirty water tank.<br />
***And please try to remove the clean sink water filter(a plastic piece) and install it, then test again.<br />
<br />
<img alt="download_image" src="https://ecovacs2020.file.force.com/file-asset-public/download_image3?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image" /><br />
<img alt="download_image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_12?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (1)" /></body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Na4jEAC', 'AMR Email Templates', 'T20 Omni: How to set up customized and scheduled cleaning', 'T20 Omni:自定义清扫+预约清扫', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Go to the home page and swipe the page to the left, then, then please click on ''management'' under the ''Customized Scenario Cleaning''<br />
<img alt="image (20)" src="https://ecovacs2020.file.force.com/file-asset-public/image_20?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (20)" /><br />
<img alt="image (21)" src="https://ecovacs2020.file.force.com/file-asset-public/image_21?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (21)" /><br />
2. Please click on ''+'' and add the new customized scenario cleaning, then save it.<br />
<img alt="image (22)" src="https://ecovacs2020.file.force.com/file-asset-public/image_22?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (22)" /><br />
3. Then, please go back to the home page, swipe the home page from the bottom, and please click on the Schedule Cleaning setting.<br />
<img alt="image (23)" src="https://ecovacs2020.file.force.com/file-asset-public/image_23?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (23)" /><br />
<img alt="image (24)" src="https://ecovacs2020.file.force.com/file-asset-public/image_24?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (24)" /><br />
4. Then, please add a new schedule under ''Customize'', select the cleaning scenario, and save it.<br />
<img alt="image (25)" src="https://ecovacs2020.file.force.com/file-asset-public/image_25?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (25)" /></body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NapVEAS', 'AMR Email Templates', 'T20 Omni: How to set up carpet cleaning strategy', 'T20 Omni: 地毯清洁策略', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ul>
	<li>Please adjust the auto page to move upwards.</li>
</ul>
<img alt="download_image (4)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_4?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 222.984px; height: 458.953px;" title="download_image (4)" />
<ul>
	<li>Please choose the option "Carpet Cleaning Strategy."</li>
</ul>
<img alt="download_image (5)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_5?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 222.984px; height: 458.953px;" title="download_image (5)" />
<ul>
	<li>Please reopen the "Auto" function to allow the machine to lift the mopping plate when passing over the carpet, or alternatively select "Bypass" for the machine to pass over the carpet without mopping.</li>
</ul>
<img alt="download_image (6)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_6?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 231px; height: 461.953px;" title="download_image (6)" /></body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NbC5EAK', 'AMR Email Templates', 'T20 Omni: Mop Plate Drop Issue', 'T20 Omni: 抹布支架掉', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Verify Mopping Plate Installation
<ul>
	<li>Ensure the mopping plate is properly installed by listening for an audible "click" sound when attaching it.</li>
</ul>
2. Inspect Mopping Plate Condition

<ul>
	<li>Check if the mopping plate is free from damage or excessive wear.</li>
</ul>
<img alt="image (29)" src="https://ecovacs2020.file.force.com/file-asset-public/image_29?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (29)" /><br />
<br />
3. Troubleshoot by Swapping Plates
<ul>
	<li>If the issue continues,&nbsp;try swapping the mopping plate with the opposite side’s plate to see if the problem persists.</li>
</ul>
</body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NejSEAS', 'AMR Email Templates', 'W1 Pro: No water seepage', 'W1 Pro: 不出水', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ul>
	<li>Gently clean both sides of the water holes using a cotton swab to remove any potential blockages. If needed, carefully use a fine needle to clear the water seepage holes at the rear nozzle.</li>
</ul>
<img alt="image (32)" src="https://ecovacs2020.file.force.com/file-asset-public/image_321?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (32)" /><br />
&nbsp;
<ul>
	<li>Restart the machine.</li>
	<li>After that, please manually control the robot in the app to check if it can spray water.</li>
</ul>
<img alt="image (33)" src="https://ecovacs2020.file.force.com/file-asset-public/image_331?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (33)" /></body>
</html>', 'Alex. W', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NgJpEAK', 'AMR Email Templates', 'X2 - Incomplete Cleaning', 'X2 漏扫', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please kindly run the machine in AUTO mode throughout the entire house.<br />
&nbsp;***Running the machine in AUTO mode will allow it to update the map and refresh the data.<br />
<br />
2. After updating the map data, please rerun the machine using the Area cleaning mode to see if the issue still persists.<br />
If the problem is resolved, please go to Map Management and back up the current map. If the issue occurs again in the future, you can simply tap the "Restore" button to recover the optimal version.<br />
<img alt="X2 Incomplete Cleaning" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Incomplete_Cleaning?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Incomplete Cleaning" /><br />
<br />
3. If the issue continues, please delete the current map and remap your home environment.<br />
<br />
4. Should the problem remain after remapping, we suggest resetting the unit.<br />
<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NgmrEAC', 'AMR Email Templates', 'X2 - Poor Suction Power', 'X2 吸力小 / 不足', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Increase the suction power via the ECOVACS Home App, or try increasing the number of cleaning cycles.<br />
<img alt="X2 Low Suction 1" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Low_Suction_1?oid=00D2x000005pVxV" style="max-width: 708.214px; width: 272.988px; height: 590.684px;" title="X2 Low Suction 1" /><br />
<img alt="X2 Low Suction 2" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Low_Suction_2?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Low Suction 2" /><br />
<br />
2. Check for blockages – the suction intake might be clogged, or the Main Brush/Side Brushes could be tangled with hair or debris. Regular maintenance helps ensure optimal performance. Here’s what you can do:<br />
&nbsp; - Power off the machine.<br />
&nbsp; - Remove the dust bin, empty it completely, and reinstall it securely.<br />
&nbsp; - Turn the DEEBOT upside down, remove the Main Brush Cover, and take out the Main Brush.<br />
&nbsp; - Use the Multi-Function Cleaning Tool to cut and remove any hair or debris tangled around the brush, then reinstall it.<br />
&nbsp; - Remove the Side Brushes, wipe them and their mounting slots with a dry cloth, and reinstall them.<br />
<br />
3. Please refer to the image of the Main Brush Cover for guidance.<br />
<img alt="X2 Low Suction 3" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Low_Suction_3?oid=00D2x000005pVxV" style="max-width: 708.214px; width: 375.996px; height: 598.984px;" title="X2 Low Suction 3" /><br />
<br />
If the machine is missing areas during cleaning, please check the following:<br />
- Same area missed repeatedly:<br />
&nbsp; - Confirm whether any thresholds or steps in the area exceed 2cm in height. The DEEBOT may not be able to cross over them.<br />
- Different areas missed:<br />
&nbsp; - Try not to follow the robot while it’s cleaning, as it could interfere with its navigation.<br />
&nbsp; - If the space has many obstacles or clutter, it may help to tidy up beforehand. You can also reduce sensitivity by turning off the AIVI™ 3D function in the ECOVACS Home App:<br />
&nbsp; - Go to Settings &gt; Intelligence Settings and toggle off AIVI 3D.<br />
<img alt="X2 Low Suction 4" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Low_Suction_4?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Low Suction 4" /><br />
<img alt="X2 Low Suction 5" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Low_Suction_5?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Low Suction 5" /><br />
<img alt="X2 Low Suction 6" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Low_Suction_6?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Low Suction 6" /><br />
<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242030)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Nh6DEAS', 'AMR Email Templates', 'X2 - Connect to WiFi', 'X2 联网步骤', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>Before </strong>starting the connection process, please make sure of the following:<br />
- Bluetooth is enabled on your phone<br />
- Location/GPS access has been granted to the ECOVACS app<br />
- The app is updated to the latest version<br />
- Your Wi-Fi is on a 2.4GHz network (DEEBOT does not support 5GHz)<br />
<br />
<strong>Connection Steps:</strong><br />
1. In the app, select “Scan to Connect.”<br />
<br />
2. Double-check that your Wi-Fi network is set to 2.4GHz.<br />
<img alt="X2 Wifi 1" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Wifi_1?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Wifi 1" /><br />
<br />
3. Please ensure your Wi-Fi password is entered correctly. We recommend using a simple combination of letters and numbers—avoid special characters like underscores (_) as DEEBOT may have trouble recognizing them.<br />
<br />
4. Make sure your DEEBOT’s power switch is turned to the "I" position.<br />
<img alt="X2 Wifi 2" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Wifi_2?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Wifi 2" /><br />
<img alt="X2 Wifi 3" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Wifi_3?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Wifi 3" /><br />
<br />
5. Press the reset button briefly for one second. You should hear the voice prompt: "Bluetooth hotspot has been released."<br />
<img alt="X2 Wifi 4" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Wifi_4?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Wifi 4" /><br />
<img alt="X2 Wifi 5" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Wifi_5?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Wifi 5" /><br />
<img alt="X2 Wifi 6" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Wifi_6?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Wifi 6" /><br />
<br />
6. On your phone, connect to the Wi-Fi signal “ecovacs-xxxx” broadcast by your DEEBOT.<br />
<br />
7. After connecting, you should hear: “DEEBOT is connected with the mobile phone. Please wait for the distribution network result in the app.”<br />
<br />
&nbsp;(Some Android phones may skip this step.)<br />
⚠️ Important: Please switch back to the ECOVACS app right after hearing the prompt. If you exit or minimize the app, the connection may fail, and you’ll need to start over from Step 2.<br />
📶 Reminder: If you’re using a dual-band router, please ensure your phone connects only to the 2.4GHz network. You may need to temporarily disable the 5GHz band in your router settings if it interferes with the connection.<br />
<img alt="X2 Wifi 7" src="https://ecovacs2020.file.force.com/file-asset-public/X2_Wifi_7?oid=00D2x000005pVxV" style="max-width: 708.2138671875px" title="X2 Wifi 7" /><br />
<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NharEAC', 'AMR Email Templates', 'GOAT: Charging base has been moved error', 'GOAT: 基站被移动错误', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Has the GOAT been moved or dragged manually? If so, it may not be able to resume tasks properly until it is relocated.<br />
2. Is the GOAT outside of the charging station when the task is triggered? Please note that it may take some time for the GOAT to locate itself, during which its position may not appear on the app.<br />
3. If the GOAT is operating in an area with a weak or no RTK signal (e.g., shaded areas), it will rely on the visual sensor for positioning. This may result in slight positional deviations.<br />
<br />
If the above scenarios do not apply, please check the following:
<ul>
	<li>Ensure the camera on the GOAT is clean and unobstructed.</li>
	<li>Verify that the RTK signal is stable and functioning properly.</li>
	<li>Confirm that the weather conditions are clear, as poor weather may affect positioning.</li>
</ul>
If the GOAT continues to trigger alarms, you may try deleting and rebuilding the map to recalibrate its location<br />
&nbsp;<br />
Please go to the Map Edit section in the app to reset the map. This will delete the current map and allow you to create a new one. For detailed mapping guidance, please refer to the video below:<br />
<a href="https://www.youtube.com/watch?v=0xGgShOnPf0&amp;feature=youtu.be">https://www.youtube.com/watch?v=0xGgShOnPf0&amp;feature=youtu.be</a><br />
<br />
<img alt="download_image (7)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_7?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (7)" /><br />
<br />
If the problem persists, please try resetting the machine. Please note that resetting will delete all data, including saved maps. After the reset, the GOAT will go offline and will require network setup to restore online functionality.<br />
<br />
How to reset your GOAT:
<ol>
	<li>Simultaneously press and hold the START and CHARGE buttons on the GOAT for 5 seconds until the display shows the PIN code input interface.</li>
	<li>When the countdown ends, enter the PIN code and click OK to confirm. Please wait while the machine clears its memory. The GOAT will automatically restart and display the PIN reset interface, indicating the reset was successful.</li>
</ol>
</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Ni3tEAC', 'AMR Email Templates', 'GOAT: RTK station flashing blue', 'GOAT: RTK基站闪蓝灯', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Why is the RTK Reference Station light flashing?<br />
<br />
The flashing indicator on your RTK Reference Station typically indicates that the GPS signal is weak or unavailable.<br />
<br />
1. Check for Obstructions
<ul>
	<li>The RTK Reference Station relies on GNSS/GPS signals to transmit to the host for positioning.</li>
	<li>The flashing light usually indicates poor GPS signal reception. Please check if the RTK Reference Station is blocked by obstacles like houses, trees, or other objects that could create signal interference.</li>
</ul>
2. Power Cycle the RTK Reference Station

<ul>
	<li>If there are no apparent obstructions and the flashing persists, we recommend powering off the RTK Reference Station, waiting for a moment, and then turning it back on to reset the system.</li>
</ul>
<br />
3. Optimal Installation Location
<ul>
	<li>Open and Unobstructed Area: The RTK Reference Station should be placed in an open space with as few obstructions as possible.</li>
	<li>Install on High Ground: Consider installing the RTK Reference Station on a roof or other elevated location to improve signal reception. Ensure that there are no obstructions around the station.</li>
</ul>
Additional Tips for RTK Reference Station Installation:<br />
1. Wall Mount
<ul>
	<li>If you prefer mounting the RTK Reference Station, you can purchase the official wall mount from our website:&nbsp;<a href="https://www.ecovacs.com/us/deebot-winbot-accessories/goat-rtk-wall-mount">Wall Mount for ECOVACS GOAT O1000 RTK/A2500 RTK</a></li>
</ul>
2. Relocating the RTK Reference Station

<ul>
	<li>You can adjust the location of the RTK Reference Station before you create the map.</li>
	<li>Important: Changing the station''s location after creating a map will cause positioning errors, requiring you to remap the area.</li>
</ul>
3. Installation Guidelines

<ul>
	<li>Avoid Walls and Large Trees: Place the RTK Reference Station at least 2 meters away from walls, large trees, and other objects that may block the signal.</li>
	<li>No Overhead Obstructions: Ensure there are no structures or shadows above the RTK base station.</li>
	<li>Good Signal Indicator: The RTK Reference Station should show a steady light after 1 minute of powering on, indicating a stable signal.</li>
</ul>
4. Installing in Plants

<ul>
	<li>If you choose to place the RTK Reference Station near plants, ensure the grass or plants are no taller than 1.2 meters. Regularly trim any tall or winding plants that could interfere with the signal.</li>
	<li>Confirm the signal by checking if the indicator light stays steady after 1 minute.</li>
</ul>
<br />
5. Avoid Invisible or Hidden Locations
<ul>
	<li>The RTK Reference Station should not be installed in hidden or enclosed spaces. Avoid installing it in locations where buildings or other obstructions will block the signal.</li>
</ul>
</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NiThEAK', 'AMR Email Templates', 'GOAT: RTK Not Finding Enough Satellites', 'GOAT: 无法搜索到足够的', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for contacting Ecovacs Robotics.<br />
&nbsp;<br />
If you''re experiencing issues with satellite connectivity on your <strong>GOAT O1000RTK / GOAT A2500RTK</strong>, please follow the steps below to resolve the issue:<br />
&nbsp;<br />
<strong>Step 1: Ensure the Latest Firmware is Installed</strong><br />
To begin troubleshooting, make sure both your GOAT mower and RTK base station have the latest firmware. Firmware updates can often improve signal reception and RTK performance.<br />
&nbsp;<br />
<strong>How to Check:</strong>
<ul>
	<li>Navigate to<strong> Settings &gt; Robot/RTK &gt; Upgrade</strong> to check if a firmware update is available.</li>
	<li>Follow the prompts to install any updates.</li>
</ul>
<br />
<strong>Step 2: Power Cycle the RTK Base Station</strong>

<ul>
	<li>Turn off the RTK base station for a few minutes, then power it back on.</li>
	<li>This simple reset can help resolve temporary satellite connectivity issues.</li>
</ul>
<br />
<strong>Step 3: Ensure Proper Placement of RTK Base Station and Charging Station</strong>

<ul>
	<li><strong>Open Area:</strong> Ensure both the RTK base station and the GOAT''s charging station are placed in a clear, open area, free from obstructions such as buildings, trees, or overhead structures that could block satellite signals.</li>
	<li><strong>Minimum Distance: </strong>The RTK base station should be placed at least 2 meters away from walls, large trees, or any other structures that may interfere with the signal.</li>
	<li><strong>Clear Line of Sight: </strong>The RTK base station requires an unobstructed line of sight to the sky to receive satellite signals effectively. If there are nearby obstructions (e.g., buildings or trees), these can block the signal. Relocate the RTK base station to a more open area for optimal signal reception.</li>
</ul>
<br />
<strong>If the Issue Persists:</strong><br />
Please provide the following details to help us further assist you:
<ol>
	<li>GOAT''s current <strong>firmware </strong>version (found in Settings &gt; Robot &gt; Upgrade)</li>
	<li><strong>GOAT''s serial number</strong> (located at the rear of the GOAT next to the QR code or at the bottom of the mower)</li>
	<li>A <strong>screenshot </strong>of any <strong>problem </strong>or <strong>alarm </strong>notification sent by the GOAT through the Ecovacs Home App</li>
	<li>A digital copy or screenshot of your <strong>proof of purchase</strong>, including order number, purchase date, purchase channel, and model details.</li>
</ol>
Should you require any further assistance, please don''t hesitate to contact us.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NiruEAC', 'AMR Email Templates', 'GOAT: Different mowing mode explained', '不同割草模式', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Auto Mode</strong><br />
This mode allows for whole lawn mowing using the existing complete map with continuous mowing.
<ul>
	<li>Under normal conditions, the GOAT will automatically recharge when the battery level drops below 15% and will resume mowing after it reaches 85%.</li>
	<li>Recommended: For optimal mowing, the grass height should be less than 12cm.</li>
</ul>
<strong>2. Area Mode</strong><br />
This mode allows you to select a specific zone from the existing map to mow.
<ul>
	<li>You can start mowing only within the designated zone.</li>
</ul>
<strong>3. Edge Mode</strong><br />
When activated, the GOAT will focus solely on trimming/cutting the edges of your lawn.
<ul>
	<li>Edge Mode Settings can be found in Settings &gt; Robot &gt; Mowing Settings &gt; Edge Mode.</li>
</ul>
<img alt="image (30)" src="https://ecovacs2020.file.force.com/file-asset-public/image_30?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (30)" /><br />
<br />
<strong>4. Manual Mode</strong><br />
You will manually control the GOAT when the mowing task starts, using the remote control panel.
<ul>
	<li>Options include activating/deactivating the blade-disc and adjusting the mowing height.</li>
	<li>Safety Note: During manual control, please stay within 3 meters of the robot to avoid accidents.</li>
</ul>
<br />
<strong>5. Enhance Mode</strong><br />
Designed for grass heights between 10cm and 15cm, this mode will adjust obstacle avoidance to 25cm.
<ul>
	<li>We recommend setting No-Entry Zones or physical barriers to block any dangerous areas.</li>
</ul>
</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NjKvEAK', 'AMR Email Templates', 'Winbot series: Leaving dirty water streaks', '窗宝越擦越脏', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Streaks on window glass can be caused by various factors, including mineral deposits, cleaning agent residue, and excess water from the cloth. To minimize streaking, we recommend the following:<br />
<br />
1. <strong>Pre-remove dust and impurities</strong> from the glass surface before cleaning.<br />
2. <strong>Wring out the cloth</strong> after wetting it to avoid excess moisture.<br />
3. Use the<strong> recommended Ecovacs WINBOT Cleaning Solution</strong> to reduce residue.<br />
4. For windows cleaned infrequently (e.g., quarterly or longer), be sure to <strong>wash the cloth regularly</strong> and wipe the window multiple times to achieve optimal cleaning and avoid watermarks.<br />
We are continuously researching advanced cleaning technologies to address this issue more effectively. Your feedback is valuable to us, and we appreciate your understanding and support.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NjWDEA0', 'AMR Email Templates', 'W1 Pro: Insufficient suction power', 'W1 Pro: 吸力不足', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>Step I: Take down the robot.</strong><br />
<br />
Use the App to control and guide the robot to a position where it can be manually taken down. Attach the robot to the glass again to start working. If you are using the robot without having connected to the app, you can connect in the following two ways:<br />
<br />
1. It''s recommended to use the App to scan the QR code directly on the robot and follow the connection instructions in the App.<br />
2. You can also select Add manually in the app and select the correct model to complete the connection.<br />
&nbsp;<br />
<strong>Step II: Check the robot and windows.</strong><br />
<br />
1. Check whether the mopping pad is properly fitted, with the wide and narrow sides in the correct position.<br />
2. Check whether there are any gaps in the window. Do not use WINBOT on surfaces with gaps, as they may lead to Insufficient suction power or failure.<br />
3. Check whether there are low obstacles on the window. If so, please cover them before using WINBOT.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NkAXEA0', 'AMR Email Templates', 'W1 Pro: Charging issue', 'W1 Pro: 充电问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Check the power connections – Ensure the power cords are securely connected and free from physical damage.<br />
<img alt="image (31)" src="https://ecovacs2020.file.force.com/file-asset-public/image_311?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (31)" /><br />
2. Verify the main switch position – Confirm that the main power switch is in the <strong>"I" (ON) position.</strong><br />
3. Test the power outlet – Check whether the current outlet is functioning properly.<br />
4. Try a different outlet, then leave the machine plugged in for 30 minutes. If the current outlet is not working, please connect the device to another outlet and test again.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Nl3NEAS', 'AMR Email Templates', 'X11 Series: Side brush Lifting Inconsistency', 'X11 Series: 边刷抬升异常(时抬时不抬)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>Why does the side brush sometimes lift up and sometimes not during cleaning?&nbsp;</strong><br />
<br />
Here''s a breakdown of why it happens and the logic behind it:
<ol>
	<li><strong>In Mopping-Only &amp; AI Stain Detection Modes:</strong> The brush retracts to avoid spreading wet debris or soiling the side brush itself while the robot is focused on mopping.</li>
	<li><strong>When Crossing Linear Obstacles: </strong>Upon detecting cables, cords, or other linear shapes, it lifts to prevent tangling and becoming stuck.</li>
	<li><strong>During Large Debris Cleaning (Zig-Zag Pattern): </strong>When the robot identifies concentrated large debris and enters a specialized zig-zag cleaning pattern (e.g., "Particulate Removal" mode), the brush lifts to prevent scattering the debris instead of collecting it.</li>
	<li><strong>During Non-Cleaning Navigation: </strong>The brush remains raised during patrol, quick mapping, relocating, crossing areas, returning to the wash, or returning to the charge to minimize wear and avoid obstacles.</li>
</ol>
<strong>Situations Where the Side Brush LOWERS:</strong>

<ul>
	<li>Standard Edge Cleaning: The side brush remains lowered and spins when cleaning hard floors to effectively sweep debris from edges and corners into the path of the main suction inlet.</li>
</ul>
<em><strong>Note: </strong>The primary function of the side brush is to assist in edge cleaning on hard floors. Its intelligent lifting mechanism ensures it only operates when beneficial, thereby enhancing efficiency and preventing potential issues.</em></body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NloAEAS', 'AMR Email Templates', 'X11 Series: Firmware Upgrade Failure', 'X11 Series: 固件升级失败', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We are sorry to hear that your X11 Series Deebot is experiencing a firmware upgrade failure. Please be assured that we are here to guide you through the resolution process.<br />
<br />
<strong>1. Initial Setup Stage - Firmware Upgrade Failed:<br />
(1) Ensure Stable Network &amp; Positioning:</strong>
<ul>
	<li>Ensure the robot is within close range of your Wi-Fi router and that your home network is stable.</li>
	<li>Place the robot correctly on the charging base, ensuring the charging contacts are aligned. The robot must be in a charging state for the update.</li>
</ul>
<strong>2. Confirm Charging Status or Ensure Battery is Sufficient:</strong>

<ul>
	<li>A slowly flashing white light on the three indicators (the Y symbol) confirms the robot is actively charging. You will also hear the "Start charging" voice prompt. (The robot must be at the base under charging status in order to proceed with the firmware upgrade)</li>
</ul>
<strong>Preparation: </strong>Please ensure the battery is above <strong>50%</strong>. This is crucial to ensure the firmware upgrade can proceed smoothly. If the machine is low on battery, please charge it for at least <strong>2 hours.</strong><br />
<br />
<strong>3. Mobile App Permissions:</strong>

<ul>
	<li>Please check your mobile phone''s permission settings for the <strong>Ecovacs Home app </strong>and ensure all required permissions (such as Location, Storage, and Notifications) are granted.</li>
</ul>
<strong>4. Network Connection Switch:</strong>

<ul>
	<li>Kindly disconnect your mobile phone from your Wi-Fi and switch to cellular data. Then, re-access the app and attempt the firmware update again.</li>
</ul>
<strong>5. Reinstall the Application:</strong>

<ul>
	<li>If the issue persists, please delete the Ecovacs Home app and perform a fresh installation from your app store.&nbsp;</li>
</ul>
<em><strong>PS: </strong>Once the firmware upgrade starts, allow the process to complete without interruption. A sudden disconnection or turning off the DEEBOT can cause issues with the upgrade.</em></body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Nm97EAC', 'AMR Email Templates', 'N79 - Connect to network', 'N79 联网步骤', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Step 1: Please kindly make sure the wireless network password is entered correctly. It is recommended that the password and name be set to simple letters plus numbers. (If it contains special symbols such as Chinese or underlines, it isn''t easy to be identified by DEEBOT);<br />
<br />
Step 2: Ensure the following:<br />
Please kindly note that all our products only support 2.4G Hz Wi-Fi for the network setup. If you have a dual-band router (2.4G Hz &amp; 5GHz) in your home, please kindly ignore the 5 GHz signal (if they''re separate) or set the 2.4GHz as prior before the process of connection.<br />
Check whether the APP is in the latest version.<br />
The connection does not support a VPN or a Proxy server.<br />
The connection does not support web authentication or certification.<br />
<br />
Step 3: Please click ''Scan to Connect'' and choose ''select a robot'' - Then click this search filter and enter N79.<br />
<img alt="N79 Wifi 2" src="https://ecovacs2020.file.force.com/file-asset-public/N79_Wifi_2?oid=00D2x000005pVxV" style="max-width: 1286.16px; width: 388.984px; height: 610.977px;" title="N79 Wifi 2" /><br />
<br />
Step 4: Fill in the password<br />
1. Fill in the password<br />
2. Click the "Next" button<br />
<img alt="N79 Wifi 3" src="https://ecovacs2020.file.force.com/file-asset-public/N79_Wifi_3?oid=00D2x000005pVxV" style="max-width: 1286.1552734375px" title="N79 Wifi 3" /><br />
<br />
Step 5: Setup-1<br />
<img alt="N79 Wifi 4" src="https://ecovacs2020.file.force.com/file-asset-public/N79_Wifi_4?oid=00D2x000005pVxV" style="max-width: 1286.1552734375px" title="N79 Wifi 4" /><br />
<br />
Step 6: Setup-2<br />
<img alt="N79 Wifi 5" src="https://ecovacs2020.file.force.com/file-asset-public/N79_Wifi_5?oid=00D2x000005pVxV" style="max-width: 1286.1552734375px" title="N79 Wifi 5" /><br />
<br />
Step 7: Network Settings<br />
<img alt="N79 Wifi 6" src="https://ecovacs2020.file.force.com/file-asset-public/N79_Wifi_6?oid=00D2x000005pVxV" style="max-width: 1286.16px; width: 323.984px; height: 500.957px;" title="N79 Wifi 6" /><br />
<br />
Step 8: Setup Completed<br />
<img alt="N79 Wifi 7" src="https://ecovacs2020.file.force.com/file-asset-public/N79_Wifi_7?oid=00D2x000005pVxV" style="max-width: 1286.16px; width: 322.969px; height: 483.984px;" title="N79 Wifi 7" /><br />
<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Nmp4EAC', 'AMR Email Templates', 'X11 Series: Machine walk over wooden planks noise (Knocking Sound)', 'X11 Series: 机器走木地板有木纹(敲击声)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Evaluate Floor Conditions</strong>
<ul>
	<li>Verify if the floor is uneven or made of high-resistance materials (e.g., rubber <strong>flooring</strong>).</li>
	<li>Sometimes, wooden flooring or brick flooring with small gaps may make noises when the machine walks past. (This is a normal)</li>
	<li>Note: Slight noise on uneven surfaces is normal due to the downward pressure mechanism.</li>
</ul>
<strong>2. Check for Obstructions</strong>

<ul>
	<li>Inspect the main brush and main brush cover for any debris or obstructions that might cause friction or noise, and clear them if needed.</li>
</ul>
<img alt="image (39)" src="https://ecovacs2020.file.force.com/file-asset-public/image_39?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (39)" />
<ul>
	<li>If the issue persists, try replacing the main brush cover and main brush with new ones (if available) to see if this resolves the noise.</li>
</ul>
<strong>3. Adjust Settings via App</strong>

<ul>
	<li>Please switch on the <strong>Clean Along Floor feature</strong>. Once this feature is toggled <strong>ON</strong>, you may select <strong>wood(or a suitable material)</strong> as the material for the corresponding area.</li>
	<li>&nbsp;</li>
	<li><strong>To set "Clean Along Floor":</strong></li>
	<li>Please refer to <strong>Settings</strong></li>
</ul>
<img alt="image (41)" src="https://ecovacs2020.file.force.com/file-asset-public/image_411?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (41)" />
<ul>
	<li>Please refer to Robot Advanced Settings.</li>
</ul>
<img alt="image (42)" src="https://ecovacs2020.file.force.com/file-asset-public/image_421?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (42)" />
<ul>
	<li>Please switch on Clean Along Floor. Please also refer to Settings to set the flooring pattern.</li>
</ul>
<img alt="image (43)" src="https://ecovacs2020.file.force.com/file-asset-public/image_431?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (43)" />
<ul>
	<li>You may kindly <strong>select the room</strong> of your preference, select the <strong>ideal flooring material</strong>, and set the <strong>direction </strong>of the <strong>flooring pattern</strong> accordingly.</li>
</ul>
<img alt="image (44)" src="https://ecovacs2020.file.force.com/file-asset-public/image_44?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (44)" /><br />
<strong>4. After the adjustment, please kindly feel free to test run once more to see whether the noise issue persists.&nbsp;</strong></body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NmsHEAS', 'AMR Email Templates', 'X11 Series: Firmware Update Failed During Download', 'X11 Series: 固件更新失败 - 下载中断', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">If the firmware update failed during download, for example picture below:<br />
<img alt="image (34)" src="https://ecovacs2020.file.force.com/file-asset-public/image_34?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (34)" /><br />
<br />
<strong>1. Remove and Reconnect Device:</strong>
<ul>
	<li>Please delete the robot from your Ecovacs Home app''s device list. Please refer to the button in the picture below to delete it.&nbsp;</li>
</ul>
<img alt="image (35)" src="https://ecovacs2020.file.force.com/file-asset-public/image_35?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (35)" />
<ul>
	<li>Follow the in-app instructions to reconnect and re-pair the robot to your account, then attempt the update again.</li>
</ul>
<strong>2. Connect Using a Mobile Hotspot (Network Isolation Test):<br />
<br />
&nbsp; A. Using a Mobile Hotspot for Connection.</strong><br />
&nbsp; &nbsp;You can connect the robot to a mobile phone hotspot. Once connected successfully, you can set functions in the APP, such as scheduled cleanings. Turning off the hotspot will only <strong>affect remote control</strong>, but the functions that have already been set will still work. If you need to modify functions in the APP later, you will need to reconnect to the hotspot again.<br />
<br />
<strong>&nbsp; B. How to set up the hotspot:</strong>

<ul>
	<li>Please<strong> try enabling a 2.4GHz mobile hotspot</strong> from another family member’s phone (you can turn this on in your phone settings).</li>
	<li>Use your phone to connect to the Wi-Fi signal shared by that hotspot.</li>
	<li>Then, use the same phone to connect the robot and check if the connection is successful.</li>
	<li>To make it easier, we recommend setting the hotspot name and password as a simple combination of numbers.</li>
	<li>After successfully connecting to the hotspot, you may also try changing your home Wi-Fi name and password to match the hotspot, and then test the connection again.</li>
</ul>
<strong>Reason for testing with a hotspot:</strong>

<ul>
	<li>This helps determine whether the issue is with the robot or with the home network.</li>
	<li>If the robot connects successfully to the hotspot, it means the robot itself is working fine, and the connection failure is most likely related to the home Wi-Fi network.</li>
</ul>
<strong>3. Factory reset and retry:<br />
<br />
<u>Gentle Reminder:</u></strong> Kindly be informed that performing a reset on Deebot will result in the <strong>deletion of all data, including the saved maps</strong>. Following the reset, Deebot will go offline and will require the network setup process to be redone in order to restore its online functionality.<br />
&nbsp; &nbsp;<br />
<u><strong>How to reset your Deebot:</strong></u><br />
&nbsp; To initiate a hard reset of the Deebot, press the Reset Button (a tiny wifi button near the power switch) for approximately 5 seconds. You will hear a voice prompt stating "Reset to default settings," followed by the commencement of the boot music. This indicates that the default settings have been successfully restored.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005NoinEAC', 'AMR Email Templates', 'X11 Series: Machine Edge Cleaning Working Noise', 'X11 Series: 清扫墙边异音', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Check for Obstructions</strong>
<ul>
	<li>If abnormal noise occurs in open areas, please pause the robot and end all existing tasks.&nbsp;</li>
	<li>Inspect the mopping roller for entangled hair, debris, or foreign objects.&nbsp;</li>
	<li>Clean thoroughly (<a href="https://youtu.be/5IL82Mbrwto?t=78">Roller Mop Cleaning Guide</a> )and restart the device.</li>
</ul>
<strong>2. Evaluate Floor Conditions</strong>

<ul>
	<li>Verify if the floor is uneven or made of high-resistance materials (e.g., rubber <strong>flooring</strong>).</li>
	<li>Sometimes, wooden flooring or brick flooring with gaps may make noises when the machine walks past.</li>
</ul>
<em><strong>Note</strong>: Slight noise on uneven surfaces is normal due to the downward pressure mechanism.</em><br />
<br />
<strong>3. Adjust Settings via App</strong>

<ul>
	<li>If noise persists due to contact with walls/furniture:
	<ul>
		<li>Open the<strong> Ecovacs Home app</strong>.</li>
	</ul>
	</li>
	<li>Navigate to:「<strong>Settings</strong>」.</li>
</ul>
<img alt="image (36)" src="https://ecovacs2020.file.force.com/file-asset-public/image_36?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (36)" /><br />
&nbsp; Navigate to「<strong>Robot Advanced Settings</strong>」<br />
<img alt="image (37)" src="https://ecovacs2020.file.force.com/file-asset-public/image_37?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (37)" /><br />
&nbsp; Please find「<strong>TruEdge 3.0</strong>」 → <strong>Select 「Standard」</strong><br />
<img alt="image (38)" src="https://ecovacs2020.file.force.com/file-asset-public/image_38?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (38)" />
<ul>
	<li>This maintains a small safety distance from baseboards/furniture to reduce friction sounds.</li>
</ul>
<strong>Additional Information:&nbsp;</strong><br />
The X11 series roller mopping pad uses TruEdge Adaptive Technology, which allows the module to automatically retract and extend based on proximity to edges/obstacles. The slight mechanical sounds during operation are normal, as the system ensures close cleaning without scratching furniture. Occasional contact with baseboards is intentional for corner cleaning. The soft-wrapped roller prevents damage to surfaces.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Nq9VEAS', 'AMR Email Templates', 'X11 Series: Abnormal Noise During Operation', 'X11 Series: 机器运行异响', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us. We understand you''re experiencing a noise issue with your robot making noises during operation, and we''re here to help.<br />
<br />
<strong>Main Brush Cover Drifting Noise (Sharp Squelchy Sound)</strong><br />
1. Conduct a test run without the main brush and main brush cover to see if the knocking sound persists. This will help determine whether the noise is related to these parts.&nbsp;<br />
<br />
2. Please kindly remove the main brush and its cover. Please ensure there are no entanglements around the main brush cover and main brush area. &nbsp;<br />
<img alt="image (45)" src="https://ecovacs2020.file.force.com/file-asset-public/image_45?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 634.969px; height: 418.992px;" title="image (45)" /><br />
<br />
3. Please kindly clear the Comb Teeth and the latching of the main brush.<br />
<img alt="image (46)" src="https://ecovacs2020.file.force.com/file-asset-public/image_46?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (46)" /><br />
<br />
4. Then, please kindly reinstall the main brush cover properly, ensure it is aligned with the slot， and press down on both sides.<br />
<img alt="image (47)" src="https://ecovacs2020.file.force.com/file-asset-public/image_47?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 640.992px; height: 523.969px;" title="image (47)" /><br />
<br />
5. Please gently pull the main brush compartment by the cover to ensure the main brush cover is well installed.<br />
<img alt="image (48)" src="https://ecovacs2020.file.force.com/file-asset-public/image_48?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 639.961px; height: 477px;" title="image (48)" /><br />
<br />
<strong>Here is a reference video for the main brush compartment maintenance: </strong><a href="https://youtu.be/5IL82Mbrwto?t=135​">https://youtu.be/5IL82Mbrwto?t=135​</a><br />
<br />
6. Once we clear out the main brush compartment and ensure proper installation of the main brush cover, please kindly test-run the robot to see whether the noise persists. If it does, please kindly let us know and provide us with a short video indicating the sound.&nbsp;<strong>​​​​​​</strong></body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005OLMzEAO', 'AMR Email Templates', 'Complaint - Too Many Besender Auto Emails', '用户不满Besender的自动邮件造成困扰', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We sincerely apologize for the multiple emails you received recently.&nbsp;<br />
<br />
This was caused by a technical issue during a system upgrade and has now been fully resolved. Please rest assured that no further unexpected emails will be sent.<br />
<br />
We appreciate your understanding and thank you for your patience.<br />
<br />
If you have any questions, please don''t hesitate to reach out to our friendly support team at support.us@ecovacs.com.<br />
<br />
Thank you!</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ORgwEAG', 'AMR Email Templates', 'No Warranty - Not Authorized Seller', '非授权渠道购入地宝，不享质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for sharing your concerns with us.<br />
<br />
As per our policy, we provide a <strong>1-year warranty</strong> for <strong>new </strong>ECOVACS <strong>Deebots </strong>purchased through <strong>authorized </strong>resellers. Based on the proof of purchase you provided, your <strong>Deebot </strong>was purchased from a <strong>non-authorized</strong> channel, which unfortunately does<strong> not qualify for warranty coverage</strong>.<br />
<br />
We recommend contacting the <strong>original seller</strong> directly to explore available service options.<br />
<br />
We appreciate your understanding, and should we have the opportunity to assist you in the future, we look forward to it.<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Ov8jEAC', 'AMR Email Templates', 'Household Use Only', '家用机器人 - 不能商用', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">The Ecovacs device you are inquiring about is designed for <strong>household use only</strong> and is intended for<strong> indoor use only</strong>. It should <strong>not </strong>be used in outdoor, commercial, or industrial environments.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005QEpFEAW', 'AMR Email Templates', 'Other Region Inquiry - India', '印度用户咨询', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Kindly be informed that you are currently connected with the North American support team. Our services are tailored specifically for handling product and warranty inquiries within the USA and Canada. Should you require assistance outside of this region, we recommend reaching out directly to your local support team, as they are better positioned to assist you with your query.<br />
<br />
Below, you''ll find the contact information for support in <strong>India</strong>:<br />
<br />
<a href="mailto:info@ecovacsindia.in?subject=%20%20&amp;body=">info@ecovacsindia.in</a></p>

<p><a href="mailto:customerservice.in@ecovacs.com?subject=Service%20Requirement%20to%20Ecovacs&amp;body=%20-------------------------------------For%20quality%20assurance%20purposes,%20please%20kindly%20provide%20us%20with-Your%20full%20name:-Email%20address:-Phone%20number:-Proof%20of%20purchase%20(attach%20photo)-Model%20of%20the%20device:-SN%20of%20the%20device:#%20If%20your%20inquiry%20is%20related%20to%20product%20failure%20or%20use%20question,%20in%20order%20to%20better%20investigate%20the%20issue,%20it%20would%20be%20highly%20appreciated%20if%20you%20could%20send%20us%20any%20relevant%20videos%20or%20screenshots%20that%20indicate%20the%20issue.">customerservice.in@ecovacs.com</a><br />
<br />
1800 258 8085<br />
Mon-Sat, 10 am - 6 pm<br />
<br />
Your understanding is greatly appreciated. Please feel free to let us know if you need any further assistance from our team.</p>
</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005QLQvEAO', 'AMR Email Templates', 'No Special Service - Customer has extended warranty', '用户不符合18-24个月服务条件，但买了延保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We would like to clarify that your machine, <strong>[Model Number]</strong>, was purchased from <strong>[Seller]</strong> on <strong>[Purchase Date]</strong>, which unfortunately falls outside the <strong>1-year manufacturer warranty period</strong>. As much as we would like to offer further support, your machine is no longer eligible for warranty coverage.<br />
<br />
However, we understand that you purchased an <strong>extended warranty </strong>from <strong>[Warranty Provider]</strong>. We recommend reaching out to them through the <strong>original seller</strong>,<strong> [Seller Name]</strong>, to explore the available service options.<br />
<br />
As the manufacturer, <strong>ECOVACS </strong>offers a <strong>1-year limited warranty </strong>on the entire machine for new units purchased from authorized channels. Please note that this warranty period is non-extendable.<br />
<br />
We appreciate your understanding of our warranty policy, which is applied equally to all ECOVACS users. Should you need any further assistance, please feel free to contact us—one message away.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Qq05EAC', 'AMR Email Templates', 'Replacement Tracking Not Available Yet', '用户追问替换机物流', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We appreciate your continued patience.<br />
<br />
At the moment, we are still waiting for updates from the warehouse. Once the replacement tracking details become available, we will inform you promptly.<br />
<br />
Thank you for your understanding and support. Please let us know if you need any further assistance.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Qq89EAC', 'AMR Email Templates', 'Warranty Request - Ask for Customer Address', '要走质保流程，但用户没给地址 （已提供购买凭证和机器SN）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for getting back to us. We truly appreciate your effort in obtaining the proof of purchase and your continued cooperation.<br />
<br />
To proceed further, we kindly request confirmation of your shipping address and contact details. Please provide the following information:<br />
<br />
Full Name:&nbsp;<br />
Address 1:<br />
Address 2:<br />
City:<br />
State:<br />
Zip/Postal Code:<br />
Country:&nbsp;<br />
Email:&nbsp;<br />
Phone Number:&nbsp;<br />
<br />
Once we have your confirmed details, we’ll be able to move forward with your <strong>warranty replacement </strong>request.<br />
<br />
Thank you again, and we look forward to your response.<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005QqXxEAK', 'AMR Email Templates', 'X11 Cleaning Solution Container Crack', 'X11 清洁液盒开裂，甚至导致清洁液漏出', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We regret to learn that you are experiencing issues with your DEEBOT.<br />
<br />
To better understand the cause and condition of the Cleaning Solution Container and any potential leakage, could you kindly check the following details?
<ol>
	<li><strong>Provide pictures</strong> of both the regular Cleaning Solution Container (with the blue cover) and the Heavy Duty Cleaning Solution Container (with the dark cover), showing any visible surface cracks or damage.&nbsp;</li>
	<li>Confirm whether the <strong>Ecovacs DEEBOT Cleaning Solution</strong> and the <strong>Heavy Duty Cleaning Solution</strong> have been placed in the <strong>correct, designated containers</strong>:
	<ul>
		<li>Ecovacs<strong> DEEBOT Cleaning Solution</strong> should go into the container with the <strong>blue </strong>cover.&nbsp;</li>
		<li>Ecovacs <strong>Heavy Duty Cleaning Solution</strong> should go into the container with the <strong>dark </strong>cover.</li>
		<li>Please ensure that the solutions are <strong>not </strong>poured into the <strong>wrong </strong>containers and that the liquid level does <strong>not exceed </strong>the highlighted level indicated on the containers.&nbsp;<img alt="20251102-152719" src="https://ecovacs2020.file.force.com/file-asset-public/X20251102152719?oid=00D2x000005pVxV" style="max-width: 1286.16px; width: 1016.99px; height: 675.977px;" title="20251102-152719" /></li>
	</ul>
	</li>
	<li>Confirm that <strong>no other disinfectants </strong>(such as Dettol Disinfectant Liquid) have been added to the containers, as this <strong>could damage the solution tank</strong>.
	<ul>
		<li>Ecovacs-branded DEEBOT cleaning solutions are specifically formulated and will not react chemically with the MABS material (used to manufacture the solution containers), which could otherwise cause cracks or damage to the containers.</li>
	</ul>
	</li>
</ol>
<br />
We are sorry you have encountered this issue. To assist you further, please provide the following requested information, and we will do our best to resolve the matter promptly.
<ul>
	<li>Contact Information: Please include your <strong>full name</strong> (first and last), <strong>address </strong>(including the zip code and apartment/unit number if applicable), and <strong>contact number</strong>.</li>
	<li><strong>Proof of Purchase</strong>: A screenshot showing the <strong>order number</strong>,<strong> date of purchase</strong>, <strong>original seller</strong>,<strong> machine condition</strong>,<strong> </strong>and <strong>model of the device</strong>.</li>
	<li><strong>Picture of the Deebot Serial Number</strong>: Located underneath the dustbin in the vacuum, starting with E0.</li>
</ul>
<br />
Please let us know if you need any additional assistance.&nbsp;</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005QqZZEA0', 'AMR Email Templates', 'Customer Rejects Warranty - Returning Unit 1', '用户拒绝走质保，将机器退货', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We regret that your experience with our product did not meet your expectations, leading to your decision to return it. However, we&nbsp;genuinely appreciate the opportunity you gave us to serve you.<br />
<br />
Your feedback, even when it highlights areas for improvement, is important to us and will be taken into account as we continue to improve our products and customer experience.<br />
<br />
Thank you once again for choosing <strong>Ecovacs</strong>. We wish you all the best in your future endeavors.<br />
<br />
<em>Please note that we will be closing this ticket to prevent any future disturbances or confusion caused by automated system-generated emails.</em></body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005QqbBEAS', 'AMR Email Templates', 'Certified Factory Renewed Product Warranty', '授权的官方翻新机质保政策', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">The <strong>authorized factory-renewed </strong>ECOVACS product that you purchased will be free from issues in materials and workmanship when used under normal conditions for <strong>90 days</strong> from the product purchase date.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005QqePEAS', 'AMR Email Templates', 'What Is a Certified Refurbished Product?', '官方翻新机定义', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">A factory-renewed product has been tested and certified by the original manufacturer to be in perfect working order, with only minor visual imperfections (if any). The manufacturer thoroughly refurbishes the product and conducts a series of tests to ensure it meets functionality and quality standards. While the product may not come in its original retail packaging, it will be repackaged with original accessories and comes with a warranty backed by the manufacturer.<br />
<br />
For more detailed information, please feel free to visit the link below:<br />
<br />
<a href="https://www.ecovacs.com/us/support/warranty">https://www.ecovacs.com/us/support/warranty</a></body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Qqg1EAC', 'AMR Email Templates', 'App Bug - Clear Cache', '清理Ecovacs Home App缓存', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ol>
	<li>Open the app.</li>
	<li>Go to "Me" and then "Settings".</li>
	<li>Select "Clear Cache".</li>
</ol>
</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005WDbxEAG', 'AMR Email Templates', 'Deebot Drops Dust/Debris When Vacuuming', '扫地时地宝抖落灰尘', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out. In order to address the issue you’re experiencing, please follow the steps below to help us diagnose the problem more effectively:<br />
<br />
1. Power off your Deebot and uninstall the <strong>Dustbin</strong>, <strong>Main Brush</strong>, <strong>Main Brush Cover</strong>, and <strong>Suction Inlet </strong>from the device.&nbsp;<img alt="Suction Inlet" src="https://ecovacs2020.file.force.com/file-asset-public/Suction_Inlet?oid=00D2x000005pVxV" style="max-width: 669.341796875px" title="Suction Inlet" /><br />
<img alt="Dustbin Components" src="https://ecovacs2020.file.force.com/file-asset-public/Dustbin_Components?oid=00D2x000005pVxV" style="max-width: 669.341796875px" title="Dustbin Components" /><br />
<br />
2. Power on the Deebot again and ensure it’s properly connected to the Ecovacs Home App, showing itself as "<strong>online</strong>."<br />
<br />
3. On the Ecovacs Home App, tap on "<strong>Enter</strong>" and navigate to "<strong>Settings</strong>." Under "<strong>Station Advanced Settings</strong>", verify the following:
<ul>
	<li>Under <strong>Auto Empty</strong>, confirm that "<strong>High Frequency</strong>" has been selected.</li>
	<li>Check that the <strong>Dust Collection Power</strong> is set to "<strong>Standard</strong>."</li>
</ul>
<img alt="Station Advanced Settings - Auto Empty" src="https://ecovacs2020.file.force.com/file-asset-public/Station_Advanced_Settings_Auto_Emp?oid=00D2x000005pVxV" style="max-width: 669.341796875px" title="Station Advanced Settings - Auto Empty" /><br />
<br />
<em>Additionally, if possible, please record a <strong>video </strong>of the issue occurring. This will help us better identify the root cause and assist you more efficiently.</em><br />
<br />
Once these steps are completed, kindly let us know how things progress, or if you encounter any further issues.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005XIxlEAG', 'AMR Email Templates', 'Customer Rejects Warranty - Returning Unit 2', '用户拒绝走质保，将机器退货', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We regret that the situation led to your decision to return the item to the original seller for a refund.<br />
<br />
We truly hope this experience does not impact your overall perception of ECOVACS products. Your satisfaction is very important to us, and we genuinely look forward to the opportunity to serve you again in the future.<br />
<br />
Thank you for your continued support and understanding. If you have any further questions or need assistance, please don’t hesitate to contact us. We’re here to help.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005XtNpEAK', 'AMR Email Templates', 'Internal Part Request /Cannot Buy Service Part from Besender or IFixrobot', '用户想买电池、主板等内部零件; 想买的内部零件Besender/IFixrobot无货', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please note that the requested part is classified as an internal function/service part, and unfortunately, it is not available for individual sale.<br />
<br />
You will either need to wait for the part to become available through BESENDER or IFIXROBOT, or you may consider purchasing a replacement unit at your discretion.<br />
<br />
We apologize for any inconvenience this may cause. If you have any further questions or need additional assistance, please feel free to reach out.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005XtajEAC', 'AMR Email Templates', 'No Tips on Self Repair/Inspection', '不建议用户自行拆机维修或更换配件', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We regret to inform you that we are unable to provide instructions on disassembling the unit for self-inspection or repair.<br />
<br />
For your safety and to maintain the integrity of the product, we strongly recommend that any disassembly or repair be handled by a certified technician or through our official support channels.<br />
<br />
If you need assistance in getting in touch with the authorized service channels, please don’t hesitate to reach out.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z1G5EAK', 'AMR Email Templates', 'X11 Waste Water Not Drained', 'X11:基站不回收污水', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please first <strong>power off the station</strong> and the <strong>Deebot by pushing the power switch to the "O" side</strong>.&nbsp;<br />
<img alt="image (3)" src="https://ecovacs2020.file.force.com/file-asset-public/image_332?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (3)" /><br />
<img alt="image (4)" src="https://ecovacs2020.file.force.com/file-asset-public/image_432?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 537px; height: 693px;" title="image (4)" /><br />
<br />
2.<strong> Confirm that the cleaning sink (mop washing tray) is properly installed and securely in place. Once we remove the mop washing tray, please also clear the bottom area under the tray to ensure there is no debris or obstruction.&nbsp;</strong><br />
<img alt="image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_152?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (1)" /><br />
<br />
<strong>3. Ensure that the cube-shaped float is fully installed and that its magnet is still present.</strong><br />
<img alt="image (5)" src="https://ecovacs2020.file.force.com/file-asset-public/image_53?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (5)" /><br />
<br />
4. Ensure the <strong>Floating Sump</strong> is installed properly under the sockets.&nbsp;<br />
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image9?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image" /><br />
<br />
<strong>5. Check the cleaning sink for water:</strong><br />
<br />
<strong>If there is no water:</strong>
<ul>
	<li>Verify if the float is obstructed by any foreign objects. If so, clean it thoroughly.</li>
	<li>Move the float up and down. If it falls back into place naturally, it is functioning properly.</li>
</ul>
<strong>If there is water residue in the cleaning sink, follow these steps:</strong>

<ul>
	<li>Open the <strong>dirty water tank</strong> and inspect the<strong> sealing ring</strong> for any visible foreign objects. If there are any, clean and wipe the ring. If the <strong>sealing ring</strong> is clear, ensure the cover is securely closed.</li>
	<li>&nbsp;</li>
	<li>Please also consider uninstalling the sealing ring and reinstalling it to ensure it is attached properly.&nbsp;</li>
</ul>
<img alt="image (6)" src="https://ecovacs2020.file.force.com/file-asset-public/image_62?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (6)" />
<ul>
	<li>Remove the<strong> sealing plugs</strong>, rinse them, and reinstall them. Check for any foreign objects between the tanks and the station. Once cleared, replace the water tanks and<strong> press them down</strong> to ensure they are securely seated.</li>
</ul>
<img alt="image (7)" src="https://ecovacs2020.file.force.com/file-asset-public/image_72?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (7)" /><br />
<br />
6. Please ensure the <strong>overflow float ball</strong> can move up and down freely without being stuck.<br />
<img alt="image (8)" src="https://ecovacs2020.file.force.com/file-asset-public/image_82?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (8)" /><br />
<br />
7. For test running:&nbsp;
<ul>
	<li>Please open the <strong>Ecovacs Home App</strong>, go to <strong>Settings</strong>, and select <strong>Device Relocation</strong>. Then click on <strong>Auxiliary Draining</strong> and check if the water can be drained.&nbsp;</li>
	<li>If the water still<strong> cannot be drained</strong>, remove the cleaning sink, pour out any remaining water, clean the sink, and reinstall it. Ensure it is pushed all the way in to be properly seated.</li>
	<li>Switch on the station and the robot''s power switch, then return the Deebot to the station by pressing “Return to Station” on the App. Once the Deebot emits “Start Charging,” navigate to "<strong>Settings</strong>" &gt; "Device Relocation" and click on <strong>"Pipeline Check."</strong> Once the water dispensing is complete, click on <strong>"Auxiliary Draining"</strong> again to see if the issue persists.</li>
</ul>
<img alt="image (9)" src="https://ecovacs2020.file.force.com/file-asset-public/image_92?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (9)" /><br />
<img alt="image (10)" src="https://ecovacs2020.file.force.com/file-asset-public/image_102?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (10)" /><br />
<img alt="image (11)" src="https://ecovacs2020.file.force.com/file-asset-public/image_114?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 285.984px; height: 589.992px;" title="image (11)" /></body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z28wEAC', 'AMR Email Templates', 'Roller Mop - Live View/Video Manager Not Clear Enough', '滚筒类机器 - 视频管家画面模糊', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.<br />
<br />
We would like to provide clarification regarding the video quality adjustment on your Deebot.<br />
<br />
The <strong>Live View</strong> feature (formerly known as <strong>Video Manager</strong>) on your Deebot is equipped with an adaptive bitrate function, which automatically adjusts the video quality based on your real-time network bandwidth. This ensures smooth and uninterrupted playback while minimizing the impact of network fluctuations. As a result, the system automatically adjusts the output bitrate and video clarity to avoid interruptions or buffering.<br />
<br />
Please note that this adjustment process <strong>does not affect the AI recognition function or its accuracy</strong> in any way. When network conditions are stable, the system will automatically increase the video clarity. If the network signal fluctuates, the clarity will be reduced to ensure continuous video playback without interruptions.<br />
<br />
We hope this explanation helps clarify the issue. Should you require any further assistance or have additional questions, please feel free to contact us.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z2vKEAS', 'AMR Email Templates', 'What Happens if Original Model out-of-stock When Arranging Replacement', '如果质保换机时，旧机型没货怎么办', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><br />
In the unfortunate event that the warehouse finds that your original <span style="color:#c0392b;"><strong>[Model Name]</strong></span> is out of stock, we will arrange a replacement model that is either equivalent to or upgraded from your original model, based on current aftersales inventory. Our goal is to ensure that you can continue to enjoy compatible or even enhanced functionality and features to meet your cleaning needs.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z6HNEA0', 'AMR Email Templates', 'X11 Series: Charging Issue', 'X11 Series:  充电问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We''re really sorry to hear that you''re having trouble with your Deebot X11 not charging. Let''s work together to resolve this issue. Please follow the troubleshooting steps below:<br />
<br />
1. Open the top cover and confirm that the power switch on your Deebot is turned on. The switch should be <strong>set to "I" (ON) and not "O" (OFF)</strong>.&nbsp;<br />
<img alt="image (12)" src="https://ecovacs2020.file.force.com/file-asset-public/image_122?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (12)" /></p>

<p>2. Ensure the charging base is firmly plugged in and has power. After plugging it in correctly, listen for the sound of the lifting rod resetting. Then, place your Deebot correctly on the base. You should see the Deebot''s 3 indicator lights on the Y symbol flashing white slowly in and out, indicating it''s in charging status. You can also check the charging status in the app (after connecting the robot to a 2.4GHz home Wi-Fi network) to confirm if it''s charging.<br />
<img alt="image (13)" src="https://ecovacs2020.file.force.com/file-asset-public/image_132?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (13)" /><br />
<br />
3. Remove your Deebot from the base, then press and hold the Start/Pause button in the middle of the Deebot''s Y symbol for about 3 seconds to recall it to the charging base. Wait for the Deebot to announce “<strong>Wait for charging,”</strong> and ensure the Deebot''s 3 indicator lights on the Y symbol flashing white slowly in and out.<br />
<img alt="image (14)" src="https://ecovacs2020.file.force.com/file-asset-public/image_142?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (14)" /><br />
<br />
4. It''s not recommended to manually place the Deebot back on the charging base, as this could misalign the Deebot''s charging pins with the base station''s charging contacts. If charging doesn’t begin, starting a cleaning cycle could cause the Deebot to attempt repositioning, which might fail due to alignment issues.<br />
5. Check if the charging electrodes on both the Deebot and the charging base are recessed or dirty. If so, clean the electrodes and gently adjust them to ensure proper contact.<br />
<img alt="image (15)" src="https://ecovacs2020.file.force.com/file-asset-public/image_153?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (15)" /><img alt="image (16)" src="https://ecovacs2020.file.force.com/file-asset-public/image_161?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (16)" /><br />
<br />
Please follow these steps and let us know if the issue persists. If you need any further assistance, we''re more than happy to continue helping you.</p>
</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z6NpEAK', 'AMR Email Templates', 'Customer Only Provided Amazon Order #/Order Details', '告知用户我们无法查询Amazon等其他渠道的订单信息', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for providing the details.<br />
<br />
Unfortunately, we are unable to locate your <strong>Amazon </strong>order information based on the details provided. <strong>Please note that we do not have direct access to the Amazon order system</strong>.<br />
<br />
For quality assurance purposes, could you kindly provide <strong>a copy or screenshot of your proof of purchase</strong>? The document should include <strong>the purchase channel, the order supplier or seller, the order number, the date of purchase, the model of the device, and the condition of the device</strong>. This information will help us proceed with the appropriate next steps.<br />
<br />
We appreciate your understanding and cooperation. Should you have any questions or need further assistance, please feel free to reach out.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z6NrEAK', 'AMR Email Templates', 'N20 Pro Plus: No water seepage', 'N20 Pro Plus: 强拖水箱不出水', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Open the water inlet and check if there is any water inside.<br />
<img alt="download_image (11)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_111?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (11)" /><br />
<br />
2. Wipe the metal plates of the water tank and the robot with a dry cloth.<br />
<img alt="image (60)" src="https://ecovacs2020.file.force.com/file-asset-public/image_60?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (60)" /><br />
<br />
3. Wipe the water outlet.<br />
<img alt="download_image (12)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_121?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (12)" /><br />
<br />
4. Wipe the water-filling nozzle.<br />
<img alt="download_image (13)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_131?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (13)" /><br />
<br />
5. Set the water flow rate to high and run the machine.<br />
<img alt="image (61)" src="https://ecovacs2020.file.force.com/file-asset-public/image_611?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (61)" /><br />
<br />
<a href="https://www.youtube.com/watch?time_continue=18&amp;v=z0CePs0Na4c&amp;embeds_referring_euri=https%3A%2F%2Fhelp.ecovacs.com%2F">Video Reference</a></body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z6UIEA0', 'AMR Email Templates', 'X11 Series: Leaving Water Marks When/After Mopping', 'X11 Series: 留水渍', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out.&nbsp;<br />
To improve the mopping performance and reduce water marks, we recommend following these steps:<br />
<br />
<strong>1. Use Mop after Vac Cleaning Mode:</strong><br />
Start by removing dust and debris with the vacuuming mode before activating the mopping function. This ensures the mop cloth is working on a cleaner surface and can better absorb dirt and moisture, reducing water marks.<br />
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image10?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image" /><br />
<strong>2. Adjust Mopping Water Volume:</strong><br />
Increase the water volume setting for mopping. A higher water volume ensures the mop cloth has enough moisture to effectively lift dirt and stains, which should help minimize water marks on the floor.<br />
<br />
<img alt="image (21)" src="https://ecovacs2020.file.force.com/file-asset-public/image_211?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (21)" /><br />
<br />
<strong>3. Adjust Mop Cloth Re-Wash Time:</strong><br />
Set the<strong> Mop Auto-Wash Frequency to 10 minutes</strong> and <strong>Wash Method to Deep Wash.</strong> This will ensure the mop cloth is thoroughly cleaned between uses, further preventing any leftover residue or water marks.<br />
<img alt="image (22)" src="https://ecovacs2020.file.force.com/file-asset-public/image_2220902202807?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 337.969px; height: 676.969px;" title="image (22)" /><img alt="image (23)" src="https://ecovacs2020.file.force.com/file-asset-public/image_231?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 345px; height: 678px;" title="image (23)" /><br />
<br />
<strong>4. Increase Mopping Frequency:</strong><br />
If marks persist, set the mopping frequency to<strong> 2 times</strong>. This will extend cleaning time and improve coverage. Please note that if your home is large, the Deebot may need to recharge to complete the full cleaning cycle.<br />
<img alt="image (24)" src="https://ecovacs2020.file.force.com/file-asset-public/image_241?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (24)" /><br />
<br />
<em>X11 OZMO ROLLER Mopping System Features:</em><br />
<br />
<strong>Nylon Bristles for Stubborn Stains:</strong> The X11 roller features a nylon bristle ring that tackles tough stains. However, nylon doesn''t hold as much water as the common mop cloth, so you may notice faint water lines that evaporate shortly after.<br />
<img alt="image (25)" src="https://ecovacs2020.file.force.com/file-asset-public/image_251?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (25)" /><br />
<br />
<strong>Deep Cleaning for Better Results:</strong> If marks remain after evaporation, <strong>set Station advanced settings &gt; Wash Method to Deep Wash</strong> function when the Deebot returns to its base. This will clean the mop thoroughly and reduce water marks.<br />
<br />
<strong><em>Understanding Water Marks Based on Flooring Type:</em><br />
Flooring Material Affects Water Marks:</strong> Glossy tiles or wood floors tend to form larger water droplets due to their hydrophobic nature, while matte or textured floors absorb water more efficiently, reducing visible marks.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z6cLEAS', 'AMR Email Templates', 'X11 Series: How to Determine if the Charging Base is Powered On and Functioning', 'X11 Series:如何判断基站是否正常工作', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out! We''re happy to clarify the meaning behind the different indicator light statuses on your <strong>Deebot</strong>. Here''s what each light indicates:<br />
<br />
<strong>1. Slowly Flashing White (Charging):</strong><br />
When your Deebot is charging, the <strong>3 indicator light</strong>s on the Y symbol will flash <strong>white</strong>. This means the robot is currently charging its battery.<br />
<br />
<strong>2. Solid White (Working):</strong><br />
If the<strong> 3 lights are solid white</strong>, it means your Deebot is actively cleaning and working.<br />
<br />
<strong>3. Solid White (Fully Charged):</strong><br />
Once your Deebot is fully charged, the <strong>3 lights </strong>will remain<strong> solid white</strong>. After about <strong>10 minutes</strong>, the lights will go out, indicating that the battery is fully charged.<br />
<br />
<strong>4. Solid Red (Low Power):</strong><br />
3 solid red lights indicate that your Deebot''s battery is low and it needs to return to the charging base to recharge.<br />
<br />
<strong>5. Flashing Red (Deebot Fault):<br />
3 flashing red lights signal</strong> that there''s an error or malfunction with the Deebot. Please check the app for any specific error messages to help diagnose the issue.<br />
<br />
<strong>6. Flashing Orange (Station Malfunction):</strong><br />
If the <strong>3 lights are flashing orange</strong>, it means there''s an issue with the charging base itself, such as a power or connection problem. You may need to check the power supply or troubleshoot using the app.<br />
<br />
We hope this helps! If you have any further questions or need assistance, feel free to reach out, and we’ll be happy to assist you.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z6u5EAC', 'AMR Email Templates', 'X11 Series: Deebot''s Frequent Return to Base During Cleaning', 'X11 Series: 回充太频繁', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We''re sorry to hear that you are having issues with your Deebot returning to its base too often during cleaning. Let''s go over some possible reasons and solutions:<br />
<br />
1. Full Removable Dirty Water Box<br />
Frequent returns to the base may happen if Deebot''s dirty water box is full or is experiencing malfunctions. Please check the app to see if there is an issue or alarm related to the dirty water box. If necessary, follow the steps in the app to clean it thoroughly.<br />
<br />
2. <strong>The Al Strategic Cleaning of Stains Feature (found in Settings &gt; Robot advanced settings) is enabled&nbsp;</strong><br />
<br />
If you have enabled the Al Strategic Cleaning of Stains feature, it might cause the Deebot to return to the base due to complex floor textures or lighting conditions, <strong>which could lead to misidentification of stains. (You may switch the function off accordingly)</strong><br />
<img alt="image (17)" src="https://ecovacs2020.file.force.com/file-asset-public/image_171?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (17)" /><br />
<strong>3. PowerBoost Charging in Standard or Extended Runtime Mode</strong><br />
If PowerBoost Charging is enabled and set to Standard mode, the Deebot will increase its return frequency to the base when the battery drops below a safe level, to ensure it completes the cleaning task.<br />
<br />
In <strong>Extended Runtime </strong>mode, the system will adjust the return frequency automatically based on real-time cleaning conditions. This is normal behavior.<br />
<img alt="image (18)" src="https://ecovacs2020.file.force.com/file-asset-public/image_181?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (18)" /><br />
<br />
Please try these steps and let us know if the issue continues. If you need any further assistance, we''re happy to help!</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z8ZJEA0', 'AMR Email Templates', 'X11 Series: Leaving Foam Marks When/After Mopping', 'X11 Series: 留泡泡渍', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Cleaning the Mop Roller</strong>
<ul>
	<li>Double-tap the button on the top of the Deebot (when it is outside the base) to extend the roller mop.</li>
</ul>
<img alt="image (26)" src="https://ecovacs2020.file.force.com/file-asset-public/image_261?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (26)" />
<ul>
	<li>Press the release button to remove the <strong>end cover</strong> along with the roller mop rag. Rinse the mop rag thoroughly with fresh water until no visible foam remains.</li>
</ul>
<img alt="image (27)" src="https://ecovacs2020.file.force.com/file-asset-public/image_271?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (27)" />
<ul>
	<li>Remove the <strong>drip tray</strong> and clean it thoroughly to ensure there is no debris or blockage.</li>
</ul>
<img alt="image (28)" src="https://ecovacs2020.file.force.com/file-asset-public/image_281?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (28)" /><br />
<br />
<strong>2. Checking the Cleaning Solution Containers</strong>

<ul>
	<li>Verify the solution containers are not overfilled. The liquid level should remain below the round pump piece to prevent leakage or over-dispensing.</li>
</ul>
<img alt="image (29)" src="https://ecovacs2020.file.force.com/file-asset-public/image_291?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 504.961px; height: 249px;" title="image (29)" />
<ul>
	<li>Please ensure that the Ecovacs Deebot Cleaning Solution is used for the <strong>blue </strong>container, and the Ecovacs <strong>Heavy-duty</strong> Cleaning Solution is used for the <strong>dark </strong>container.</li>
	<li>If the solution is overflowing:
	<ul>
		<li>Pour excess solution back into the bottle until the level is below the round pump piece.</li>
		<li>Wipe the tank compartment inside the station to remove residual liquid.</li>
	</ul>
	</li>
</ul>
<br />
<strong>3. Post-Cleaning Validation Steps</strong><br />
Run the "Wash Mop" function 4–5 times to check if the water output becomes <strong>clearer in the Dirty Water Tank.</strong><br />
<img alt="image (30)" src="https://ecovacs2020.file.force.com/file-asset-public/image_301?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (30)" />
<ul>
	<li>If water remains soapy:
	<ul>
		<li>Refill the Clean Water Tank with fresh water.</li>
		<li>Empty the Dirty Water Tank.</li>
		<li>Repeat the washing cycle.</li>
	</ul>
	</li>
	<li>Adjust the water level setting to 20–30 and run a test cycle to confirm normal operation.</li>
</ul>
<em>Note:</em> If issues persist after these steps, ensure all components are correctly reassembled. Please let us know and<strong> provide pictures and videos</strong> for better confirmation of the issue.&nbsp;<br />
<br />
We are here to help if you need further assistance.&nbsp;</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z8sgEAC', 'AMR Email Templates', 'N30 Omni: Charging issue', 'N30 Omni: 充电问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please check if there are indicator lights on the station. Ensure the power outlet is working, and confirm that the power cord at the back of the station is securely connected. Also, make sure the rocket switch at the back of the station is set to "I."<br />
<img alt="image (50)" src="https://ecovacs2020.file.force.com/file-asset-public/image_50?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (50)" /><img alt="image (51)" src="https://ecovacs2020.file.force.com/file-asset-public/image_511?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (51)" /><br />
<br />
2. Press the Charging Station Pins to verify if they rebound smoothly.<br />
<img alt="image (52)" src="https://ecovacs2020.file.force.com/file-asset-public/image_521?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (52)" /><br />
3. Check if there are any dust or dirt particles on the Charging Dock Pins and Charging Contacts. Clean them gently with a soft cloth (make sure the robot is turned off and the Charging Dock is unplugged before maintenance).<br />
<br />
<img alt="image (53)" src="https://ecovacs2020.file.force.com/file-asset-public/image_531?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (53)" /><br />
<br />
4. Push the DEEBOT to the Charging Dock to see if it charges as expected.<br />
5. Confirm whether the outlet is functioning. If the current outlet is not working, try a different outlet.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z93xEAC', 'AMR Email Templates', 'Requested Part Out-of-stock, Need Warranty Replacement', '用户需要的服务配件售后仓无货，需要改发Replacement机器', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your continued patience as we work to fulfill your request.<br />
<br />
We''ve been informed by our warehouse that the part you requested is currently out of stock. We are actively working to confirm when it will be available again in our inventory.<br />
<br />
Please let us know if you would prefer to <strong>wait for the part to be restocked</strong>, or if you''d like to proceed with <strong>a replacement unit</strong> as an alternative solution.<br />
<br />
We look forward to your confirmation and to resolving your concerns as quickly as possible.</body>
</html>', 'Charlie G.', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z9NKEA0', 'AMR Email Templates', 'X11 Series: OZMO Roller Mopping Dry', 'X11 Series: 地宝干拖/地宝不出水（不是基站！！！）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for contacting us regarding the issue with your Deebot X11 OmniCyclone. Please follow the steps below to troubleshoot and resolve the issue of the OZMO Roller Mop appearing to mop dry.<br />
<br />
Please confirm the <strong>current </strong>cleaning mode in use. There are 2 scenarios depending on the cleaning mode we set.<br />
<br />
<strong>Scenario 1: Mop After Vac<br />
Issue:&nbsp;</strong><br />
When switching from vacuuming to mopping mid-cycle, the robot may not return to the base in time for a water refill to the Deebot''s internal water tank, leading to inadequate water seepage.<br />
<br />
<strong>Recommended Solutions:</strong>
<ul>
	<li><strong>Manually start the Mop Wash Process.</strong> Manually return the Deebot to the base station via the app for mop rinsing by starting the <strong>Mop Wash f</strong>eature - ensuring the mopping pads are moisturized accordingly during the <strong>Wash Mop</strong> Process.</li>
</ul>

<div style="margin-left: 40px;"><img alt="image (42)" src="https://ecovacs2020.file.force.com/file-asset-public/image_422?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (42)" /></div>

<ul>
	<li><strong>Resume the cleaning task </strong>to ensure proper moisture levels for effective mopping performance.</li>
</ul>
<br />
<strong>Scenario 2: Vac And Mop</strong><br />
<br />
<strong>Issue:&nbsp;</strong><br />
The machine used up all the water in the internal water tank of the robot during cleaning, and the Mop Auto Wash frequency time is not up yet, leading to the machine not refilling the internal water tank yet.&nbsp;<br />
<br />
<strong>Recommended Solutions:</strong>

<ul>
	<li><strong>Manually start the Mop Wash Process</strong>. Manually return the Deebot to the base station via the app for mop rinsing by<strong> starting the Mop Wash</strong> feature - ensuring the mopping pads are moisturized accordingly during the <strong>Wash Mop </strong>Process.</li>
</ul>

<div style="margin-left: 40px;"><img alt="image (42)" src="https://ecovacs2020.file.force.com/file-asset-public/image_423?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (42)" /></div>

<div>1.<strong> If the mop roller is wet,</strong> take these steps:</div>

<ul>
	<li>Adjust Water Level: Set the water level to the <strong>highest </strong>setting.</li>
</ul>

<div style="margin-left: 40px;"><img alt="image (43)" src="https://ecovacs2020.file.force.com/file-asset-public/image_434?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (43)" /></div>
<br />
Please go to <strong>Settings - Station Advanced Settings</strong> and adjust the <strong>Mop Auto-Wash Frequency</strong> to <strong>10 Mins</strong>

<div style="margin-left: 40px;"><img alt="image (44)" src="https://ecovacs2020.file.force.com/file-asset-public/image_441?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (44)" /><br />
&nbsp;</div>
<strong>If the mop roller is not wet after the mop wash,</strong> please let us know for further troubleshooting regarding the station <strong>water dispensing system (on the station)</strong>.</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005Z9n7EAC', 'AMR Email Templates', 'X11 Series: No Water Seepage From the Base Station', 'X11 Series: 基站不出水', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please first<strong> switch off the station</strong> and the Deebot from the<strong> power switch</strong>.<br />
<img alt="image (31)" src="https://ecovacs2020.file.force.com/file-asset-public/image_312?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (31)" /><img alt="image (4)" src="https://ecovacs2020.file.force.com/file-asset-public/image_433?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 558px; height: 720px;" title="image (4)" /><br />
<br />
2. Remove the <strong>Clean Water Tank</strong> from the OMNI Station and check the<strong> sealing ring </strong>to ensure it is in good condition and properly installed. <strong>Please kindly take it out and reinstall the sealing ring if it is not installed properly.&nbsp;</strong><br />
<img alt="image (32)" src="https://ecovacs2020.file.force.com/file-asset-public/image_322?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (32)" /><br />
<br />
3. Inspect the <strong>filter </strong>for dirt or blockages. If necessary, rinse it with water (if there is breakage, please inform us). You may kindly try taking out the pipe and taking the filter piece out for cleaning.&nbsp;<br />
<img alt="image (33)" src="https://ecovacs2020.file.force.com/file-asset-public/image_333?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (33)" /><br />
<br />
4. Please also ensure the screws are installed tightly in the tank. If not, please kindly screw the screws clockwise to tighten them.&nbsp;<br />
<img alt="image (34)" src="https://ecovacs2020.file.force.com/file-asset-public/image_341?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (34)" /><br />
<br />
5. Fill the tank with enough water and close it securely—water level should be at least slightly <strong>above </strong>the float assembly but no more than the <strong>MAX</strong> line.&nbsp;<br />
<img alt="image (35)" src="https://ecovacs2020.file.force.com/file-asset-public/image_351?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (35)" /><br />
<br />
6. Check for any foreign objects between the Clean Water Tank and the OMNI Station, and remove them if present.<br />
&nbsp;<br />
7. Ensure the Clean Water Tank<strong> sealing plug</strong> is correctly installed and fits tightly.<br />
<img alt="image (36)" src="https://ecovacs2020.file.force.com/file-asset-public/image_361?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (36)" /><br />
<br />
8. Reinstall the Clean Water Tank, making sure it is placed flat. Please firmly press the clean tank back into the base.&nbsp;<br />
<img alt="image (37)" src="https://ecovacs2020.file.force.com/file-asset-public/image_371?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (37)" /><br />
<br />
9. Please kindly clear the water refilling port to ensure proper refilling of the Deebot.&nbsp;<br />
<img alt="image (38)" src="https://ecovacs2020.file.force.com/file-asset-public/image_381?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (38)" /><br />
<br />
Meanwhile, please also check the back of the robot to ensure the sealing is in place<br />
<img alt="20251111-042102" src="https://ecovacs2020.file.force.com/file-asset-public/X20251111042102?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 595.711px; height: 333px;" title="20251111-042102" /><br />
<br />
10. Then, we may do a pipeline check to see whether the station is able to dispense water properly into the robot.&nbsp;<br />
<br />
11. Replug the station''s power switch, then return the Deebot to the station by pressing “Return to Station” on the App. Once the Deebot emits “Start Charging,” navigate to<strong> "Settings" &gt; "Device Relocation" </strong>and click on <strong>"Pipeline Check."</strong> Once the water dispensing is complete, click on <strong>"Auxiliary Draining"</strong> again to see if the issue persists.<br />
<img alt="image (39)" src="https://ecovacs2020.file.force.com/file-asset-public/image_391?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (39)" /><br />
<img alt="image (40)" src="https://ecovacs2020.file.force.com/file-asset-public/image_40?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (40)" /><br />
<img alt="image (41)" src="https://ecovacs2020.file.force.com/file-asset-public/image_412?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 287.977px; height: 594px;" title="image (41)" />
<div id="" style="left: 7.99219px; top: 4688.62px;">&nbsp;</div>
</body>
</html>', 'Alex. W', 1792029242031)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZA4sEAG', 'AMR Email Templates', 'N30 Omni: Humming noise when charging', 'N30 Omni: 充电时低沉嗡嗡声', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">The slight sound you''re hearing is a normal noise produced by the base station motor during the power-on process. It indicates that the motor is in a ready-to-work state. During this phase, the motor remains in standby mode, rather than fully sleeping, so it can immediately respond to any commands you send.<br />
<br />
<em>Please note: This sound is typically only audible in very quiet environments and may vary in volume.</em></body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZAo1EAG', 'AMR Email Templates', 'X9 Pro Omni: ARClean Anti-Tangle Side Brush Split', 'X9 Pro Omni: 边刷刷毛分叉', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We''re sorry to hear that your side brush appears to have split or splayed bristles.<br />
<br />
As a first step, we recommend carefully removing the side brush from the vacuum (please be sure to retain the side brush screw). Then,<strong> dip only the bristles</strong> of the side brush in hot water <strong>at approximately 95°C (203°F) for about 15 seconds</strong>. This brief soaking can help the bristles return to their original shape without damaging the brush.<br />
<br />
If the issue persists after this treatment, please let us know — we''ll be happy to assist you further.<br />
<br />
Thank you for your cooperation.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZB4AEAW', 'AMR Email Templates', 'X9 Pro Omni: Water droplet issue', 'X9 Pro Omni: 滚筒抹布掉水珠', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Water Droplets from the Rear End:</strong><br />
If the water droplets are coming from the rear of the Deebot, near the water inlet/water filling port, this may be due to residual water that can occasionally drip out due to inertia. This is a normal occurrence.<br />
<img alt="download_image" src="https://ecovacs2020.file.force.com/file-asset-public/download_image4?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image" /><br />
<br />
<strong>Solution:</strong> We recommend adjusting the Mop Wash Frequency to a longer time gap or selecting a different option. This will ensure the robot returns to the docking station for mop pad cleaning and water tank refills.<br />
<br />
<strong>2. Water Droplets from the Bottom of the Deebot:</strong><br />
If the droplets are coming from the bottom of the Deebot, please check the following:
<ul>
	<li>Inspect the detachable dirty water box at the rear of the robot. If it is full, please empty it.</li>
	<li>Press and hold the right charging pin at the bottom of the docking station for about 3-5 seconds, then release it to see if the rod lifts properly.</li>
</ul>
<br />
<img alt="image (48)" src="https://ecovacs2020.file.force.com/file-asset-public/image_481?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (48)" /><br />
<br />
<strong>3. Potential Cleaning Solution Leakage:</strong>

<ul>
	<li>Check the cleaning solution container to ensure it is securely installed into the inlet of the base station.</li>
	<li>If you''re unsure about the installation, please refer to the attached picture to ensure the container is properly sealed. Push the cleaning solution container all the way into the base to ensure a proper seal.</li>
</ul>
<img alt="image (49)" src="https://ecovacs2020.file.force.com/file-asset-public/image_49?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (49)" /></body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZB8zEAG', 'AMR Email Templates', 'X11 Series: OmniCyclone Dust Container Bad Smell', 'X11 Series: 基站尘桶异味', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">To address the issue of bad smells in the dust container, the following prevention and solutions are recommended:<br />
<br />
<strong>1. Clean Promptly</strong>: Ensure the dust container is cleaned regularly to avoid odors.<br />
For detailed instructions on cleaning the dust container, please watch this <em><a href="https://youtu.be/JVoStYVcWFc?t=28">Dust Container Maintenance Guide Video</a></em>.<br />
<br />
<strong>2. Address Water Puddles:</strong> If you notice small water puddles on the floor, it’s recommended to address them before mopping.<br />
<br />
<strong>3. Vacuum Before Mopping:</strong> If there is no visible water accumulation, it''s recommended to use the <strong>Mop After Vac</strong> cleaning mode. This helps prevent moisture from entering the dust container through the <strong>Auto Empty dustbin process</strong> when the Deebot docks, which could cause bad smells.<br />
<img alt="image (45)" src="https://ecovacs2020.file.force.com/file-asset-public/image_451?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (45)" /><br />
<br />
<em><strong>Note:&nbsp;<br />
Dust Container Maintenance Countdown: </strong>The dust container has a <strong>25-hour maintenance countdown clock</strong>. This is a <strong>friendly reminder</strong> and not mandatory. If an alarm is triggered but no maintenance is needed, you can reset the timer by going to</em><strong><em> Settings &gt; Maintenance &gt; Dust Container &gt; Cleaned (Reset Timer).</em></strong><br />
<br />
<img alt="image (46)" src="https://ecovacs2020.file.force.com/file-asset-public/image_461?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (46)" /><br />
<img alt="image (47)" src="https://ecovacs2020.file.force.com/file-asset-public/image_471?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (47)" /></body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZBk5EAG', 'AMR Email Templates', 'Requested Part Out-of-stock, Sending Warranty Replacement', '直接告知用户所需服务配件无货，直接发Replacement机器', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your continued patience as we work to fulfill your request.<br />
<br />
We have been informed by our warehouse that the part you requested is currently out of stock, and at this time, we are uncertain when it will be available again in our inventory.<br />
<br />
<u><strong>As an alternative solution, we will proceed with arranging a replacement unit for you.</strong></u><br />
<br />
We look forward to your confirmation and to resolving your concerns as quickly as possible.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZC9tEAG', 'AMR Email Templates', 'N30 Omni: Auto empty issue (Dust can''t be collected)', 'N30 Omni: 自动集尘问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>1.&nbsp;Confirm the Auto-Empty Frequency:<br />
Please check whether the Auto-empty frequency is set to <strong>''Auto''</strong>. If so, the robot will empty its dustbin only after a full cleaning cycle is completed.<br />
If you would like the robot to empty the dustbin every time it returns to the docking station, we recommend setting the Auto-empty frequency to<strong> ''Extra''</strong>.</p>

<p><img alt="screenshot-20251231-043615" src="https://ecovacs2020.file.force.com/file-asset-public/screenshot20251231043615?oid=00D2x000005pVxV" style="max-width: 981.01px; width: 161.989px; height: 345px;" title="screenshot-20251231-043615" /></p>

<p>2. Ensure the docking station is connected to the power source and verify that the docking station''s power cord is correctly plugged into the socket.<br />
3. Confirm that the dust collection cabin on the docking station is in place for auto-emptying.<br />
4. Make sure that the disposable dust bag is fitted properly.<br />
5. Auto-emptying will not start if Do Not Disturb mode is enabled in the settings.<br />
<br />
<img alt="download_image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_13?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 163.991px; height: 360.98px;" title="download_image (1)" /><br />
6. Auto-emptying will not initiate if you manually return the DEEBOT to the docking station.<br />
7. Use the app to prompt the docking station to auto-empty the dust bin and listen for the suction noise. If the auto-empty still does not work, please send us a screenshot of any error messages in the app.<br />
<img alt="download_image (5)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_51?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 200px; height: 437.969px;" title="download_image (5)" /></p>
</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZCJZEA4', 'AMR Email Templates', 'Part Request Submitted, Waiting for Tracking#', '告知用户需要的配件已在安排，等待物流单号中', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your patience.<br />
<br />
We would like to inform you that the requested item is currently being processed, and we are awaiting the tracking details. As soon as we receive the information, we will promptly share it with you.<br />
<br />
We appreciate your understanding. In the meantime, please don''t hesitate to reach out if you need any further assistance.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZCWTEA4', 'AMR Email Templates', 'N30 Omni: Mopping plate tangled issue', 'N30 Omni: 抹布支架缠绕报错', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Remove and Clean: Remove the mopping plates and use the multi-function cleaning tool to clean around the sockets and mopping pads.<br />
2. Reinstall Mopping Plates: Reinstall the mopping plates firmly until you hear a ''click'' sound indicating proper installation.<br />
3. Power Cycle: Power off and on the DEEBOT before restarting the cleaning process for further testing.<br />
4. Switch Sides: If the issue persists, try switching the sides of the mopping plates to see if that resolves the problem.<br />
5. Ensure the firmware version of the Deebot has been updated to the latest version.<br />
<br />
If the issue continues, please perform a hard reset of the DEEBOT.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZCjNEAW', 'AMR Email Templates', 'N30 Omni: No water seepage from clean water tank/Wastewater recycling issue', 'N30 Omni: 基站不出水/污水不循环', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Open the dirty water tank and check for foreign objects on the sealing ring. Ensure it is properly in place.&nbsp;<br />
<img alt="image (54)" src="https://ecovacs2020.file.force.com/file-asset-public/image_54?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (54)" /><img alt="image (55)" src="https://ecovacs2020.file.force.com/file-asset-public/image_55?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 334.969px; height: 378.984px;" title="image (55)" /><br />
<img alt="image (56)" src="https://ecovacs2020.file.force.com/file-asset-public/image_56?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (56)" /><br />
2. Verify that the dirty water tube is installed correctly, then close the tank tightly.<br />
<img alt="download_image (6)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_61?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (6)" /><br />
<br />
3. Remove and clean the sealing plug, then reinstall it, ensuring no foreign objects are between the tank and station.<br />
<img alt="download_image (7)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_71?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (7)" /><br />
<br />
4. Press and hold the return button to see if the dirty water drains.<br />
<img alt="image (57)" src="https://ecovacs2020.file.force.com/file-asset-public/image_57?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 473.953px; height: 291px;" title="image (57)" /><br />
5. If the water does not drain, remove the detachable tray, pour out the water, clean the filter, and reinstall the tray.<br />
<img alt="image (58)" src="https://ecovacs2020.file.force.com/file-asset-public/image_58?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (58)" /><br />
<br />
6. Disconnect and reconnect the power supply to the station. Once the robot is docked and charging, execute the self-cleaning function to see if it resolves the issue.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZDCPEA4', 'AMR Email Templates', 'N20 Pro Plus: Charging issue', 'N20 Pro Plus: 充电问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ul>
	<li>Please check if there are indicator lights on the station. Ensure the power outlet is working, and confirm that the power cord at the back of the station is securely connected. Also, make sure the rocket switch at the back of the station is set to "I."</li>
</ul>

<div style="margin-left: 40px;"><img alt="download_image (8)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_8?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 516.938px; height: 312px;" title="download_image (8)" /><img alt="download_image (9)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_9?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 518.953px; height: 267px;" title="download_image (9)" /></div>

<ul>
	<li>Press the Charging Station Pins to verify if they rebound smoothly.</li>
</ul>

<div style="margin-left: 40px;"><img alt="image (59)" src="https://ecovacs2020.file.force.com/file-asset-public/image_59?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (59)" /></div>

<ul>
	<li>Check if there are any dust or dirt particles on the Charging Dock Pins and Charging Contacts. Clean them gently with a soft cloth (make sure the robot is turned off and the Charging Dock is unplugged before maintenance).</li>
</ul>

<div style="margin-left: 40px;"><img alt="download_image (10)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_10?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (10)" /></div>

<ul>
	<li>Push the DEEBOT to the Charging Dock to see if it charges as expected.</li>
	<li>Confirm whether the outlet is functioning. If the current outlet is not working, try a different outlet.</li>
</ul>
</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZDU9EAO', 'AMR Email Templates', 'T30S: Mopping plate extension issue', 'T30S: 抹布盘无法伸展', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Vacuum-only mode:
<ul>
	<li>The mopping pad plates remain in a raised state, which is normal.</li>
</ul>
2. Mop-only mode:

<ul>
	<li>The mopping pad plates stay in a downward state and automatically rise only when encountering carpets, which is normal.</li>
</ul>
3. Vacuum &amp; Mop mode:

<ul>
	<li>The mopping pad plates remain in a downward state and rise automatically upon encountering carpets, which is normal.</li>
</ul>
4. Mop after vacuum mode:

<ul>
	<li>The mopping pad plates are raised during the first cleaning and lowered during the second cleaning. They rise automatically when encountering carpets, which is normal.</li>
</ul>
&nbsp;</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZDvZEAW', 'AMR Email Templates', 'T30S: Mopping plate droplet issue', 'T30S: 抹布盘甩水珠', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please check and ensure that the mop cloth is installed correctly.
<ul>
	<li>The mop cloth should be in close contact with the mopping plate and have a smooth surface when installed correctly. If the mop cloth is installed improperly or has wrinkles on its surface, it may result in uneven mopping. If you find any installation issues, please remove and reinstall the mop cloth.</li>
</ul>
2. Please make sure the mop cloth is clean.

<ul>
	<li>During use, the mop cloth will accumulate a large amount of dust and dirt. If it is not cleaned regularly, it may affect the mopping effect. It is recommended to clean the mop cloth regularly, based on your actual usage, to keep it clean.</li>
</ul>
3. Please use a cloth to wipe the water outlets at the bottom of the machine to prevent impurities from clogging.

<div style="margin-left: 40px;"><img alt="image (62)" src="https://ecovacs2020.file.force.com/file-asset-public/image_621?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (62)" /></div>
PS: We highly recommend using lukewarm water only, as other cleaning solutions or chemicals may block the water outlet or emitters.

<ul>
	<li>After checking that, the above conditions are fine. Kindly wash the mopping pads thoroughly and wring them out before using the mopping mode. This will prevent those streaks due to it being a drag behind the mopping system.</li>
	<li>Please set the clean times to once</li>
	<li>Please set the water flow rate to Low</li>
</ul>
<img alt="download_image" src="https://ecovacs2020.file.force.com/file-asset-public/download_image5?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image" />
<ul>
	<li>Please refer to Smart/Intelligent&nbsp;Cleaning and set the hot air drying time to 4 hours.</li>
</ul>
<img alt="download_image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/download_image_132?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="download_image (1)" /></body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ZFqvEAG', 'AMR Email Templates', 'Original Unit Out of Stock, Need Confirming Replacement Model', '用户原机型无货，让用户型号***二选一***', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your continued communication.<br />
<br />
We were recently informed by our warehouse that <strong>the original model </strong>you requested is currently <strong>out of stock </strong>in our after-sales inventory. Unfortunately, this has caused an unexpected delay in both your replacement shipment and the associated arrangements.<br />
<br />
To proceed, we would like to confirm your preference from the following replacement options:<br />
<br />
<strong>Option A:</strong> [Briefly describe Option A]<br />
<br />
<strong>Option B:</strong> [Briefly describe Option B]<br />
<br />
<br />
Once we receive your confirmation, we will proceed with the appropriate shipment and ensure you are updated throughout the process.<br />
<br />
If you need any further clarification or assistance, please don’t hesitate to reach out.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005aNCvEAM', 'AMR Email Templates', 'X1 Dummy Module Not Installed / Water Circulation Module Uninstalled', 'X1 银离子模块未安装', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>To address the issue you''re experiencing with the Docking Station, please follow the steps below to see if the error recurs:</p>

<ol>
	<li>Power off the Docking Station.</li>
	<li>Remove the Dummy Module from the back of the Docking Station.<img alt="Dummy Module X1" src="https://ecovacs2020.file.force.com/file-asset-public/Dummy_Module_X1?oid=00D2x000005pVxV" style="max-width: 669.342px; width: 359.98px; height: 296.992px;" title="Dummy Module X1" /></li>
	<li>Clean the Sensor Component gently with a dry cloth to remove any dust or debris.</li>
	<li>Reinstall the Dummy Module, ensuring it is securely inserted and tightly fastened.</li>
	<li>Power the Docking Station back on and refresh the Ecovacs Home app.</li>
	<li>Run a quick test cycle (either a room cleaning or mop wash) to check if the error persists.</li>
</ol>

<p><br />
Should the error continue after these steps, please let us know, and we will be happy to investigate further.<br />
<br />
Thank you for your attention, and we look forward to resolving this issue promptly.</p>
</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005aOCEEA2', 'AMR Email Templates', 'How Much Floor Area Can a 4L Water Tank Clean?', '清水箱的4L水可以覆盖多少清洁面积', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please note that the actual area cleaned may vary depending on the environment of each home, so we are unable to provide an exact square footage. However, you can adjust the water usage (<strong>Water Flow Rate</strong>) settings according to your specific needs to ensure optimal cleaning results for your space.<br />
<br />
Regarding the issue of insufficient clean water, please be assured that this does not indicate a malfunction of the machine. If you are away and unable to refill the tank, the device can still complete the cleaning cycle by operating in the "<strong>Forced Operation Without Water</strong>" mode (which can be enabled in<strong> Station Advanced Settings &gt; Mop Wash Settings</strong>). To ensure thorough cleaning, we recommend setting the <strong>Mop Auto-Wash Frequency</strong> to 25 minutes, which will help the machine clean the entire area effectively.<br />
<br />
If you have any further questions or need assistance, please don''t hesitate to reach out. We’re here to help!</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005d7zeEAA', 'AMR Email Templates', 'Ignore Automated System Email', '忽略系统自动邮件', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please rest assured that your case will remain open until the service is completed. Additionally, any automated reminders you receive about the service are system-generated and can be disregarded if they do not apply to your situation.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005eZc5EAE', 'AMR Email Templates', 'No Entry - Carpet Settings / Main Brush Alarm on Carpets', '地毯厚度>7mm, 建议设置No Entry或虚拟墙', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.<br />
<br />
For medium to long-pile carpets, particularly those placed at doorways or spanning across areas, we recommend setting up a <strong>Virtual Boundary</strong> – <strong>No Entry Zone</strong>.<br />
<img alt="Carpet 3" src="https://ecovacs2020.file.force.com/file-asset-public/Carpet_3?oid=00D2x000005pVxV" style="max-width: 669.341796875px" title="Carpet 3" /><br />
<br />
Alternatively, you can go to <strong>Settings &gt; Robot Advanced Settings &gt; Carpet Settings &gt; New Carpet Settings</strong>, and select <strong>No Entry</strong>.<br />
<img alt="Carpet 1" src="https://ecovacs2020.file.force.com/file-asset-public/Carpet_1?oid=00D2x000005pVxV" style="max-width: 669.341796875px" title="Carpet 1" /><br />
<img alt="Carpet 2" src="https://ecovacs2020.file.force.com/file-asset-public/Carpet_2?oid=00D2x000005pVxV" style="max-width: 669.341796875px" title="Carpet 2" /><br />
<br />
​​​​​​​Enabling this feature will allow your Deebot to navigate around the carpeted areas with care, ensuring that it avoids those zones if detected.<br />
<br />
If you have any further questions or need assistance, please don''t hesitate to reach out.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005ehOLEAY', 'AMR Email Templates', 'X2 Omni: Charging Exception', 'X2 Omni: 充电异常', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">A charging exception error means the Deebot can not connect to the station properly. In order to better identify the issue, please confirm that the following troubleshooting steps have already been done:<br />
&nbsp;<br />
1. Please kindly clean the charging pins of the Deebot and the station.<br />
<img alt="screenshot-20251115-032043" src="https://ecovacs2020.file.force.com/file-asset-public/screenshot20251115032043?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="screenshot-20251115-032043" /><br />
2. Please reinstall the bottom tray as well as the small plastic plate.<br />
<img alt="image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_182?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image (1)" /><br />
<img alt="screenshot-20251115-031925" src="https://ecovacs2020.file.force.com/file-asset-public/screenshot20251115031925?oid=00D2x000005pVxV" style="max-width: 704.774px; width: 700.969px; height: 627px;" title="screenshot-20251115-031925" /><br />
<br />
3. Please kindly reinstall the mopping plates of the Deebot.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005g6qvEAA', 'AMR Email Templates', 'Chat Notes', '', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>**Chat Notes</p>

<p>Model:</p>

<p>Customer''s Issue:</p>

<p>Resolution:</p>

<p>Issue Resolved (Y/N):</p>

<p>Additional Information:</p>
</body>
</html>', 'Dylan. Z', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005g6vlEAA', 'AMR Email Templates', 'Call Notes', '', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>**Notes**</p>

<p>Customer Name:</p>

<p>Contact number:</p>

<p>Email address:</p>

<p>Current shipping address:</p>

<p>Serial Number:</p>

<p>Deebot Model:</p>

<p>SKU:</p>

<p>Issue/s:</p>

<p>Resolution/s:</p>

<p>Date of purchase:</p>

<p>Additional information (if needed):</p>
</body>
</html>', 'Dylan. Z', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jALJEA2', 'AMR Email Templates', 'Battery Life (General)', '电池寿命（通用型号）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">All ECOVACS robotic cleaners use <strong>lithium batteries</strong>. Please note that lithium battery capacity will naturally degrade over time with regular charging and discharging. This is a normal characteristic of lithium batteries and does not indicate a product defect. Normally, after 500 times of complete recharge, its capacity can still reach 70% of its original capacity.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jBHNEA2', 'AMR Email Templates', 'Applicable Area for WINBOT', '窗宝适用区域 (通用)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>Applicable area:</strong> Dark glass, colored glass, frameless glass.<br />
<strong>Non-applicable area: </strong>Curved glass, ground glass, laminated glass, mirror surface, and glass with decals.&nbsp;<br />
If there is oil on the kitchen window, it is not recommended to use it because it will increase the risk of skidding of WINBOT.<br />
<br />
<strong>Here are the requirements for Winbot:</strong><br />
1. Winbot cannot be used on windows with less than <strong>5mm</strong> thick window frame.<br />
2. Winbot cannot be used on windows with less than <strong>5mm</strong> thick glass<br />
3. Please use the Winbot on a glass bigger than <strong>50*50cm</strong>. Please note that if you put the Winbot on around, triangle, or other types of glasses, it may not be able to clean the entire surface, especially the corners.&nbsp;<br />
4. When the device is put on a horizontal glass, please use the remote control to operate.<br />
5.<strong> Please DO NOT use the device on the ceiling.</strong><br />
6. Please don''t use the device on the outside of the window when it''s raining or snowing.<br />
7. Please don''t use the device anywhere higher than<strong> 2000m</strong><br />
8. When the device starts working, there should be someone to watch over it in case of an emergency. After the window has been cleaned, the device needs to be removed from the window.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jBdxEAE', 'AMR Email Templates', 'Winbot functions on heavy dirty windows', '窗宝在重污窗户上使用, 建议先自己清洁一遍', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Our machine is designed for daily home use (maintenance) and not designed for heavy cleaning purposes. If there is a thick layer of oil or solid debris, please kindly do a pre-cleaning first before using the Winbot, as the debris/oil may get into the motor and it might damage the machine.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jCGfEAM', 'AMR Email Templates', 'Winbot is not cleaning in the normal cleaning path (N or Z)窗宝清洁路径异常', '窗宝清洁路径异常(不走S型)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Please make sure that the place where you start the Winbot is well cleaned.<br />
2. Please clean the driving wheel belts to make sure there''s no oil around the wheel belts.<br />
3. Please ensure the bumper and the anti-drop sensor are not affected and can spring back when pressed down.<br />
4. Please install the mop again to make sure the ball sensor is NOT covered.<br />
5. Make sure the glass is NOT too dirty or oily<br />
<br />
Please kindly start the machine once more, and ensure the handle is vertical to the window for better observation.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jClJEAU', 'AMR Email Templates', 'How to use the safety rope (Winbot)', '如何使用窗宝安全绳', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Use the cleaning cloth to clean the rubber side of the safety port and the place where it is on the glass.<br />
2. When you want to use the device on the inner side of the glass, the safety rope needs to be placed on the upper corner of the inner side glass.<br />
3. When you want to use the device on the outer side of the glass, the safety port needs to be placed in the middle of the inner side glass.<br />
4. Do not put the safety port on the outer side of the glass.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jE0jEAE', 'AMR Email Templates', 'Missing Info For Warranty', '想走保仍缺信息(请删除多余部分)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>To move forward with the warranty service, we are currently <u><strong>still missing</strong></u> the information below:<br />
<br />
<span style="color:#c0392b;"><u><strong><span style="font-size:18px;">***请删除不需要的信息，或者加入实际缺失的信息***</span></strong></u></span><br />
<br />
<strong>Shipping Information</strong>: Please include your full name (first and last), address (including the zip code and apartment/unit number if applicable).<br />
<em>PS: We do <strong>not </strong>ship to<strong> P.O. boxes</strong>. Please provide a physical residential address.</em><br />
&nbsp;<br />
<strong>Address:<br />
City:<br />
Province/State:<br />
Postal/Zip Code:&nbsp;<br />
Country:&nbsp;</strong><br />
<br />
<strong>Contact Number:</strong>&nbsp;Please provide your available <strong>US/Canada</strong> phone number.&nbsp;<br />
<br />
Thank you for your prompt attention, and we shall be able to move forward once the missing information is collected.&nbsp;</p>
</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jHeXEAU', 'AMR Email Templates', 'How To Create 2nd Map(General)', '如何创建第二张地图(针对T30往后可以单搬地宝建图的型号- 截图是X11的)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>For the <strong>initial </strong>mapping:</p>

<p>1. Ensure the charging station is placed preferably<strong> in the center</strong> of the housing environment, and ensure the station has ample space in front and on its two sides.&nbsp;<br />
<img alt="screenshot-20251120-040201" class="" src="https://ecovacs2020.file.force.com/file-asset-public/screenshot20251120040201?oid=00D2x000005pVxV" style="max-width: 1380.41px; width: 698px; height: 493px;" title="screenshot-20251120-040201" /><br />
2.&nbsp;Ensure the Deebot is <strong>fully charged</strong> before starting the mapping process.&nbsp;<br />
3. Ensure <strong>AUTO Resume</strong> is switched <strong>ON</strong>.&nbsp;<em><strong>(Settings - Robot Advanced Settings - Auto Resume)</strong></em><br />
<img alt="20251120-032148" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120032148?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="20251120-032148" /><img alt="20251120-032241" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120032241?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 306px; height: 541px;" title="20251120-032241" /><img alt="20251120-032002" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120032002?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 283px; height: 421px;" title="20251120-032002" /><br />
4. Kindly ensure all doors are opened and all the scattered objects on the floor are picked up.<br />
5.&nbsp;If you have a multiple-floor house, kindly make sure the <strong>Multi-Floor Mode</strong> is turned <strong>ON</strong>. <em><strong>(Setting - Map Settings - Multi-Floor Mode)</strong></em><br />
<img alt="20251120-032148" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120032148?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 300px; height: 564px;" title="20251120-032148" /><img alt="20251120-032704" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120032704?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 281px; height: 565px;" title="20251120-032704" /><img alt="20251120-032523" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120032523?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="20251120-032523" /><br />
6. Once the settings are adjusted, we may feel free to start the mapping. Please do not walk around the Deebot while it is operating. (If we have animal friends in the house, please kindly ensure they will not interact with the robot during mapping)<br />
7. Once the map is created, you may refer to the <strong>Map </strong>function and view the existing map. If the map is ideal, you may consider<strong> backing up the current map</strong>. If the map was <strong>not ideal</strong>, please kindly <strong>delete the map and remap</strong>.&nbsp;<br />
<img alt="20251120-033333" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120033333?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="20251120-033333" /><img alt="20251120-033446" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120033446?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 283px; height: 550px;" title="20251120-033446" /><br />
<br />
<strong>To Create the Second/Third Map:</strong><br />
<em>PS: Requirements of the mapping condition should be the same as the</em><strong><em> initial map</em></strong><br />
<br />
1. Ensure the <strong>initial map</strong> was <strong>backed up</strong>.&nbsp;<br />
2. Once the initial map is backed up, please <strong>physically switch off </strong>the robot.&nbsp; Please switch the power switch to<strong> the "O" position.&nbsp; <span style="font-size:16px;"><u><em>(Kindly note that switching off the Deebot is essential in mapping another floor. Without switching the robot off, we may encounter map mess/map overlapping issues with the initial map.)</em></u></span></strong><br />
<img alt="image (64)" src="https://ecovacs2020.file.force.com/file-asset-public/image_64?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="image (64)" /><br />
It is optional to move the base station. If you wish to move the base station as well, please switch off the station power switch at the back before moving.&nbsp;<br />
<img alt="image (65)" src="https://ecovacs2020.file.force.com/file-asset-public/image_65?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="image (65)" /><br />
<br />
<strong>3.&nbsp;</strong><span style="box-sizing: border-box; margin: 0px; padding: 0px;">Relocate</span>&nbsp;to a different floor, and switch the robot back ON. <strong>If you have moved the station </strong>along with Deebot, then please switch the base station back on and <strong>push the robot back into the base in a charging position, </strong>wait for the voice prompt stating the Deebot is charging.&nbsp;<br />
<br />
4. Open the app and wait for the machine to come back online. Once the machine is online, we may start mapping the new floor from the app.&nbsp;<br />
<br />
If the machine still shows up on the initial map, please kindly refer to the Map and hit the <strong>"+" button, then we may start mapping.&nbsp;</strong><br />
<br />
<img alt="20251120-033333" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120033333?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="20251120-033333" /><img alt="20251120-034840" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120034840?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 283px; height: 550px;" title="20251120-034840" /><br />
<br />
5. Once the second map is completed, or the machine is running low on power, the Deebot will return to the original <strong>starting spot</strong> (If the charging station was not moved to the designated floor). If you have moved the base station along with the Deebot, then the Deebot will return to its charging station.&nbsp;<br />
<br />
6.&nbsp;If the map is ideal, you may consider<strong> backing up the current map</strong>. If the map was <strong>not ideal</strong>, please kindly <strong>delete the map and remap</strong>.&nbsp;<br />
<img alt="20251120-033333" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120033333?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="20251120-033333" /><img alt="20251120-033446" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120033446?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 283px; height: 550px;" title="20251120-033446" /></p>



<div id="" style="left: 8px; top: 77.3333px;">&nbsp;</div>

<div id="" style="left: 8px; top: 77.3333px;">&nbsp;</div>
</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jJtFEAU', 'AMR Email Templates', 'Forget Password (Customer did not receive verification code)', '忘记密码（客户未收到验证码）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please kindly check out the following troubleshooting steps below:<br />
<br />
1. Kindly press <strong>"Forgot Password"</strong><br />
<img alt="20251114-041900" src="https://ecovacs2020.file.force.com/file-asset-public/X20251114041900?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="20251114-041900" /><br />
2. Enter the registered email address and then press “Send” to get the verification code via email.<br />
<img alt="screenshot-20251120-043109" src="https://ecovacs2020.file.force.com/file-asset-public/screenshot20251120043109?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="screenshot-20251120-043109" /><br />
3. Confirm that the page shows the "299s" countdown and the sentence for "A verification code has been sent to the dedicated email address", see below:<br />
<img alt="inline-770329391" src="https://ecovacs2020.file.force.com/file-asset-public/inline770329391?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="inline-770329391" /><br />
<br />
4. The verification code is<strong> valid for 5 minutes only. </strong>Once&nbsp;it times out, you may need to resubmit the verification code request by pressing "Send" again. <em>(Please do not send multiple verification codes within a short time after pressing "Send" once; please wait at least 5 minutes to press once more.)</em><br />
5. Kindly check the spam/junk box as well and confirm there is no space in front of the email entry.<br />
<strong>6. You may also directly reset the password via (browser)&nbsp;</strong><a href="https://www.ecovacs.com/us/shop/recover-email">https://www.ecovacs.com/us/shop/recover-email</a></body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jNjxEAE', 'AMR Email Templates', 'Confirm Deebot Model Number', '确认地宝型号', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please put the machine upside down. There is a label at the bottom of the machine, and the second line of the label states "Model".<br />
<img alt="20251120-052158" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120052158?oid=00D2x000005pVxV" style="max-width: 1612.34296875px" title="20251120-052158" /><br />
<br />
<em>(For relatively older models, if there is a Cleaning Cloth at the bottom, you need to remove the cloth and the board on which the cloth is pasted.)</em></body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jXUnEAM', 'AMR Email Templates', 'Delete Ecovacs Account', '删除Ecovacs Home账号', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please attempt to cancel your Ecovacs account using the Ecovacs Home app by following these steps:<br />
1. Open the Ecovacs Home app and navigate to <strong>Settings</strong>.<br />
<img alt="20251120-052158" src="https://ecovacs2020.file.force.com/file-asset-public/X202511200521581?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="20251120-052158" /><br />
2. Tap <strong>Account and Security</strong>.<br />
<img alt="img_v3_02h8_03524d44-dc4a-4ce7-b476-ece84d27947g" src="https://ecovacs2020.file.force.com/file-asset-public/img_v3_02h8_03524d44dc4a4ce7b476ece?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="img_v3_02h8_03524d44-dc4a-4ce7-b476-ece84d27947g" /><br />
3. Select<strong> Cancel Account</strong>.<br />
<img alt="img_v3_02h8_fdb33261-b832-4fe8-9fc5-780c688cd1fg" src="https://ecovacs2020.file.force.com/file-asset-public/img_v3_02h8_fdb33261b8324fe89fc5780?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="img_v3_02h8_fdb33261-b832-4fe8-9fc5-780c688cd1fg" /></body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jXzREAU', 'AMR Email Templates', 'How to Register Ecovacs Home', '如何注册Ecovacs Home账号', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">You may register your Ecovacs account by downloading the <strong>ECOVACS Home app</strong><br />
<img alt="screenshot-20251120-070135" src="https://ecovacs2020.file.force.com/file-asset-public/screenshot20251120070135?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="screenshot-20251120-070135" /><br />
Once downloaded, please complete the following steps:<br />
1. Click the Register button<br />
<img alt="20251120-065927" src="https://ecovacs2020.file.force.com/file-asset-public/X20251120065927?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="20251120-065927" /><br />
2. Choose country/region<br />
3. Enter your <strong>personal email </strong>and password<br />
4. Click "<strong>Agree</strong>" to the user agreement and privacy policy.
<div id="" style="left: 7.99219px; top: 30.4922px;">&nbsp;</div>
</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jYVhEAM', 'AMR Email Templates', 'Consumable items (Reject the customer)', '耗材(拒绝客人不送耗材)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><span style="font-size:20px;"><strong><span style="color:#e74c3c;">***请删减不需要的部分***</span></strong></span><br />
<br />
We are so sorry to inform you that <span style="color:#e74c3c;"><span style="font-size:20px;"><u><strong>(xxx)</strong></u></span></span> is a consumable item that may require changing periodically, depending on the daily usage of the machine. We understand our customer may need additional replacements, and we are dedicated to providing the best solution for it. Please kindly check out the link and the coupon below:<br />
<br />
<strong>Link:</strong><span style="color:#e74c3c;"><strong> XXXXXXXXXX</strong></span><br />
<br />
<strong>Coupon Code:</strong><br />
<span style="color:#e74c3c;"><strong>D20ACC (For US Market accessories purchases)<br />
EVSCC20 (For Canada Market accessories purchases)</strong></span><br />
<br />
Thank you so much for your understanding and support.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jYlpEAE', 'AMR Email Templates', 'Webstore Order Return Request (No Reasons Provided)', '官网订单要求退款（未知晓退款理由）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We''re sorry to hear that you''ve encountered issues, and we regret any inconvenience that led to your decision.<br />
&nbsp;<br />
<br />
Before we initiate the return for a full refund, we''d love to learn more about your experience and the reasons behind your decision. Your feedback is incredibly valuable and will help us improve user experience and product development.&nbsp;However, sharing this feedback is entirely optional. If you prefer to proceed directly with the return, please provide the following details:<br />
&nbsp;<br />
<br />
<strong>Serial Number of the Deebot:</strong> Located underneath the dustbin, starting with "<strong>E0</strong>."<br />
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image11?oid=00D2x000005pVxV" style="max-width: 704.773828125px" title="image" /><br />
&nbsp;
<p><strong>Return and Exchange Policy</strong>:<br />
Orders placed through the ECOVACS US/CA Official Website are eligible for a refund or exchange within 30 days of purchase.</p>

<ul>
	<li>For returns initiated due to personal reasons (e.g., change of mind or incompatibility with your specific needs), the customer is responsible for covering the return shipping fees.</li>
	<li>For returns or exchanges resulting from product defects or other issues attributable to ECOVACS, shipping fees will be waived.</li>
</ul>

<p><br />
<i>Once we receive the requested information, our <strong>Webstore order management team</strong> will handle your request and guide you through the next steps.</i><br />
&nbsp;</p>

<p>We appreciate your patience and understanding. Please don''t hesitate to contact us if you need any additional support.</p>
</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jYvVEAU', 'AMR Email Templates', 'About Using Other Cleaning Solutions Or Chemical Liquid', '使用其他非官方的清洁溶液和化学物质', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We highly recommend using lukewarm water only, as other cleaning solutions or chemicals may block the water outlet or emitters.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005jZGTEA2', 'AMR Email Templates', 'Deebot Does not Support 5G WIFI', '机器联网不支持5G网络', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Currently, our Deebot <strong>only supports 2.4GHz WIFI </strong>due to the fact that 2.4GHz provides a more stable, wider coverage area, and better at penetrating solid objects when the Deebot is cleaning around the house to reduce the chance of being offline.&nbsp;</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005mi8jEAA', 'AMR Email Templates', 'T30S No water seepage/Waste water cannot be recycled', 'T30S系列基站不出水/污水不回收', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>1,&nbsp;<strong>Clean and Press Down Sealing Plugs:</strong>&nbsp;<br />
Remove the clean/dirty water tanks from the station and check the sealing plugs underneath. <strong>Please take out the sealing plugs as shown in the picture and rinse them with clean water.</strong><br />
After washing, reinstall them onto the station and <strong>press the seal strips on both sides firmly</strong>. Also, make sure the lids of the clean/dirty water tanks are securely closed by pressing them down to ensure proper installation.<br />
<img alt="inline-1086983737" src="https://ecovacs2020.file.force.com/file-asset-public/inline1086983737?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 358px; height: 213px;" title="inline-1086983737" /></p>

<p><img alt="inline923086931" src="https://ecovacs2020.file.force.com/file-asset-public/inline923086931?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 374px; height: 173px;" title="inline923086931" /><br />
2,&nbsp;<strong>Clean and Dry the Base &amp; Tray:&nbsp;</strong>Rinse the base and the detachable tray with clean water, and make sure they are completely dry before reinstalling them.<br />
<br />
<img alt="image (3)" src="https://ecovacs2020.file.force.com/file-asset-public/image_392?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 619px; height: 376px;" title="image (3)" /><br />
3,&nbsp;<strong>Check Water Recycling:&nbsp;</strong>&nbsp;Press and hold the station button for about 5 seconds to see if water can be dispensed normally. If it does, please wait another 20 seconds to check whether the water can be recycled properly.</p>

<p><img alt="screenshot-20251124-013000" src="https://ecovacs2020.file.force.com/file-asset-public/screenshot20251124013000?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 333px; height: 206px;" title="screenshot-20251124-013000" /><br />
&nbsp;</p>
</body>
</html>', 'Eric. L', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005nlqvEAA', 'AMR Email Templates', 'Mop washing tray malfunction/ Cleaning sink malfunction', '适用于X8/X9/X11', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Confirm that the cleaning sink (mop washing tray) is properly installed and securely in place.<br />
<img alt="f4749d65-f70e-4b9d-86e1-8d88496895cf" src="https://ecovacs2020.file.force.com/file-asset-public/f4749d65f70e4b9d86e18d88496895cf?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 457px; height: 343px;" title="f4749d65-f70e-4b9d-86e1-8d88496895cf" /><br />
2. Ensure that the cube-shaped float is fully installed and that its magnet is still present.<br />
<img alt="image (4)" src="https://ecovacs2020.file.force.com/file-asset-public/image_482?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 522px; height: 390.938px;" title="image (4)" /><img alt="0aa738b4-1700-47b4-a591-4a82497cc013" src="https://ecovacs2020.file.force.com/file-asset-public/X0aa738b4170047b4a5914a82497cc013?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 294px; height: 392px;" title="0aa738b4-1700-47b4-a591-4a82497cc013" /><br />
3. Check the cleaning sink for water:<br />
- If there is no water:<br />
&nbsp; a. Verify if the float is obstructed by any foreign objects. If so, clean it thoroughly.<br />
&nbsp; b. Move the float up and down. If it falls back into place naturally, it is functioning properly.<br />
<img alt="f85d66d8-0313-4050-9e63-92a07df8ff0d" src="https://ecovacs2020.file.force.com/file-asset-public/f85d66d8031340509e6392a07df8ff0d?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 466px; height: 622px;" title="f85d66d8-0313-4050-9e63-92a07df8ff0d" /><br />
- If there is water residue in the cleaning sink, follow these steps:<br />
&nbsp; a. Open the <strong>dirty water tank</strong> and inspect the <strong>sealing ring</strong> for any visible foreign objects. If there are any, clean and wipe the ring. If the sealing ring is clear, ensure the cover is securely closed<br />
<img alt="5a5580b4-a3d2-4b63-b9f0-23d87591e856" src="https://ecovacs2020.file.force.com/file-asset-public/X5a5580b4a3d24b63b9f023d87591e856?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 278px; height: 371px;" title="5a5580b4-a3d2-4b63-b9f0-23d87591e856" /><img alt="3907744e-8c09-4848-9f73-6990f3523460" src="https://ecovacs2020.file.force.com/file-asset-public/X3907744e8c0948489f736990f3523460?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 278px; height: 371px;" title="3907744e-8c09-4848-9f73-6990f3523460" /><br />
&nbsp; b. Remove the sealing plugs, clean them, and reinstall them. Check for any foreign objects between the tank and the station. Once cleared, replace the water tank and press it down to ensure it is securely seated.<br />
<img alt="image (5)" src="https://ecovacs2020.file.force.com/file-asset-public/image_532?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 334px; height: 250px;" title="image (5)" /><br />
<img alt="4d571f89-3b86-4553-b014-43194ca1cd61" src="https://ecovacs2020.file.force.com/file-asset-public/X4d571f893b864553b01443194ca1cd61?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 334px; height: 250px;" title="4d571f89-3b86-4553-b014-43194ca1cd61" /><br />
&nbsp;c. Open the Ecovacs Home App, go to Settings, and select <strong>Device Relocation</strong>. Then click on <strong>Auxiliary Draining</strong> and check if the water can be drained.<br />
<br />
&nbsp; &nbsp; <strong>How to Access Auxiliary Draining in the Ecovacs Home App:</strong>
<ol>
	<li style="margin-left: 40px;">Press "<strong>Enter</strong>" to open the app.</li>
	<li style="margin-left: 40px;">Navigate to "<strong>Settings</strong>".</li>
	<li style="margin-left: 40px;">Scroll to the bottom of the Settings page and find "<strong>Device Relocation</strong>".</li>
	<li style="margin-left: 40px;">Click on "<strong>Auxiliary Draining</strong>" to begin the process.</li>
</ol>

<div style="margin-left: 80px;"><img alt="X8" src="https://ecovacs2020.file.force.com/file-asset-public/X8113?oid=00D2x000005pVxV" style="max-width: 666.5437499999999px" title="X8" /></div>

<div>&nbsp;d. If the water still<strong> cannot </strong>be drained, remove the cleaning sink, pour out any remaining water, clean the sink, and reinstall it. Ensure it is pushed all the way in to be properly seated.<br />
<br />
&nbsp;e. Re-plug the station''s power switch, then return the Deebot to the station by either pressing “Return to Station” on the App. Once the Deebot emits “Start Charging,” navigate to "<strong>Settings</strong>" &gt; "<strong>Device Relocation</strong>" and click on "<strong>Pipeline Check</strong>." Once the water dispensing is complete, click on "<strong>Auxiliary Draining</strong>" again to see if the issue persists.<br />
<br />
<img alt="X8-1" src="https://ecovacs2020.file.force.com/file-asset-public/X8114?oid=00D2x000005pVxV" style="max-width: 666.5437499999999px" title="X8-1" /></div>
</body>
</html>', 'Eric. L', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005r2onEAA', 'AMR Email Templates', 'Thanksgiving Holiday Warehouse Closure & Shipping Update', '感恩节假期仓库关闭及发货更新', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We would like to inform you that, due to the Thanksgiving holiday, our warehouse will be temporarily closed<strong> from Thursday, November 27th, to Friday, November 28th</strong>. As our warehouse is regularly closed on weekends, we expect that processing and shipping of orders will<strong> resume on Monday, December 1st, in the order they were received</strong>.<br />
<br />
Please note that this closure may cause slight delays in fulfilling replacement orders, and we appreciate your patience and understanding during this busy season. Rest assured, we are committed to handling your order as quickly and efficiently as possible once processing resumes.<br />
<br />
We value your continued support and are committed to resolving any issues promptly. Should you have any questions or need further clarification, please do not hesitate to reach out to us. We are always available to assist you—just a message or phone call away!<br />
<br />
Thank you for your continued support.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005r4PBEAY', 'AMR Email Templates', 'Other Region - Limited Support from North America', 'Other Region - 爱莫能助', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p><u>Unfortunately, we do not have access to the systems or resources required to resolve issues related to products purchased or used in other regions.</u><br />
<br />
To ensure you receive the most accurate and timely assistance, we recommend reaching out to the customer service team in your local region. They will be able to provide the appropriate support based on your product version, purchase channel, and regional policies.<br />
<br />
We sincerely apologize for any inconvenience this may cause and appreciate your understanding.&nbsp;<br />
<br />
For your convenience, here is a link to all Ecovacs global support teams:&nbsp;<a href="https://help.ecovacs.com/global/support/contact-us">Ecovacs Global Support</a>.</p>
</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005rorpEAA', 'AMR Email Templates', 'New Shipment Being Arranged', '因各种原因需要重发机器', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We have submitted a request to have a new shipment to be dispatched. Once that tracking information is available, you will be notified by email again.&nbsp;<br clear="none" />
<br clear="none" />
We appreciate your patience and understanding, and regret any inconvenience caused.<br />
<br />
Should you need further assistance, we are here to help!</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005rpO5EAI', 'AMR Email Templates', 'Customer Choosing Other Brands - Leaving Ecovacs', '用户要和科沃斯割席 (发完要通知T2/TL）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We truly regret any issues that may have influenced your decision. Please know that we deeply value your business and remain committed to serving you should the opportunity arise in the future.<br />
<br />
If there is anything else we can do to assist you or address any concerns, we would be more than happy to explore how we can meet your needs moving forward.<br />
<br />
Thank you for your time, and we hope to have the chance to work with you again.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005t4CzEAI', 'AMR Email Templates', 'Recycle Machine Inquiry', '回收废弃地宝', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">For the recycle machine inquiry, we would be happy to provide you with a referral to an ECOVACS approved repair center- iFixRobot for further consultation. Kindly reach out to iFixRobot customer service and they will assist you with the recycle service procedure. Contact information as below:<br />
<br />
Email address: service@ifixrobot.com.<br />
Tool Free: 1-855-349-7626/ 1-855-FIX-ROBOT</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005t6bNEAQ', 'AMR Email Templates', '(Old)Can DEEBOT work on carpet?', '(旧版)地宝能在地毯区域使用吗？', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">DEEBOT is specially designed for <strong>hard ground floors </strong>such as wood floors, ceramic tile, and short wool carpet. If the wool of the carpet is too long, it does cause the Side Brushes to wind up. It is recommended that you fold up the long-wool carpet or do some shade around the carpet a little to clear the obstacles for DEEBOT so that DEEBOT can travel freely in your home. It is not recommended to let the machine climb up onto the carpet when it is mopping.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005yoIPEAY', 'AMR Email Templates', 'Winbot Mini - How to Use Videos', 'Winbot Mini 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.<br />
<br />
To assist you with your Winbot Mini, please refer to the following video guide that addresses your current concern:<br />
<br />
<a href="https://youtu.be/PaTtwDyTGgQ">Installation and Use Guidance</a><br />
<br />
<a href="https://youtu.be/8iktW3sjMF0">Charge Guidance</a><br />
<br />
<a href="https://youtu.be/wUAWbyiNqHw">Binding Your Winbot Mini to the Ecovacs Home App</a><br />
<br />
<a href="https://youtu.be/A632Lt9Gyro">Firmware Version Upgrade Guidance</a><br />
<br />
<a href="https://youtu.be/3Qa4CAw6kC0">How to Maintain and Care for Your Winbot</a><br />
<br />
<a href="https://youtu.be/K58mges-ZsY">How to Clean the Winbot''s Driving Threads</a><br />
<br />
<a href="https://youtu.be/Zt_NrVFV1N4">What to Do if the Winbot Doesn''t Spray Water</a><br />
<br />
<a href="https://youtu.be/QvSHLcL1n5I">How to Resolve the Issue if the Winbot Gets Stuck at the Edge</a><br />
<br />
<br />
Should you need further assistance or have any additional questions, feel free to contact us. We are here to help!</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005yqFNEAY', 'AMR Email Templates', 'X2: No water seepage from clean water tank/Waste water recycling issue', '基站不出水/污水不循环', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Remove the sealing plugs and give them a good clean.<br />
<img alt="screenshot-20251120-070135" src="https://ecovacs2020.file.force.com/file-asset-public/screenshot202511200701351?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="screenshot-20251120-070135" /><br />
2. Remove the transparent plastic filter plate, then take out the smaller filter underneath. Please make sure there''s nothing blocking the filter holes.<br />
<img alt="eacb213e-8ff1-4b28-899d-849f455a3558" src="https://ecovacs2020.file.force.com/file-asset-public/eacb213e8ff14b28899d849f455a3558?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="eacb213e-8ff1-4b28-899d-849f455a3558" /><br />
<img alt="screenshot-20251208-003310" class="" src="https://ecovacs2020.file.force.com/file-asset-public/screenshot20251208003310?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 706.958px; height: 444.625px;" title="screenshot-20251208-003310" /><br />
3. Use a dry cloth to gently wipe the two metal pins on the wastewater detection sensor. Also, clean the wastewater outlet thoroughly.<br />
<img alt="9c998099-29bb-4294-abee-1552067d5a6b" src="https://ecovacs2020.file.force.com/file-asset-public/X9c99809929bb4294abee1552067d5a6b?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="9c998099-29bb-4294-abee-1552067d5a6b" /><br />
4. For the clean water tank, please check that the hose is clear and not blocked.<br />
For the dirty water tank, make sure the buoy inside can move freely. Open the tank and press the seal strip along the sides. Also, double-check that the lid is properly closed and pressed down securely.<br />
<img alt="bb8a37d1-b0c7-4ab8-8d7b-a7d23fa9a38b" src="https://ecovacs2020.file.force.com/file-asset-public/bb8a37d1b0c74ab88d7ba7d23fa9a38b?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="bb8a37d1-b0c7-4ab8-8d7b-a7d23fa9a38b" /><img alt="60dd1f22-a503-4235-95c8-9bf4a0fb4f1c" src="https://ecovacs2020.file.force.com/file-asset-public/X60dd1f22a503423595c89bf4a0fb4f1c?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="60dd1f22-a503-4235-95c8-9bf4a0fb4f1c" /><img alt="467ddefe-3e44-444c-81c6-7561da4c23ce" src="https://ecovacs2020.file.force.com/file-asset-public/X467ddefe3e44444c81c67561da4c23ce?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="467ddefe-3e44-444c-81c6-7561da4c23ce" /><br />
5. While firmly holding down the dirty water tank, long-press the button on the station to see if it can drain water from the sink.<br />
<img alt="4c7266d4-8f67-46fb-aaff-8b8a73a0263b" src="https://ecovacs2020.file.force.com/file-asset-public/X4c7266d48f6746fbaaff8b8a73a0263b?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="4c7266d4-8f67-46fb-aaff-8b8a73a0263b" /><br />
<img alt="ffd16e26-6dc3-4cdd-a932-c7e96922a7a3" src="https://ecovacs2020.file.force.com/file-asset-public/ffd16e266dc34cdda932c7e96922a7a3?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="ffd16e26-6dc3-4cdd-a932-c7e96922a7a3" /><br />
6.&nbsp;If the station drains successfully, please try long-pressing the self-cleaning button again without holding down the water tank to check if the issue still occurs.


<div id="" style="left: 8px; top: 1049.1px;">&nbsp;</div>

<div id="" style="left: 8px; top: 1049.1px;">&nbsp;</div>
</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005zenFEAQ', 'AMR Email Templates', 'Winbot W2 PRO - Troubleshooting Videos', 'Winbot W2 PRO 排障视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.<br />
<br />
To assist you with your Winbot W2 PRO, please refer to the following video guide that addresses your current concern:<br />
<br />
<a href="https://youtu.be/ObFe3iUuV3w">How to deal with the obstacles encountered by Winbot</a><br />
<br />
<a href="https://youtu.be/oSRdvb2Fv3s">How to deal with residual water stains on window glass ​</a><br />
<br />
<a href="https://youtu.be/SNiD9VxuijM">What to do if Winbot does not spray water</a><br />
<br />
<a href="https://youtu.be/v5EXPxzZ-MA">What to do if Winbot starts to slip</a><br />
<br />
<a href="https://youtu.be/xto9FCnTkxc">How to perform better cleaning on windows</a><br />
<br />
<a href="https://youtu.be/ykZWRBLcRj0">What to do when a voice reminder says Avoid window edges and reattach WINBOT</a><br />
<br />
<a href="https://youtu.be/kxDHcX9Na88">What to do when a voice reminder says Not enough air pressure？</a><br />
<br />
<a href="https://youtu.be/y5cP_uHtM0c">What to do when a voice reminder says WINBOT encountered an obstruction.</a><br />
<br />
<br />
Should you need further assistance or have any additional questions, feel free to contact us. We are here to help!</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000005znLwEAI', 'AMR Email Templates', 'Winbot W2 OMNI - How to Use Videos', 'Winbot W2 OMNI 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us.<br />
<br />
To assist you with your Winbot W2 OMNI, please refer to the following video guide that addresses your current concern:<br />
<br />
<a href="https://youtu.be/IU4V_GJEgiY">Control the Winbot via the Ecovacs Home App</a><br />
<br />
<a href="https://youtu.be/nwdfa5QPfW0">Quick Startup Tips</a><br />
<br />
<a href="https://youtu.be/kJdT1-GEci0">Maintenance Guide </a><br />
<br />
<a href="https://youtu.be/muNlnlbnkrc">Get Winbot ready for cleaning</a> <a href="https://youtu.be/trNLEFvHdAI">Storage Tips</a><br />
<br />
<br />
Should you need further assistance or have any additional questions, feel free to contact us. We are here to help!</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000607ajEAA', 'AMR Email Templates', 'X11 OmniCyclone - User Guide Videos', 'X11 OmniCyclone使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for choosing the X11 OmniCyclone! We are excited to help you get the most out of your new device.<br />
<br />
To ensure you have the best experience, we have created an instructional video that demonstrates how to properly use the X11 OmniCyclone.<br />
<br />
<a href="https://youtu.be/8Kx2BZFaWsc">App Advanced Usage</a><br />
<br />
<a href="https://youtu.be/T5I_l5NuMNc">Quick Startup Tips</a><br />
<br />
<a href="https://youtu.be/5IL82Mbrwto">Maintenance Guide</a><br />
<br />
<a href="https://youtu.be/gWjOd14Nk9w">Power Boost Charging</a><br />
<br />
<a href="https://youtu.be/s8aqkVZTlG4">Agent YIKO</a><br />
<br />
<a href="https://youtu.be/JVoStYVcWFc">OmniCyclone Station</a><br />
<br />
We hope this video provides a clear and helpful walkthrough. If you have any questions or need further assistance, please don’t hesitate to reach out to our support team—we’re here to help!<br />
<br />
Thank you for your trust in us. We look forward to your continued satisfaction with the X11 OmniCyclone.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000060a3FEAQ', 'AMR Email Templates', 'Yusen Warehouse Shipment Delay Due to Weather and Holiday Volume', 'Yusen仓发货延迟（假期和恶劣天气）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We hope this message finds you well. We are writing to provide you with a quick update on the status of your exchange request.<br />
<br />
Due to a combination of severe weather conditions impacting our warehouse operations and the high order volumes following Black Friday, we are currently experiencing a temporary backlog in processing exchanges. As a result, there may be a delay in processing your exchange.<br />
<br />
We sincerely apologize for any inconvenience this may cause and truly appreciate your patience as we work through these challenges. Our team is actively prioritizing orders and working to expedite processing as quickly as possible.<br />
<br />
If you have any questions or require further assistance, please feel free to reply to this email. We are here to help.<br />
<br />
Thank you for your understanding and for your continued support.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000061JjVEAU', 'AMR Email Templates', 'Reported Potential Loss of Package', '用户反馈可能存在物流丢件的情况', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out. We understand how important it is for you to receive your shipment package, and we are sincerely sorry to hear about any inconvenience caused.<br />
<br />
To help resolve this matter, we recommend the following steps:
<ul>
	<li><strong>Check with Neighbors</strong>: Packages can sometimes be delivered to nearby addresses by mistake. Please check with your neighbors to see if they may have received the package on your behalf.</li>
	<li><strong>Contact the Carrier</strong>: We suggest reaching out to the carrier directly to inquire about the package’s status. They may be able to provide tracking details or help clarify any delivery issues.</li>
</ul>
<br />
If the package remains unaccounted for after checking with both your <strong>neighbors and the shipment carrier,</strong> please let us know. We will gladly explore the next steps together to find an appropriate solution.<br />
<br />
We appreciate your patience and understanding, and we are here to assist you in any way we can.</body>
</html>', 'Alex. W', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000062CrFEAU', 'AMR Email Templates', 'Proof of Proof Blurry', '用户提供的购买凭证上关键信息***模糊***', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your prompt update with the requested information.<br />
<br />
However, upon reviewing the materials, we noticed that the <strong>proof of purchase</strong> is blurry. Could you kindly resend a clearer version at your earliest convenience?<br />
<br />
We appreciate your prompt cooperation and look forward to resolving this as quickly as possible.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000062I74EAE', 'AMR Email Templates', 'Fear that Winbot cause window scratches 1', '窗宝划伤玻璃 （话术1）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you so much for reaching out and sharing your concerns with us. We truly understand how important it is to protect your glass, especially when using new technology.<br />
<br />
From the outset of designing our window cleaning robot, protecting your glass has been our top priority. To achieve this, we''ve carefully selected soft rubber drive wheels and ultra-soft microfiber cloths. These materials have been rigorously tested to ensure every cleaning operation not only delivers excellent results but also gently cares for your glass, preventing any potential scratches.<br />
<br />
We want you to feel confident in your purchase, knowing that every detail has been thoughtfully designed with your peace of mind in mind. Should you have any further questions or concerns, please don''t hesitate to reach out—we are here to help and ensure your experience is nothing short of exceptional.</p>
</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000062JW9EAM', 'AMR Email Templates', 'REPORTING that Winbot cause window scratches 2', '窗宝划伤玻璃 （话术2）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out and sharing your concerns about potential scratches on your glass after using our Winbot. We understand your worries, and we would like to provide some insight into possible causes:
<ul>
	<li><strong>Micro-particles on the Glass or Cloth:</strong> Sometimes, tiny grains of sand or hard particles may be present on the glass or become embedded in the cloth during use. These particles can act as abrasives during the cleaning process, potentially leaving marks.</li>
	<li><strong>Environmental Factors:</strong> In windy conditions, fine debris can impact the glass surface, creating micro-scratches that may only become visible after cleaning, especially if they were covered by dust or debris beforehand.</li>
	<li><strong>Adhesive Residues: </strong>New windows can sometimes have small adhesive residues left from manufacturing or installation. These residues can leave marks that resemble scratches, but are actually just impressions that can be cleaned off.</li>
</ul>
<br />
To help prevent and address these issues, we recommend the following:
<ul>
	<li><strong>Pre-treatment: </strong>Before using the robot, we suggest wiping the glass area with a soft cloth, paying particular attention to the area the robot will clean. Additionally, ensure that the robot''s drive wheels and sensors are clean and free of debris.</li>
	<li><strong>Remove Adhesive Residues:</strong> If you suspect adhesive marks, a damp cloth or a small amount of alcohol should do the trick to gently wipe them away.</li>
</ul>
<br />
We hope these steps will help address your concerns and ensure your glass is properly cared for. If you continue to experience any issues, please do not hesitate to contact us. We''re here to assist you and ensure a smooth experience with our product.<br />
<br />
Thank you for your understanding and continued trust in our product.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000062T46EAE', 'AMR Email Templates', 'Customer rejects explanation_Winbot cause window scratches 3', '窗宝划伤玻璃 （话术3 用户拒绝话术解释1,2后使用）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your patience and for sharing your concerns with us. We fully understand your apprehension, and we are committed to providing you with the best possible solution. If you still have reservations regarding our explanation, we kindly ask you to follow the steps below so that we can further analyze and resolve the issue:
<ol>
	<li><strong>Replace the Cloth: </strong>Please replace the cloth with a new or clean one. Check the cloth for any sand, grit, or sharp particles. If any are found, please clean the cloth thoroughly before use.</li>
	<li><strong>Thorough Cleaning: </strong>Use a clean cloth to wipe the drive wheels and sensors again to ensure no debris or particles remain.</li>
	<li><strong>Test on Another Window:</strong> Try using the robot on a different window and check the surface for any micro-scratches, particles, or imperfections that may have been present before cleaning.</li>
	<li><strong>Record a Video: </strong>During the above steps, please record a video of the process. If you notice any scratches occurring, kindly send us the video so that our technical team can perform a more accurate diagnosis and analysis.</li>
</ol>
<br />
We are dedicated to providing you with the highest quality cleaning experience and ensuring that your concerns are addressed. We appreciate your understanding and cooperation in helping us resolve this matter.<br />
<br />
Thank you once again for choosing our product. We look forward to your response and are here to assist further if needed.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000063oPpEAI', 'AMR Email Templates', 'Malfunction in Auto Empty Module', '适用于X2 COMBO/T30S COMBO', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ul>
	<li>Check the dust collection inlets: One is square-shaped, located near the bottom of the docking station, next to the charging contacts. The other is underneath the handheld unit (remove the handheld to access). Remove any blockages or obstructions.</li>
	<li>Start auto-emptying the DEEBOT’s dustbin via Station Features in the App.</li>
	<li>Empty the handheld dust collection cup using the station button.</li>
</ul>
</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000065JbFEAU', 'AMR Email Templates', 'Suspicious login activity issue', '异地登录问题话术', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">During a recent routine security check, Ecovacs identified suspicious login activity from unusual locations on certain accounts.<br />
<br />
If you have received a related notification email, please follow the instructions below to update your account password, as well as your device''s video manager password (if your machine supports this function), to ensure the security of your account.<br />
<br />
How to reset your account''s password:
<ol>
	<li>Please use a <strong>browser</strong> to visit ecovacs.com/us or ecovacs.com/ca.</li>
	<li>Click the <strong>profile (person)</strong> icon in the upper-right corner.</li>
	<li>Select ''<strong>Forgot password</strong>''&nbsp;and enter the email address registered with your Ecovacs Home app.</li>
	<li>Check your inbox for the password reset email. If you don''t&nbsp;see it, please also check your Spam/Junk folder.</li>
</ol>
How to reset your device''s video manager password:

<ol>
	<li>Tap Enter and go to Settings in the upper-right corner of the app.</li>
	<li>Select Video Manager Settings.</li>
	<li>Tap Change Password and follow the on-screen instructions.</li>
</ol>
</body>
</html>', 'Eric. L', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000067WpLEAU', 'AMR Email Templates', 'Optimal Usage and Shelf Life of ECOVACS Cleaning Solution', 'ECOVACS清洁液的最佳使用方法与保质期', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">A <strong>1L</strong> bottle of ECOVACS cleaning solution, when used daily for house cleaning/mopping with your Deebot, will technically last approximately 1,365 days (nearly 4 years). However, to ensure optimal performance and effectiveness, we recommend using the cleaning solution within the <strong>2-year best-before period</strong>.<br />
<br />
For proper usage, we suggest using <strong>20ml of cleaning solution per 4L of clean water</strong> (which equates to a <strong>1:200</strong> ratio of cleaning solution to water), regardless of whether your device features automatic cleaning solution dispensing. If your machine is equipped <em>with </em>this feature, the base will <em>automatically </em>draw cleaning solution from the container once the feature is <em>enabled </em>and the container is <em>filled</em>.<br />
<br />
<strong>Note:</strong> If the solution container outlet is moist, this indicates that the solution should be dispensed correctly.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000067dkLEAQ', 'AMR Email Templates', 'Slippage During Operation / Irregular Machine Path', '运行打滑/机器路线乱，多是由于瓷砖地面较为光滑', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Cleaning Mode Check and Switch:</strong><br />
Confirm the current mode the machine is operating in to determine whether it is in <strong>Vac Only</strong> mode or <strong>Vac and Mop</strong> mode.<br />
<br />
If the machine is in Vac and Mop mode, we recommend switching it to Vac Only mode for better performance, when applicable.<br />
<br />
<strong>2. Drive Wheel Cleaning:</strong><br />
Perform a thorough cleaning of the drive wheels'' surface to remove any dirt, debris, or other build-up.<br />
<br />
Ensure the drive wheels'' rubber surface is clean to enhance friction with the floor and help prevent slippage.<br />
<br />
<strong>3. Water Flow Rate Adjustment:</strong><br />
Adjust the water output appropriately to avoid excess water on the floor, which could lead to slippage.<br />
<br />
<strong>4. Use of Cleaning Solution:</strong><br />
For Deebots <em>without </em>the automatic cleaning solution dispensing feature, ensure the amount of <strong>ECOVACS cleaning solution</strong> used follows the recommended ratio: <strong>20ml of cleaning solution per 4L of clean water</strong>. If the amount exceeds this ratio, try using just water to see if this improves performance.<br />
<br />
For machines <em>with </em>the automatic cleaning solution feature, try <em>temporarily </em>disabling this function and use only water for cleaning. This can help reduce the risk of the floor becoming too slippery due to excess cleaning solution.<br />
<br />
Please let us know if this information resolves the issue. If you need any further assistance, feel free to reach out.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz0000068Fw5EAE', 'AMR Email Templates', 'Extended Warranty Offer - Winbot Restocking Soon', '预计2026年1月上旬，窗宝补货 - 实际发货可能要2月初', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your continued patience and understanding.<br />
<br />
We apologize for the delay in fulfilling your WINBOT replacement. Due to exceptionally high demand, we are currently preparing the next inventory release. Replenishment is expected to be completed by the end of January 2026, with shipments set to begin in the first week of February 2026. We truly understand the inconvenience this has caused and sincerely apologize for the extended wait.<br />
<br />
Based on the current arrangements, we will proceed with offering you<strong>&nbsp;an upgraded WINBOT model</strong>:<br />
<br />
<strong>W2 PRO OMNI</strong><br />
<br />
Additionally, as a gesture of appreciation for your continued patience, we will provide a <strong>complimentary 3-month extended warranty</strong> on the replacement unit at no additional cost.<br />
<br />
To apply the extended warranty on the replacement unit, we kindly ask that you provide us with the <strong>serial number (SN)</strong> of the new unit once it arrives.<br />
<br />
We genuinely appreciate your understanding during this period and are committed to resolving this matter as swiftly as possible. Please feel free to reach out if you have any further questions or need assistance.<br />
<br />
Thank you for choosing ECOVACS.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000692vBEAQ', 'AMR Email Templates', 'Winbot Alarm - Insufficient Suction', '语音提醒"窗宝气压不足"如何处理 （吸附真空度不够导致）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us. We regret to learn that you are having an issue with your Winbot.<br />
<br />
Please follow these combined steps to resolve the issue:<br />
<br />
<strong>1. Check and Clean the Drive Wheels:</strong><br />
Ensure the drive wheels are free of dirt or debris that could affect performance.<br />
<img alt="Winbot Driving Threads" src="https://ecovacs2020.file.force.com/file-asset-public/Winbot_Driving_Threads?oid=00D2x000005pVxV" style="max-width: 669.341796875px" title="Winbot Driving Threads" /><br />
<br />
<strong>2. Inspect and Adjust the Cleaning Cloth:</strong><br />
Check the cloth for any wear or damage. If necessary, replace it with a new one.<br />
<br />
Ensure the cloth is properly aligned with the bracket, smooth, and free of folds, creases, or lifted edges. It should not block the window cleaning area.<br />
<br />
<strong>3. Place the Winbot to Restore Air Pressure:</strong><br />
Lay the main Winbot unit on a flat surface with the fan side facing up. Leave it to rest for 24 hours to allow the internal high-elasticity material to regain its original shape, which will restore the air pressure functionality.<br />
<br />
<em><strong>Note on the Cause:</strong><br />
The air pressure warning issue is typically caused by the internal high-elasticity sealing material. During shipping, the device may have been subjected to prolonged pressure, which temporarily reduces the elasticity of these materials. Rest assured, this can be easily resolved by following the above steps.</em><br />
<br />
<strong>4. Check the Environment and Enhance Suction:</strong><br />
Ensure there are no gaps or obstructions in the environment where the Winbot operates. This includes checking for any obstacles or uneven surfaces that could interfere with the unit''s movement or suction.<br />
<br />
Also, check for altitude restrictions, such as elevated areas where the unit may struggle to maintain suction power or balance.<br />
<br />
After completing these steps, the air pressure issue should be resolved. If the problem persists, or if you need further assistance, please feel free to reach out, and we will be happy to help.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz00000693XtEAI', 'AMR Email Templates', 'Winbot Spraying Issue - Manual Works, Auto Not Working', '窗宝手动喷水正常，自动不喷水', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out. We understand you have encountered an issue with the water spray on your device, and we would like to help clarify how the system manages this feature in certain scenarios.<br />
<br />
<strong>Water Spray Restrictions:</strong><br />
In some situations, the software will automatically disable water spray to prevent water from splashing onto the window frame. While this may appear to be an issue, please note that the cleaning cloth is still damp enough to ensure effective cleaning. <strong>Here are the specific scenarios where the water spray will be disabled:</strong>
<ul>
	<li><strong>Edge Cleaning: </strong>No water spray during the edge cleaning process.</li>
	<li><strong>Small Glass Surfaces:</strong> No water spray on glass surfaces smaller than 60cm/23.62inches&nbsp;in width.</li>
	<li><strong>Return to "starting point": </strong>No water spray when the device is returning to its original point.</li>
	<li><strong>Omni Remote Control:</strong> No water spray during full-range remote control operation.</li>
	<li><strong>App Settings:</strong> If the Auto Spray feature is turned off in the app, no water will be sprayed.</li>
</ul>
<br />
<em><strong>For Winbot MINI:</strong><br />
When cleaning glass surfaces smaller than 50cm/</em>19.69 inches ​​​&nbsp;<em>in width, the Winbot MINI will not spray water while using an N-shaped cleaning pattern. Additionally, it will not spray water when manually controlled to move upward.</em><br />
<br />
We hope this helps clarify the behavior of the water spray feature. If the issue persists or if you have any further questions, please let us know, and we will be happy to assist you further.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006A45JEAS', 'AMR Email Templates', 'Winbot Manual and Auto Spray Not Working', '窗宝手动/自动都不喷水', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out regarding your Winbot''s water spraying issue. To help resolve this, please follow these troubleshooting steps:<br />
<br />
<strong>Check the Water Tank:</strong><br />
Ensure that there is water or the ECOVACS WINBOT cleaning solution in the tank.<br />
<br />
<strong>Verify the Auto Spray Setting:</strong><br />
In the ECOVACS Home App, check if the <strong>auto spray</strong> function is turned off. If it is, please enable it.<br />
<br />
<strong>Check for Clogs in the Spray Nozzles:</strong><br />
Inspect both the front and rear spray nozzles of the Winbot to ensure they are not blocked.<br />
<br />
After following these steps, please check whether the issue persists. If it does, let us know and we will assist you further.<br />
<br />
Thank you for your patience, and we look forward to resolving this promptly.</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006A6NFEA0', 'AMR Email Templates', 'Situations Where the Winbot is Not Suitable for Use', '窗宝不适用的情况', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ul>
	<li>Do not use on framed windows with a glass <strong>frame thickness </strong>of less than 0.2 inches (5mm).</li>
	<li>Do not use on glass <strong>thinner </strong>than 0.12 inches (3mm) or mirrors thinner than 0.16 inches (4mm).</li>
	<li><strong>Low temperatures</strong> may cause the Winbot to display a "Hardware Malfunction" error, preventing normal operation.</li>
	<li><strong>High temperatures </strong>may damage the machine or shorten its lifespan.</li>
	<li>The Winbot will not function properly on <strong>horizontal </strong>glass surfaces.</li>
</ul>
</body>
</html>', 'Charlie G.', 1792029242032)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006BkaLEAS', 'AMR Email Templates', 'T50系列基站不出水', '', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ul>
	<li>Please remove both the clean water tank and the&nbsp;dirty water tank from the station. Underneath the tanks, you will find three sealing plugs. <strong>Remove them from the station and rinse them with clean water</strong>.</li>
</ul>
<img alt="image_361" src="https://ecovacs2020.file.force.com/file-asset-public/image_3611?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 538px; height: 353px;" title="image_361" />
<ul>
	<li>Check that both water tanks are in good condition and ensure the sealing rings are intact and not damaged.</li>
</ul>
<img alt="image_322" src="https://ecovacs2020.file.force.com/file-asset-public/image_3221?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 284px; height: 428px;" title="image_322" />
<ul>
	<li>Reinstall the clean and dirty water tanks onto the station, making sure both are seated properly and securely.</li>
</ul>
<img alt="Image_2025-12-20_22-35-22" src="https://ecovacs2020.file.force.com/file-asset-public/Image_20251220_223522?oid=00D2x000005pVxV" style="max-width: 1097.25px" title="Image_2025-12-20_22-35-22" /><br />
<br />
If the above steps have been completed, please perform a pipeline check to confirm whether the station can dispense water:
<ul>
	<li>Go to Settings → Device Relocation → Pipeline Check.</li>
	<li>Once water is dispensed successfully, tap <strong>Auxiliary Draining</strong> to check whether the water can be drained properly.</li>
</ul>
<img alt="image_40" src="https://ecovacs2020.file.force.com/file-asset-public/image_401?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 217px; height: 413px;" title="image_40" /><br />
<img alt="image_412" src="https://ecovacs2020.file.force.com/file-asset-public/image_4121?oid=00D2x000005pVxV" style="max-width: 1097.25px; width: 211px; height: 435px;" title="image_412" /></body>
</html>', 'Eric. L', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CPvGEAW', 'AMR Email Templates', 'Christmas & New Year Warehouse Closure', 'Besender 圣诞 & 新年放假安排', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We would like to inform you that, due to the holiday season, our after-sales warehouses will be closed on the following dates:
<ul>
	<li><strong>US Warehouse</strong>: December 24th–26th, 2025, and January 1st–2nd, 2026.</li>
	<li><strong>Canada Warehouse</strong>: December 25th–26th, 2025, and January 1st, 2026.</li>
</ul>
Both warehouses will also be closed on <strong>December 27th and 28th</strong> (weekend).<br />
<br />
As a result, processing and shipping of orders will be paused during this period. Operations will resume as follows:
<ul>
	<li><strong>For both US and Canada warehouses</strong>: Monday, December 29th, 2025, and Wednesday, January 3rd, 2026.</li>
</ul>
<br />
We sincerely apologize for any inconvenience this may cause and greatly appreciate your understanding and patience during this busy holiday season. Please rest assured that we are committed to processing your order as quickly as possible once operations resume.<br />
<br />
If you have any questions or need further assistance, please do not hesitate to contact us. We are always here to help!<br />
<br />
Thank you for your continued support, and we wish you a joyful and peaceful holiday season.</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CRfJEAW', 'AMR Email Templates', 'Serial Number Cannot Be Used for Warranty Verifcation', '无法通过机器SN验证质保', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to us regarding your warranty inquiry.<br />
<br />
We understand that you are unable to locate the receipt for your unit, and we appreciate your efforts in contacting us. However, to proceed with warranty service, we do require proof of purchase. This can be the original order details, receipt, or even a gift receipt if the unit was received as a gift.<br />
<br />
Unfortunately, <strong>the serial number alone is not sufficient to validate warranty coverage</strong>. If you are unable to provide the proof of purchase, we recommend reaching out to the source from which the unit was purchased, as they may be able to assist in retrieving the necessary details.<br />
<br />
We understand this may be inconvenient, and we’re here to help if you have any questions or need further assistance. Please let us know how you would like to proceed, and we’ll do our best to assist you.</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CZEfEAO', 'AMR Email Templates', 'Annual Physical Inventory/PI Check', '年度库存盘点，影响发货处理进度', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We would like to inform you that, due to our annual physical inventory process, there will be a temporary delay in processing your replacement. The inventory process will take place as follows:<br />
&nbsp;
<ul>
	<li><strong>&nbsp;US warehouse</strong>: January 12th–16th, 2025</li>
	<li>&nbsp;<strong>Canada warehouse</strong>: January 19th–23rd, 2025</li>
</ul>
<br />
During this time, shipments may not be processed as usual. After the inventory process is completed, we expect shipments to gradually return to normal.<br />
<br />
Please rest assured that we are working diligently to minimize any delays. We will notify you as soon as your replacement has been shipped.<br />
<br />
We sincerely apologize for any inconvenience this may cause and greatly appreciate your understanding and patience. If you have any questions or require further assistance, please do not hesitate to contact our customer support team.<br />
<br />
Thank you for your continued support.</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006Cd8cEAC', 'AMR Email Templates', 'OOW - No Need to Return Original Machine', 'OOW机器保修流程', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for providing the required information.&nbsp;</p>

<p>We''re pleased to inform you that your replacement request has been successfully submitted.<br />
&nbsp;</p>

<p>✨ <strong>What to Expect Next</strong></p>

<p><strong>Replacement Process</strong></p>

<ul>
	<li>We will process your replacement and ship it as quickly as possible.</li>
	<li>You will receive an email with your tracking number within <strong>5-7 business days</strong> after we receive your information.</li>
	<li>Once shipped, your replacement typically arrives within <strong>5-10&nbsp;business days</strong>, though delivery times may vary based on your location.</li>
</ul>

<p><strong>Your Current Unit</strong></p>

<ul>
	<li><strong>No need to return it</strong>! You are welcome to keep, donate, or dispose of it at your discretion.</li>
</ul>

<p>Thank you again for your cooperation. If you have any further questions or need additional assistance, please don''t hesitate to reach out to us.</p>
</body>
</html>', 'Eric. L', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CuarEAC', 'AMR Email Templates', 'X11 PRO OMNI - How to Use Videos', 'X11 PRO OMNI 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/p0yu6_VH64E">Guidelines for the correct installation of the robot</a><br />
<br />
<a href="https://youtu.be/O4tgt-Oc1CU">Robotic Crating Guidelines</a><br />
<br />
<a href="https://youtu.be/WA_WWWFj9Mg">How to properly charge a robot and instructions for energy energy-saving charging?</a><br />
<br />
<a href="https://youtu.be/RyMCbhYIgkI">How to troubleshoot a robot that fails to charge?</a><br />
<br />
<a href="https://youtu.be/8LW79FtdppU">How to Use Agent Mode and Set Cleaning Preferences via YIKO</a><br />
<br />
<a href="https://youtu.be/RpUkOZ56xAs">How to Replace the Dust Bag / Alert: Dust Bag Full</a><br />
<br />
<a href="https://youtu.be/GqvArs5yDgY">Alarm: Abnormal dust bag installation</a><br />
<br />
<a href="https://youtu.be/OlddQ1I273E">How to disassemble/install the dust collection cabin filter cotton?</a><br />
​​​​​​​<br />
<a href="https://youtu.be/wHzKXf5gelY">Mapping Guide</a><br />
<br />
<a href="https://youtu.be/Jibi4qtzmOc">How to Use the Mopping Function Water Tank Version</a><br />
<br />
<a href="https://youtu.be/aBzi0e5d7Yk">How to add disinfectant heavy duty cleaning solution</a><br />
<br />
<a href="https://youtu.be/kaIVBgSSot0">How to Handle “Disinfectant Cleaning Solution Low” or “Heavy Duty Cleaning Solution Low” Alert?</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/9ff4Z4hvA4Q">Side Brush Removal, Cleaning, and Reinstallation</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/OrcadAsPQwI">Main Brush Removal, Cleaning and Reinstallation</a><br />
<br />
<a href="https://youtu.be/cj_PqA9DDDc">Dustbin Removal, Cleaning, and Reinstallation Guide</a><br />
<br />
<a href="https://youtu.be/D1uCzC4R1_w">Alert Anti drop Sensors Dust Accumulation</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/v1WKr7vEsVo">How to clean the dirty and clean water tanks</a><br />
<br />
<a href="https://youtu.be/FZWD9qpxDwk">ALERT Clean Water Tank Anomaly</a><br />
<br />
<a href="https://youtu.be/OmNRN4Tgq2c">ALERT Dirty Water Tank Anomaly</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/eiGgzamCxMw">Clean Water Not Coming out</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/jCMjtouAOfA">How do I remove the roller mop and install the roller mop</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/z1H2OhDiXIc">Alert Bumper Stuck</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/aF1jgTaUPSU">Alarm Difficulty running, check drive wheels</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/WqhmjMw7M6o">What to do if the robot cannot cross thresholds or steps</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/xjW6ueQ4T6s">How to deal with messy cleaning routes</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/msRn_cfNJdg">Handling Missed Cleaning Areas</a><br />
<br />
<a href="https://youtu.be/HqEmtTKAjYA">How do I install and remove the base</a><br />
<br />
<a href="https://youtu.be/9vS-4nXSaHk">How to clean the mop washing tray</a><br />
<br />
<a href="https://youtu.be/dnjoD_F5HsM">Alert Abnormal cleaning sink</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/2nvDkihejpY">How to Clean the dirty water box</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/xTGjeUciv7E">ALERT Dirty Water Box Abnormal</a> ​​​​​​​<br />
<br />
<a href="https://youtu.be/l-qk1CBQLrI">How to Clean the Water Tray</a><br />
<br />
<a href="https://youtu.be/OqVM845jsSU">Voice Alert Water Tray Not Installed</a><br />
<br />
<a href="https://youtu.be/Zl3XjW8f2ps">ALERT Roller Mop Tangled</a><br />
<br />
<a href="https://youtu.be/XbbTcflvI4M">What to do if the roller mop won''t expand</a><br />
<br />
<a href="https://youtu.be/iovFXzdD3GA">Why isn''t the robot avoiding obstacles</a><br />
<br />
<a href="https://youtu.be/091CISZVF14">Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/jEouaQuHN3Q">How to set up a scenario clean</a><br />
<br />
<a href="https://youtu.be/fymmH-yBCUg">How to create multi floor maps</a><br />
<br />
<a href="https://youtu.be/BId9YY4tGYQ">What to do if the robot makes loud or unusual noises during operation</a><br />
<br />
<a href="https://youtu.be/cQA8zgePHro">V Shaped Comb Removal, Cleaning, and Reinstallation</a><br />
<br />
<a href="https://youtu.be/CDWhyKHD1po">How to use the Video Manager function correctly</a><br />
<br />
<a href="https://youtu.be/9tLVFepQZOY">What to do if the robot finds the station but can''t return due to slipping</a><br />
<br />
<a href="https://youtu.be/3IdyGvK46WU">How to turn off the night vision supplementary Light</a><br />
<br />
<a href="https://youtu.be/SkbK7-22jBo">How to set mop only mode？</a><br />
<br />
<a href="https://youtu.be/Nhmcsb9EiXQ">How to Use the Corner Guards Optional？</a><br />
<br />
<a href="https://youtu.be/x1D76DF0vq8">How to use the powerboost charging function</a><br />
<br />
<a href="https://youtu.be/Nnen56_M2Xs">What to do if the robot still can’t complete full house cleaning after enabling PowerBoost Charging</a><br />
&nbsp;</body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CuuDEAS', 'AMR Email Templates', 'X9 - How to Use Videos', 'X9 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/bGHvQqg6wkk">Guidelines for the correct installation of the robot</a><br />
<br />
<a href="https://youtu.be/iUrIUPGOg5w">Robotic Crating Guidelines</a><br />
<br />
<a href="https://youtu.be/If5xT6SXPog">Robot Charging Guide &amp; Energy saving Charging Instructions</a><br />
<br />
<a href="https://youtu.be/33wlctbsxFY">How to troubleshoot a robot that fails to charge</a><br />
<br />
<a href="https://youtu.be/7BLl0nki0Io">How to Replace the Dust Bag Alert Dust Bag Full</a><br />
<br />
<a href="https://youtu.be/s2A-J9xP37c">How to disassemble install the dust collection cabin filter cotton？</a><br />
<br />
<a href="https://youtu.be/Kc4TDF9e490">How do I add cleaning solution</a><br />
<br />
<a href="https://youtu.be/NxjKaYfPRyU">Mapping Guide</a><br />
<br />
<a href="https://youtu.be/Rb-WlGbY1Ys">How to Use Mopping Function</a><br />
<br />
<a href="https://youtu.be/IDrRjLwVbl0">Side Brush Removal, Cleaning, and Reinstallation</a><br />
<br />
<a href="https://youtu.be/zw21DTnthes">V Shaped Comb Removal, Cleaning, and Reinstallation</a><br />
<br />
<a href="https://youtu.be/0KP5GEef9XU">Main Brush Removal, Cleaning and Reinstallation</a><br />
<br />
<a href="https://youtu.be/NoHGADUpA_w">Dustbin Removal, Cleaning, and Reinstallation Guide</a><br />
<br />
<a href="https://youtu.be/tr3stzPR92o">Alert Anti drop Sensors Dust Accumulation</a><br />
<br />
<a href="https://youtu.be/ZZLgxREabJw">ALERT Clean Water Tank Anomaly</a><br />
<br />
<a href="https://youtu.be/zzcOHha87Hg">ALERT Waste Water Tank Anomaly</a><br />
<br />
<a href="https://youtu.be/3x8P0IrBPDc">Clean Water Not Coming out</a><br />
<br />
<a href="https://youtu.be/Lyk4NUi6gM8">How do I remove the roller mop and install the roller mop</a><br />
<br />
<a href="https://youtu.be/moIXwhOgFrE">AlertBumper Stuck</a><br />
<br />
<a href="https://youtu.be/2VCGtrxBFqg">Alarm Abnormal dust bag installation</a><br />
<br />
<a href="https://youtu.be/iWsmY7oJtXs">Alarm Difficulty running, check drive wheels</a><br />
<br />
<a href="https://youtu.be/HufBBCQ_1fc">How to deal with messy cleaning routes</a><br />
<br />
<a href="https://youtu.be/tJWNpUNpfWE">How do I install and remove the base</a><br />
<br />
<a href="https://youtu.be/n2gz-9d2zCM">How do I install an overflow float</a><br />
<br />
<a href="https://youtu.be/rYiwlW_KjcU">Mop Washing Tray Maintenance Guide</a><br />
<br />
<a href="https://youtu.be/nObgrsHRqDQ">Handling Missed Cleaning Areas</a><br />
<br />
<a href="https://youtu.be/XymQ_Vup1ZA">Alert Abnormal cleaning sink</a><br />
<br />
<a href="https://youtu.be/qBB4jaMF4uc">How to Clean the dirty water box</a><br />
<br />
<a href="https://youtu.be/7_OvPfvvxzI">How to Clean the Water Tray</a><br />
<br />
<a href="https://youtu.be/HoLdG18UoZ4">ALERT Dirty Water Box Abnormal</a><br />
<br />
<a href="https://youtu.be/uDT0kwLDHmw">Voice Alert Water Tray Not Installed</a><br />
<br />
<a href="https://youtu.be/nl_ebFztkrc">ALERT Laser Sensor Abnormal</a><br />
<br />
<a href="https://youtu.be/MYwH8hVvdNo">ALERT Roller Mop Tangled</a><br />
<br />
<a href="https://youtu.be/ug5iDv2aLBU">Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/qON6PF6muHE">What to do if the roller mop won''t expand</a><br />
<br />
<a href="https://youtu.be/08T3PWhXllo">What to do if the robot makes loud or unusual noises during operation</a><br />
<br />
<a href="https://youtu.be/6qhOEkosw0E">What to do if the robot finds the station but can''t return due to slipping</a><br />
<br />
<a href="https://youtu.be/xtEsDOVz8_A">How to turn off the night vision supplementary Light</a><br />
<br />
<a href="https://youtu.be/-HS-ODA7AfI">What should I do if the voice assistant cannot be woken up</a><br />
<br />
<a href="https://youtu.be/KpqnYoPXQyU">Alert Low Cleaning solution level</a><br />
<br />
<a href="https://youtu.be/qFpZ3_66ZlY">Why isn''t the robot avoiding obstacles</a><br />
<br />
<a href="https://youtu.be/NIeILQjMRQU">How to set mop only mode</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CuvpEAC', 'AMR Email Templates', 'T80 - How to Use Videos', 'T80 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/m0iGCOMNA2Q">Guidelines for the correct installation of the robot </a><br />
<br />
<a href="https://youtu.be/y1K2N5WIHk8">Robotic Crating Guidelines</a><br />
<br />
<a href="https://youtu.be/8JN43VV25Zg">How to properly charge a robot and instructions for energy-saving charging</a><br />
<br />
<a href="https://youtu.be/LIOt-RuzNvw">How to troubleshoot a robot that fails to charge</a><br />
<br />
<a href="https://youtu.be/fyCMj6Idc7Y">How to Replace the Dust Bag Alert Dust Bag Full</a><br />
<br />
<a href="https://youtu.be/sswZPFKjsy0">How to disassemble install the dust collection cabin filter cotton？</a><br />
<br />
<a href="https://youtu.be/tjp3PjDt75A">How do I add cleaning solution</a><br />
<br />
<a href="https://youtu.be/ZAqQaFNvKIk">Mapping Guide</a><br />
<br />
<a href="https://youtu.be/no9Qjx2FkUk">How to Use Mopping Function Auto Refill and Drain Version</a><br />
<br />
<a href="https://youtu.be/bDUT0Z1OWgg">How to Use Mopping Function Water Tank Version</a><br />
<br />
<a href="https://youtu.be/62smYBSDFnU">Side Brush Removal, Cleaning, and Reinstallation</a><br />
<br />
<a href="https://youtu.be/oUtRICutYKk">V Shaped Comb Removal, Cleaning, and Reinstallation</a><br />
<br />
<a href="https://youtu.be/qfb0LQPf7B8">Main Brush Removal, Cleaning, and Reinstallation</a><br />
<br />
<a href="https://youtu.be/FRqVjwzGWSg">Dustbin Removal, Cleaning, and Reinstallation Guide</a><br />
<br />
<a href="https://youtu.be/EMBedEBbNqM">Alert Anti drop Sensors Dust Accumulation</a><br />
<br />
<a href="https://youtu.be/PoqiIHY0A_E">ALERT Clean Water Tank Anomaly</a><br />
<br />
<a href="https://youtu.be/UjkCzrvx9HI">ALERT Waste Water Tank Anomaly</a><br />
<br />
<a href="https://youtu.be/89XUJJifLIE">Clean Water Not Dispensing</a><br />
<br />
<a href="https://youtu.be/CjIVEKQrN80">How do I remove the roller mop and install the roller mop</a><br />
<br />
<a href="https://youtu.be/KanYJvN1vUc">Troubleshooting Bumper Stuck Alert</a><br />
<br />
<a href="https://youtu.be/kV-7PODw3qM">Alarm Abnormal dust bag installation</a><br />
<br />
<a href="https://youtu.be/nWjcYOrZ0XI">Alarm Difficulty running, check drive wheels</a><br />
<br />
<a href="https://youtu.be/OnCdFN0AMP4">How to Fix Erratic Cleaning Paths</a><br />
<br />
<a href="https://youtu.be/0k8QqvlJib4">How do I install and remove the base</a><br />
<br />
<a href="https://youtu.be/VS_B6GinRxY">How do I install an overflow float</a><br />
<br />
<a href="https://youtu.be/MRPvtkct4ec">Mop Washing Tray Maintenance Guide</a><br />
<br />
<a href="https://youtu.be/75J_zrH2Mtc">Alarm Abnormal cleaning sink</a><br />
<br />
<a href="https://youtu.be/HE98mT7mBiY">How to Clean the dirty water box</a><br />
<br />
<a href="https://youtu.be/Safk5SbPMjQ">How to Clean the Water Tray</a><br />
<br />
<a href="https://youtu.be/QCvnoHWS0Mw">ALERT Dirty Water Box Abnormal</a><br />
<br />
<a href="https://youtu.be/Rsr-SFyLj7c">Voice Alert Water Tray Not Installed</a><br />
<br />
<a href="https://youtu.be/ZjtsBmgz1z8">ALERT Laser Sensor Abnormal</a><br />
<br />
<a href="https://youtu.be/vxajzPnGacY">ALERT Roller Mop Tangled</a><br />
<a href="https://youtu.be/FKE0IWdnQNQ">No Hot Water from Station</a><br />
<br />
<a href="https://youtu.be/rjinzeKU5WI">Cleaning did not start as scheduled</a><br />
<br />
<a href="https://youtu.be/4aqVS9z1JMw">How to handle map issues distortion, overlap</a><br />
<br />
<a href="https://youtu.be/ikEB6IhNZtc">Why isn''t the robot avoiding obstacles</a><br />
<br />
<a href="https://youtu.be/KpLT5mBw004">Guide to Connecting Your Robot to WiFi</a><br />
<br />
<a href="https://youtu.be/ph3ZAgbYuEY">What to do if the robot isn''t resuming cleaning from the last stopping point</a><br />
<br />
<a href="https://youtu.be/jRDVqlAJqTs">How to Use Base Station Features</a><br />
<br />
<a href="https://youtu.be/rwCCJy1I3k4">How do I upgrade the firmware version</a><br />
<br />
<a href="https://youtu.be/QEoRzpvhEpw">How to add more WiFi signals</a><br />
<br />
<a href="https://youtu.be/OR2Zdx6_42M">How to Set Up a Virtual Wall</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006Cv5VEAS', 'AMR Email Templates', 'T30C - How to Use Videos', 'T30C 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/aUYY6QWusME">How to correctly install the robot</a><br />
<br />
<a href="https://youtu.be/-IMKRFdRlDw">Robot Packing Guide</a><br />
<br />
<a href="https://youtu.be/tWfO1IdlwWQ">Robot Charging Guide &amp; Energy saving Charging Instructions</a><br />
<br />
<a href="https://youtu.be/p3cDgSJz62k">Robot can''t be charged, what can I do</a><br />
<br />
<a href="https://youtu.be/hvz0t5OanDE">How to Replace the Dust Bag Alert Dust Bag Full</a><br />
<br />
<a href="https://youtu.be/oKq5x8QW5Ec">How do I add cleaning solution</a><br />
<br />
<a href="https://youtu.be/_smurxJdWx4">Alert Low Cleaning solution level</a><br />
<br />
<a href="https://youtu.be/zG5vT7Fw394">Mapping Guide</a><br />
<br />
<a href="https://youtu.be/u3v2WL_LarU">How to Use Mopping Function</a><br />
<br />
<a href="https://youtu.be/256GSwxOvVE">Side Brush Removal, Cleaning, and Reinstallation</a><br />
<br />
<a href="https://youtu.be/bLC1MALOtG8">Main Brush Removal, Cleaning, and Reinstallation</a><br />
<br />
<a href="https://youtu.be/-NwHDOU-bgo">V Shaped Comb Removal, Cleaning, and Reinstallation</a><br />
<br />
<a href="https://youtu.be/Gwd3PjRBhKU">Dustbin Removal, Cleaning, and Reinstallation Guide</a><br />
<br />
<a href="https://youtu.be/ulBNQPnJ7n4">Alert Anti drop Sensors Dust Accumulation</a><br />
<br />
<a href="https://youtu.be/R3z2J2-6IAo">ALERT Clean Water Tank Anomaly</a><br />
<br />
<a href="https://youtu.be/o5JygoeJ9FE">Clean Water Not Coming Out</a><br />
<br />
<a href="https://youtu.be/68x6FAzG3A0">Disassembly, clean and installation guide of mopping pad assembly</a><br />
<br />
<a href="https://youtu.be/O2e61Fp7e9U">Alarm Difficulty running, check drive wheels</a><br />
<br />
<a href="https://youtu.be/t3V-HgT0sIY">ALERT Bumper Stuck</a><br />
<br />
<a href="https://youtu.be/-n79PYADi30">How to Fix Erratic Cleaning Paths</a><br />
<br />
<a href="https://youtu.be/kniD8tMNBCA">How do I install and remove the base</a><br />
<br />
<a href="https://youtu.be/PU4f7NKt87o">Disassembly and Cleaning of the Mop Washing Tray</a><br />
<br />
<a href="https://youtu.be/GRX-pwoaFf8">Handling Missed Cleaning Areas</a><br />
<br />
<a href="https://youtu.be/hMDjH6rMwSs">Alarm Abnormal cleaning sink</a><br />
<br />
<a href="https://youtu.be/5FJpbiUpV_A">ALERT Laser Sensor Abnormal</a><br />
<br />
<a href="https://youtu.be/I5LjNkR14mY">Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/ttL1iDrYU4g">Handling the issue of the mopping pad not expanding outward</a><br />
<br />
<a href="https://youtu.be/vtakqIWjqIw">How to use spot cleaning</a><br />
<br />
<a href="https://youtu.be/5gumOyet2Ok">How do I install an overflow float</a><br />
<br />
<a href="https://youtu.be/shqkBTPvkcQ">Alarm Abnormal dust bag installation</a><br />
<br />
<a href="https://youtu.be/giDyj5ykdOc">Why isn''t the robot avoiding obstacles</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006Cv77EAC', 'AMR Email Templates', 'T50 Max - How to Use Videos', 'T50 Max 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/HoueY3Kms-E">How to correctly install the robot</a><br />
<br />
<a href="https://youtu.be/6dpwb_2fa0o">Robot Charging Guide</a><br />
<br />
<a href="https://youtu.be/6dpwb_2fa0o">Robot can''t be charged, what can I do</a><br />
<br />
<a href="https://youtu.be/6dpwb_2fa0o">How to replace dust bag</a><br />
<br />
<a href="https://youtu.be/OEmOEaX2EIE">Mapping Guide</a><br />
<br />
<a href="https://youtu.be/OEmOEaX2EIE">How to start a mopping task</a><br />
<br />
<a href="https://youtu.be/1g_X6E5FXtM">Disassembly, clean and installation Guide of side brush</a><br />
<br />
<a href="https://youtu.be/lwPwgV7_pj8">Disassembly, clean and installation guide of main brush</a><br />
<br />
<a href="https://youtu.be/4TMsV0aFMkA">Disassembly, clean and installation guide of Dust bin</a><br />
<br />
<a href="https://youtu.be/bL1dv11REIk">Anti drop sensors have accumulated dust, please wipe it clean</a><br />
<br />
<a href="https://youtu.be/UVhxI8TT6gs">How to clean dirty water tank and clean water tank</a><br />
<br />
<a href="https://youtu.be/_G3UBra-N3o">Disassembly, clean and installation guide of mopping pad plate and mopping pad</a><br />
<br />
<a href="https://youtu.be/bOZ89nQSThU">How to deal with the Robot alarm Difficulty in running, please check the drive wheels</a><br />
<br />
<a href="https://youtu.be/EkSEw2IhebQ">How to deal with cluttered cleaning routes</a><br />
<br />
<a href="https://youtu.be/3JQreRgk90w">How to install and remove the station base</a><br />
<br />
<a href="https://youtu.be/KVos7AbX0mk">How to clean the cleaning sink</a><br />
<br />
<a href="https://youtu.be/Bmpnw5fg7OA">What can I do if the cleaning sink is full of dirty water, the voice prompts cleaning sink full</a><br />
<br />
<a href="https://youtu.be/_5IgsCEvUV4">How to deal with the robot''s voice prompting “Abnormal station cleaning sink”</a><br />
<br />
<a href="https://youtu.be/aM4B48p8_Y8">How to deal with the issue of the station not supplying hot water</a><br />
<br />
<a href="https://youtu.be/7Q0xOdx_AMg">The robot did not automatically perform cleaning work at the scheduled time</a><br />
<br />
<a href="https://youtu.be/8HkvYJpWuH4">No water coming out of the clean water tank, what should I do</a><br />
<br />
<a href="https://youtu.be/uxpJy8EJgmU">Robots sometimes can''t avoid obstacles</a><br />
<br />
<a href="https://youtu.be/nctHuOy9_1w">Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/NuvSu_aYMnU">How to deal with a robot that doesn''t perform Auto Resume</a><br />
<br />
<a href="https://youtu.be/zOVZebiBykI">Base station related functions</a><br />
<br />
<a href="https://youtu.be/7oaGWHWPaCc">How to upgrade the firmware version</a><br />
<br />
<a href="https://youtu.be/RR90jOAArjA">How to add more WIFI signals</a><br />
<br />
<a href="https://youtu.be/8ATjDVvxG2Y">How to set virtual boundaries</a><br />
<br />
<a href="https://youtu.be/xu5Hp5HhhA8">How to schedule a cleaning task</a><br />
<br />
<a href="https://youtu.be/cMyGlVPXwNk">How to set up a scenario clean</a><br />
<br />
<a href="https://youtu.be/JD_5EFtoFjk">How to create a new map</a><br />
<br />
<a href="https://youtu.be/wx9Xm_5ZCoM">How to deal with the mopping pad plate not lifting automatically</a><br />
<br />
<a href="https://youtu.be/k1EUraMm_PI">Disassembly, cleaning and installation guide of V shaped comb teeth</a><br />
<br />
<a href="https://youtu.be/yj9_MqBcNrM">How to set clean along the floor direction</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CvALEA0', 'AMR Email Templates', 'GOAT O - How to Use Videos', 'GOAT O 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/eIun45yeb28">Cleaning and Maintenance</a><br />
<br />
<a href="https://youtu.be/0xGgShOnPf0">Mapping Instructions</a><br />
<br />
<a href="https://youtu.be/S-jj84yMZmg">Mowing Operation</a><br />
<br />
<a href="https://youtu.be/CwMLU0iv_D8">Mowing Preparation</a><br />
<br />
<a href="https://youtu.be/U_b2Jpsdi_A">Network Instruction</a><br />
<br />
<a href="https://youtu.be/fBAwSogbe8s">No entry Zone Setting</a><br />
<br />
<a href="https://youtu.be/y7GS7uM9cCY">RTK Installation</a><br />
<br />
<a href="https://youtu.be/A5H67MnhYdM">Station Location and Installation</a><br />
<br />
<a href="https://youtu.be/ZSu2O7B1qTU">How to deal with E644 Issues of GOAT O series</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CvBxEAK', 'AMR Email Templates', 'GOAT A - How to Use Videos', 'GOAT A 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/GXPj_qClXZc">Cleaning and Maintenance</a><br />
<br />
<a href="https://youtu.be/Ng555tVAbIY">Mapping Instructions</a><br />
<br />
<a href="https://youtu.be/wh0So83TLMs">Mowing Operation</a><br />
<br />
<a href="https://youtu.be/bIH4N_QoBYY">Mowing preparaton</a><br />
<br />
<a href="https://youtu.be/8O5stMnrGIo">Network Instruction</a><br />
<br />
<a href="https://youtu.be/X3--zSvTAmk">No entry Zone Setting</a><br />
<br />
<a href="https://youtu.be/cC--w2xJCyY">RTK Installation</a><br />
<br />
<a href="https://youtu.be/HZfZGxGUR5A">Station Location and Installation</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CvK1EAK', 'AMR Email Templates', 'X8 - How to Use Videos', 'X8 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/rYVnDGE2xrE">How To Correctly Install The Robot</a><br />
<br />
<a href="https://youtu.be/-U1r62rTKeI">Robot Charging Guide</a><br />
<br />
<a href="https://youtu.be/e2DdRh7lzC0">Robot can''t be charged, what can I do</a><br />
<br />
<a href="https://youtu.be/sIICcX7RUUs">How to replace dust bag</a><br />
<br />
<a href="https://youtu.be/SyihnSKEorA">How to Add Cleaning Solution</a><br />
<br />
<a href="https://youtu.be/kwQtgtxBn84">Mapping Guide</a><br />
<br />
<a href="https://youtu.be/dyxAhSua45Y">How to start a mopping task</a><br />
<br />
<a href="https://youtu.be/QTGykLpl7EU">Disassembly, clean and installation Guide of side brush</a><br />
<br />
<a href="https://youtu.be/9wz8m2StXiY">Disassembly, cleaning and installation guide of V-shaped comb teeth </a><br />
<br />
<a href="https://youtu.be/lvpxMH7kAjM">Disassembly, clean and installation guide of main brush </a><br />
<br />
<a href="https://youtu.be/AbVSe1YE2uM">Disassembly, clean and installation guide of Dust bin</a><br />
<br />
<a href="https://youtu.be/2W_zXgpzaY8">Anti-drop sensors have accumulated dust, please wipe it clean.</a><br />
<br />
<a href="https://youtu.be/pFP6gabTYro">How to clean dirty water tank and clean water tank_</a><br />
<br />
<a href="https://youtu.be/8ksDrRJj0pE">How to remove and install the Roller Mop_</a><br />
<br />
<a href="https://youtu.be/7yAhPjYumfk">How to deal with the Bumper being stuck_</a><br />
<br />
<a href="https://youtu.be/nqB-AZqx2NE">How to deal with “abnormal dust bag installation”_</a><br />
<br />
<a href="https://youtu.be/7KZzkrkZCfY">How to deal with the Robot alarm _Difficulty in running, please check the drive wheels__-</a><br />
<br />
<a href="https://youtu.be/jSqNL2x7MSs">How to deal with cluttered cleaning routes</a><br />
<br />
<a href="https://youtu.be/zILEeFoLkA0">How to install and remove the base</a><br />
<br />
<a href="https://youtu.be/rDfP9do6OwQ">How to clean the cleaning sink</a><br />
<br />
<a href="https://youtu.be/Hswjpenvivo">How to deal with missed cleaning areas</a><br />
<br />
<a href="https://youtu.be/8BYCcOiEkBg">What can I do if the cleaning sink is full of dirty water, the voice prompts that the cleaning sin</a><br />
<br />
<a href="https://youtu.be/9LTRKjX9RyE">How to clean the Dirty Water Box</a><br />
<br />
<a href="https://youtu.be/IIrnvF3vsnQ">How to clean the Water Tray</a><br />
<br />
<a href="https://youtu.be/OXCuBwdhvAQ">The robot voice prompts the water tray is not installed , what should I do</a><br />
<br />
<a href="https://youtu.be/JXBEC5s5ZQc">How to deal with the issue of the station not supplying hot water</a><br />
<br />
<a href="https://youtu.be/foEQqjnYNug">The robot did not automatically perform cleaning work at the scheduled time</a><br />
<br />
<a href="https://youtu.be/XuiJnK3kZIE">How to deal with abnormal situations skew、overlapping in the map</a><br />
<br />
<a href="https://youtu.be/Se7LkYXz6qM">No water coming out of the clean water tank, what should I do</a><br />
<br />
<a href="https://youtu.be/qPNxlAZ4IEs">Robots sometimes can''t avoid obstacles</a><br />
<br />
<a href="https://youtu.be/LSe0NrIMtTs">Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/UP9wn6M0oNo">How to deal with a robot that doesn''t perform Auto Resume</a><br />
<br />
<a href="https://youtu.be/q_lXdfJDQ0k">Station functions</a><br />
<br />
<a href="https://youtu.be/GoMsa3pBJhU">How to upgrade the firmware version</a><br />
<br />
<a href="https://youtu.be/MIoJl60scfc">How to add more WIFI signals</a><br />
<br />
<a href="https://youtu.be/BNNejGyjGrE">How to set virtual boundaries</a><br />
<br />
<a href="https://youtu.be/gw037fEtuLI">How to schedule a cleaning task</a><br />
<br />
<a href="https://youtu.be/_fD9d4gO2Zk">How to set up a scenario clean</a><br />
<br />
<a href="https://youtu.be/VtTeO9GeIEI">How to create a new map</a><br />
<br />
<a href="https://youtu.be/nFbREzvcPIA">The roller mop component can''t expand outwards, what can I do</a><br />
<br />
<a href="https://youtu.be/dhe9VzZuHEk">How to turn on the YIKO function</a><br />
<br />
<a href="https://youtu.be/2d4oU3n_usk">How to turn on off Child Lock</a><br />
<br />
<a href="https://youtu.be/EvhYqRbbC0Y">How to set cleaning order</a><br />
<br />
<a href="https://youtu.be/WDs6_dLVubs">How to deal with loud abnormal noises from the robot</a><br />
<br />
<a href="https://youtu.be/5A7qv-PjuUQ">How to deal with the alarm ''dirty water box abnormality''</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CvNFEA0', 'AMR Email Templates', 'N30 PRO OMNI - How to Use Videos', 'N30 PRO OMNI 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/zOwBAJinUfg">How to correctly install the robot</a><br />
<br />
<a href="https://youtu.be/ZeFMT8RN-IU">Robot Charging Guide</a><br />
<br />
<a href="https://youtu.be/VwSiTkYIJmY">Robot Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/U9J-wvaNvbI">Robot can''t be charged, what can I do</a><br />
<br />
<a href="https://youtu.be/4ZmvL9lmH_4">How to replace dust bag</a><br />
<br />
<a href="https://youtu.be/tKSRG9590YI">Mapping Guide</a><br />
<br />
<a href="https://youtu.be/hSGdr9MzSuQ">How to start a mopping task</a><br />
<a href="https://youtu.be/O2Zs6MpWt-k">Base station related functions</a> <a href="https://youtu.be/cwpGm3xa5fU">Disassembly, clean and installation Guide of side brush</a><br />
<br />
<a href="https://youtu.be/Rd6QQcGNnaM">Disassembly, clean and installation guide of main brush</a><br />
<br />
<a href="https://youtu.be/6wXNmzcYpfA">Disassembly, clean and installation guide of Dust bin</a><br />
<br />
<a href="https://youtu.be/PpI72gTQPak">Anti drop sensors have accumulated dust, please wipe it clean</a> <a href="https://youtu.be/qfDMtHpFJy0">How to clean dirty water tank and clean water tank</a><br />
<br />
<a href="https://youtu.be/59QLQtd8Ik8">Mopping pad plates and washable mopping pads disassembly and clean guide</a><br />
<br />
<a href="https://youtu.be/m9hpCKMuWmA">How to deal with the Robot alarm Difficulty in running, please check the drive wheels</a><br />
<br />
<a href="https://youtu.be/6BAE4Y3gUqs">How to deal with cluttered cleaning routes</a><br />
<br />
<a href="https://youtu.be/6qMnRO3D--U">How to install and remove the station base</a><br />
<br />
<a href="https://youtu.be/Ta8qaN5Cdvk">How to clean the cleaning sink</a><br />
<br />
<a href="https://youtu.be/WH0bxHh34E8">How to deal with the situation that robot misses cleaning some areas</a><br />
<br />
<a href="https://youtu.be/TbJazqoly-A">What can I do if the mopping pad plates can''t be lifted automatically</a><br />
<br />
<a href="https://youtu.be/-47eAbKweL4">What can I do if the cleaning sink is full of dirty water</a> ​​​​​​​<a href="https://youtu.be/liXBbuzgVew">How to deal with the robot''s voice prompting “Abnormal station cleaning sink”</a><br />
<br />
<a href="https://youtu.be/AMEQrVp_seg">How to deal with the issue of the station not supplying hot water</a><br />
<br />
<a href="https://youtu.be/bDO8RHZvCCs">How to install and use the solid floor cleaner</a><br />
<br />
<a href="https://youtu.be/b6TVK0fzQSQ">How to start spot cleaning</a><br />
<br />
<a href="https://youtu.be/NjZRbWCSixw">Laser sensor abnormality, how to deal with it</a><br />
<br />
<a href="https://youtu.be/WKZ0b3SxSDM">The robot did not automatically perform cleaning work at the scheduled time</a><br />
<br />
<a href="https://youtu.be/nKmOfgJvFT4">How to execute staion self clean</a><br />
<br />
<a href="https://youtu.be/zjOSWw8TiX8">How to upgrade the firmware version</a><br />
<br />
<a href="https://youtu.be/XOAv88MO3b0">How to add more WIFI signals</a><br />
<br />
<a href="https://youtu.be/mJjjmEOeX4U">What can I do if the mopping pad plate can not expand outward naturally</a> ​​​​​​​<a href="https://youtu.be/dbYJSEBeriw">How to set virtual boundaries</a><br />
<br />
<a href="https://youtu.be/iT5uk3ojkyk">How to schedule a cleaning task</a><br />
<br />
<a href="https://youtu.be/ocXz5tj6NyQ">How to set up a scenario clean</a><br />
<br />
<a href="https://youtu.be/mEdJk6kYlD8">How to restore the robot to factory settings</a><br />
<br />
<a href="https://youtu.be/uNS7BIF13D0">How to create a new map</a><br />
<br />
<a href="https://youtu.be/Mt0YhrCISBA">How to deal with abnormal situationsskew、overlapping in the map</a><br />
<br />
<a href="https://youtu.be/skyT4nbPGa0">What to do if the robot does not excute Auto Resume</a><br />
<br />
<a href="https://youtu.be/TliqV2haRT8">How to turn on Child Lock</a><br />
<br />
<a href="https://youtu.be/v7AqT3eRaCI">No water coming out of the clean water tank, what should I do</a><br />
<br />
<a href="https://youtu.be/PvsKtTXYp8U">Robots sometimes can''t avoid obstacles</a> ​​​​​​​<br />
<br />
&nbsp;</body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CvVJEA0', 'AMR Email Templates', 'T50 - How to Use Videos', 'T50 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/0rtie6KvsRM">How to correctly install the robot</a><br />
<br />
<a href="https://youtu.be/UjpuB8FEDBA">Robot Charging Guide</a><br />
<br />
<a href="https://youtu.be/FOEKhne1bMg">Robot can''t be charged, what can I do</a><br />
<br />
<a href="https://youtu.be/Ue7uEnjCg78">How to replace dust bag</a><br />
<br />
<a href="https://youtu.be/w5CR7ibp1n0">Mapping Guide</a><br />
<br />
<a href="https://youtu.be/1qk0EzJ66DY">How to start a mopping task</a><br />
<br />
<a href="https://youtu.be/7ZyDBrwSTM4">Disassembly, clean and installation Guide of side brush</a><br />
<br />
<a href="https://youtu.be/I-jluGYdzXU">Disassembly, clean and installation guide of main brush</a><br />
<br />
<a href="https://youtu.be/xgNgB3L1ZhI">Disassembly, clean and installation guide of Dust bin</a><br />
<br />
<a href="https://youtu.be/O8RI-STwcyY">Anti-drop sensors have accumulated dust, please wipe it clean.</a><br />
<br />
<a href="https://youtu.be/2504zk3uEqA">How to clean dirty water tank and clean water tank</a><br />
<br />
<a href="https://youtu.be/J3SGh5VrfHY">Disassembly, clean and installation guide of mopping pad plate and mopping pad</a><br />
<br />
<a href="https://youtu.be/oAmaEpsL7Qk">How to deal with the Robot alarm Difficulty in running, please check the drive wheels</a><br />
<br />
<a href="https://youtu.be/B2EamqGGr7g">How to deal with cluttered cleaning routes</a><br />
<br />
<a href="https://youtu.be/8BveYgZXlJg">How to install and remove the station base</a><br />
<br />
<a href="https://youtu.be/IhiIsZQrfM0">How to clean the cleaning sink</a><br />
<br />
<a href="https://youtu.be/OhlcLeBnL54">What can I do if the cleaning sink is full of dirty water, the voice prompts that the cleaning sin</a><br />
<br />
<a href="https://youtu.be/OhWG_UDisU0">How to deal with the robot''s voice prompting “Abnormal station cleaning sink”</a><br />
<br />
<a href="https://youtu.be/nLzrjDSCMhQ">How to deal with the issue of the station not supplying hot water</a><br />
<br />
<a href="https://youtu.be/uD4WkPoUco4">Laser sensor abnormality, how to deal with it</a><br />
<br />
<a href="https://youtu.be/VEZ8B5eSVs8">The robot did not automatically perform cleaning work at the scheduled time</a><br />
<br />
<a href="https://youtu.be/n6PHAfeEbQ0">How to deal with abnormal situationsskew、overlapping in the map</a><br />
<br />
<a href="https://youtu.be/TQPn-lWq2Hk">No water coming out of the clean water tank, what should I do</a><br />
<br />
<a href="https://youtu.be/ERhwq2unatM">Robots sometimes can''t avoid obstacles</a><br />
<br />
<a href="https://youtu.be/gfjnoG2EqX0">Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/SxihXwhN2yM">Base station related functions</a><br />
<br />
<a href="https://youtu.be/K2OFcAlTOCU">How to upgrade the firmware version</a><br />
<br />
<a href="https://youtu.be/qUy1_vG3JtU">How to add more WIFI signals</a><br />
<br />
<a href="https://youtu.be/wmgfdd3SJWA">How to set virtual boundaries</a><br />
<br />
<a href="https://youtu.be/ebjav_qfWLY">How to schedule a cleaning task</a><br />
<br />
<a href="https://youtu.be/zOaKZJAGhxg">How to set up a scenario clean</a><br />
<br />
<a href="https://youtu.be/zOaKZJAGhxg">How to create a new map</a><br />
<br />
<a href="https://youtu.be/WICJ4eHs3Pw">How to deal with the mopping pad plate not lifting automatically</a><br />
<br />
<a href="https://youtu.be/PSqm6LXI8G8">Disassembly, cleaning and installation guide of V shaped comb teeth</a><br />
<br />
<a href="https://youtu.be/itW96GIqJ_Q">How to set clean along the floor direction</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006Cva9EAC', 'AMR Email Templates', 'N20e - How to Use Videos', 'N20e 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/6PfLJH0w4zk">How to correctly install the robot</a><br />
<br />
<a href="https://youtu.be/8SOm4-0PabA">Robot Charging Guide</a><br />
<br />
<a href="https://youtu.be/41LM_Ck9nyY">Robot Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/o83DsdbmW0E">Robot can''t be charged, what can I do</a><br />
<br />
<a href="https://youtu.be/y5rC1zOXoP4">How to create a map</a><br />
<br />
<a href="https://youtu.be/XIi_5nu6LgA">How to start a mopping task</a><br />
<br />
<a href="https://youtu.be/58e0VzYxKNM">Disassembly, clean and installation guide of mopping pad plate and mopping pad</a><br />
<br />
<a href="https://youtu.be/lGIumk-0g2I">What to do if the reservoir doesn''t seep</a><br />
<br />
<a href="https://youtu.be/J9MbBlo0-to">Disassembly, clean and installation Guide of side brush</a><br />
<br />
<a href="https://youtu.be/uWivBhl-9p0">Disassembly, clean and installation guide of main brush</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CviDEAS', 'AMR Email Templates', 'N20 COMBO - How to Use Videos', 'N20 COMBO 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/4pQBgLCwdpk">How to correctly install the robot</a><br />
<br />
<a href="https://youtu.be/txSy0L5GHM0">Robot Charging Guide</a><br />
<br />
<a href="https://youtu.be/3mCpE0e1Abc">Robot Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/HpkUQybuAOs">Robot can''t be charged, what can I do</a><br />
<br />
<a href="https://youtu.be/8nqiO4RGki8">Mapping Guide</a><br />
<br />
<a href="https://youtu.be/8VAue_EWJSA">Disassembly, clean and installation Guide of side brush</a><br />
<br />
<a href="https://">Disassembly, clean and installation guide of brush</a><br />
<br />
<a href="https://youtu.be/7HBSPn1sTM8">Disassembly, clean and installation guide of dust binnew</a><br />
<br />
<a href="https://youtu.be/5pI_dBS0uFY">Anti drop sensors have accumulated dust, please wipe it clean</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CvqHEAS', 'AMR Email Templates', 'T30S COMBO - How to Use Videos', 'T30S COMBO	使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/DRuvTSeJuF8">T30 COMBO How to correctly install the robot</a><br />
<br />
<a href="https://youtu.be/AgK5LRrcXXE">T30S COMBO Robot Charging Guide</a><br />
<br />
<a href="https://youtu.be/0Weq4vvlLho">T30S COMBO Robot Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/rTDnPDDv2qc">T30S COMBORobot can''t be charged, what can I do</a><br />
<br />
<a href="https://youtu.be/j791Bc4IdL0">T30S COMBO How to replace dust collection bag</a><br />
<br />
<a href="https://youtu.be/tWQ6jYguk3I">T30S COMBO Mapping Guide</a><br />
<br />
<a href="https://youtu.be/RpjkUomvGFc">T30S COMBO Start Cleaning Guide</a><br />
<br />
<a href="https://youtu.be/I9Sh8eciEd8">T30S COMBO Disassembly, clean and installation Guide of side brush</a><br />
<br />
<a href="https://youtu.be/IWt4FtmzmPA">T30S COMBO Disassembly, clean and installation guide of main brush</a><br />
<br />
<a href="https://youtu.be/wdGchKMn3fU">T30S COMBO Disassembly, clean and installation guide of Dust bin</a><br />
<br />
<a href="https://youtu.be/6WDfxK8Nza0">T30S COMBO Anti drop sensors have accumulated dust, please wipe it clean</a><br />
<br />
<a href="https://youtu.be/V_Xb3rWzG5w">T30S COMBO How to clean dirty water tank and clean water tank</a><br />
<br />
<a href="https://youtu.be/erniY5-EgG8">T30S COMBO Mopping pad plates and washable mopping pads disassembly and clean guide</a><br />
<br />
<a href="https://youtu.be/iVOSZRWPrVk">T30S COMBO How to deal with the machine alarm Difficulty in running, please check the drive wheels</a><br />
<br />
<a href="https://youtu.be/zMPGdh3cL20">T30S COMBO How to deal with cluttered cleaning routes</a><br />
<br />
<a href="https://youtu.be/LUYpcsi3xKo">T30S COMBO How to install and remove the base</a><br />
<br />
<a href="https://youtu.be/WrN4BfqqbPU">T30S COMBO How to clean the cleaning sink</a><br />
<br />
<a href="https://youtu.be/ReRHyeMFtRg">T30S COMBO How to deal with the situation that robot misses cleaning some areas</a><br />
<br />
<a href="https://youtu.be/umnLu09fRm8">T30S COMBO What can I do if the mopping pad plates can''t be lifted automatically</a><br />
<br />
<a href="https://youtu.be/2Pgo7lFTHyc">T30S COMBO What can I do if the cleaning sink is full of dirty water </a><br />
<br />
<a href="https://youtu.be/IObbQZiwFmc">T30S COMBO How to deal with the issue of the station not supplying hot water</a><br />
<br />
<a href="https://youtu.be/LEce2zC7KAU">T30S COMBO How to start spot cleaning</a><br />
<br />
<a href="https://youtu.be/FUMv2hCCeb4">T30S COMBO Laser sensor abnormality, how to deal with it</a><br />
<br />
<a href="https://youtu.be/64gJsWsAJk8">T30S COMBO How to execute staion self clean</a><br />
<br />
<a href="https://youtu.be/ZOTQmRbAFds">T30S COMBO How to turn on the Foot Touch Crontrol function</a><br />
<br />
<a href="https://youtu.be/JP_SlsWd8Gk">T30S COMBO How to upgrade firmware version</a><br />
<br />
<a href="https://youtu.be/UMbk0xQNoqU">T30S COMBO How to change cleaning modes</a><br />
<br />
<a href="https://youtu.be/BAgJX16_B84">T30S COMBO How to add more WIFI signals</a><br />
<br />
<a href="https://youtu.be/LNhWsuKfkQs">T30S COMBO How to turn on YIKO voice assistant</a><br />
<br />
<a href="https://youtu.be/OxE7RvyG75o">T30S COMBO How to turn on TruEdge Adaptive Edge Mopping function？</a><br />
<br />
<a href="https://youtu.be/2HJEpULKbx4">T30S COMBO How to set virtual boundaries</a><br />
<br />
<a href="https://youtu.be/So7r-ivlvYg">T30S COMBO How to schedule a cleaning task</a><br />
<br />
<a href="https://youtu.be/gsmauIVzkSA">T30S COMBO Tips for Using the Storage Box for Brushes</a><br />
<br />
<a href="https://youtu.be/ZuDdfL8XLFc">T30S COMBO How do I remove and clean the mini power brush</a><br />
<br />
<a href="https://youtu.be/-7aWX4oYBL4">T30S COMBO ZeroTangle Power Brush Disassembly and Cleaning</a><br />
<br />
<a href="https://youtu.be/Bd62Wo01Tec">T30S COMBO How to disassemble and clean the Handheld Vaccum Cleaner''s Dustbin</a><br />
<br />
<a href="https://youtu.be/vvAtMxAS18U">T30S COMBO How to disassemble and clean the HEPA filter</a><br />
<br />
<a href="https://youtu.be/99fHI6Abv9Q">T30S COMBO How to charge the handheld vacuum cleaner</a><br />
<br />
<a href="https://youtu.be/9_jrHCTtNgE">T30S COMBO How to install ZeroTangle Power Brush holder</a><br />
<br />
<a href="https://youtu.be/Oa9a0RS1Yfw">T30S COMBO How to install ZeroTangle Power Brush</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006CwG5EAK', 'AMR Email Templates', 'T30S - How to Use Videos', 'T30S 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/jxd7Ob9uMoo">T30S How to correctly install the robot</a><br />
<br />
<a href="https://youtu.be/sTPWUBc3tEA">T30S Robot Charging Guide</a><br />
<br />
<a href="https://youtu.be/z3fXd_lx0So">T30S Robot Network Connection Guide</a><br />
<br />
<a href="https://youtu.be/b1JBAo5Q6uk">T30S Robot can''t be charged, what can I do</a><br />
<br />
<a href="https://youtu.be/lc305yKMMbg">T30S How to replace dust collection bag</a><br />
<br />
<a href="https://youtu.be/6xerJAGZaLo">T30S Mapping Guide</a><br />
<br />
<a href="https://youtu.be/pyLK3_U4HAM">T30S Start Cleaning Guide</a><br />
<br />
<a href="https://youtu.be/G37l-CixDPY">T30S Disassembly, clean and installation Guide of side brush</a><br />
<br />
<a href="https://youtu.be/pdf9zfLRUzU">T30S Disassembly, clean and installation guide of main brush</a><br />
<br />
<a href="https://youtu.be/OjfG5FjrFSg">T30S Disassembly, clean and installation guide of Dust bin</a><br />
<br />
<a href="https://youtu.be/rWlCM4JL7-A">T30S Anti drop sensors have accumulated dust, please wipe it clean</a><br />
<br />
<a href="https://youtu.be/6wTa2-suYzo">T30S How to clean dirty water tank and clean water tank</a><br />
<br />
<a href="https://youtu.be/eCbeilDJd9Y">T30S Mopping pad plates and washable mopping pads disassembly and clean guide</a><br />
<br />
<a href="https://youtu.be/xAdveRfSNH8">T30S How to deal with the machine alarm Difficulty in running, please check the drive wheels</a><br />
<br />
<a href="https://youtu.be/7K1b-SNvICE">T30S How to deal with cluttered cleaning routes</a><br />
<br />
<a href="https://youtu.be/3ZzLYNEMgC4">T30S How to install and remove the base</a><br />
<br />
<a href="https://youtu.be/1kavJJpOyk4">T30S How to clean the cleaning sink</a><br />
<br />
<a href="https://youtu.be/OrRvK4L3kl8">T30S How to deal with the situation that robot misses cleaning some areas</a><br />
<br />
<a href="https://youtu.be/gQQeFx3wvBg">T30S What can I do if the mopping pad plates can''t be lifted automatically</a><br />
<br />
<a href="https://youtu.be/M8twZqg3vL0">T30S What can I do if the cleaning sink is full of dirty water</a><br />
<br />
<a href="https://youtu.be/1niSORXlfyo">T30S How to deal with the issue of the station not supplying hot water</a><br />
<br />
<a href="https://youtu.be/7pMxupMY8Go">T30S How to start spot cleaning</a><br />
<br />
<a href="https://youtu.be/93JobbW1_RI">T30S Laser sensor abnormality, how to deal with it</a><br />
<br />
<a href="https://youtu.be/UglJLGbve4c">T30S How to execute staion self clean</a><br />
<br />
<a href="https://youtu.be/SSlT627kpts">T30S How to turn on the Foot Touch Crontrol function</a><br />
<br />
<a href="https://youtu.be/0C_VtHZU4ho">T30S How to upgrade firmware version</a><br />
<br />
<a href="https://youtu.be/fRtSxtLxk-Y">T30S How to change cleaning modes</a><br />
<br />
<a href="https://youtu.be/AUV-X5XhrXQ">T30S How to add more WIFI signals</a><br />
<br />
<a href="https://youtu.be/Ejq405Fqowk">T30S How to turn on YIKO voice assistant</a><br />
<br />
<a href="https://youtu.be/xefKGsAYd8E">T30S How to turn on TruEdge Adaptive Edge Mopping function？</a><br />
<br />
<a href="https://youtu.be/iF_jGW8DZ9g">T30S How to set virtual boundaries</a><br />
<br />
<a href="https://youtu.be/_ZlkZbuwG1g">T30S How to schedule a cleaning task</a></body>
</html>', 'ni cynthia', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006DR5OEAW', 'AMR Email Templates', 'Disable holiday-themed push notifications via app', '关闭节日主题（单次/长期）', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>If you would prefer not to see the holiday-themed display/theme in the app, there are two simple ways to disable it:<br />
<br />
<strong>One-time disable</strong><br />
After the event theme is applied, the app will notify you on the homepage, letting you know that the theme has been switched to a personalized one. You can simply click on this notification and select "Dismiss This Theme" to turn off the current holiday theme for this session.<br />
<img alt="App 4" src="https://ecovacs2020.file.force.com/file-asset-public/App_41?oid=00D2x000005pVxV" style="max-width: 1417.24px; width: 325.996px; height: 735.898px;" title="App 4" /><br />
<br />
<strong>Permanent disable</strong><br />
For a longer-term solution, go to <strong>Me &gt; Settings &gt; Personalized Ambiance</strong> within the app. You can turn off the toggle for the holiday theme here. Once disabled, the holiday-themed features will no longer appear throughout the app.</p>

<p><img alt="App 1" src="https://ecovacs2020.file.force.com/file-asset-public/App_12?oid=00D2x000005pVxV" style="max-width: 1417.244140625px" title="App 1" /><br />
<img alt="App 2" src="https://ecovacs2020.file.force.com/file-asset-public/App_22?oid=00D2x000005pVxV" style="max-width: 1417.244140625px" title="App 2" /><br />
<br />
<img alt="App 3" src="https://ecovacs2020.file.force.com/file-asset-public/App_32?oid=00D2x000005pVxV" style="max-width: 1417.244140625px" title="App 3" /><br />
<br />
We hope this makes your app experience more comfortable! If you have any questions or need further assistance, feel free to reach out.</p>
</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006F8WTEA0', 'AMR Email Templates', 'Unsubscribe Promotion Letter (Webstore)', '取消广告邮件订阅', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please refer to the instructions below on how to unsubscribe:<br />
<img alt="inline99719956" src="https://ecovacs2020.file.force.com/file-asset-public/inline99719956?oid=00D2x000005pVxV" style="max-width: 657.029px; width: 403px; height: 243px;" title="inline99719956" /></body>
</html>', 'Steve', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006Ffc5EAC', 'AMR Email Templates', 'VIP Circle', 'Internal Use Only', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for reaching out to Ecovacs Robotics.<br />
<br />
For any inquiries related to the VIP Circle, please contact Rob at rob@zuberance.com.<br />
<br />
We truly value your business, and it has been a pleasure assisting you.</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G0WtEAK', 'AMR Email Templates', 'N79 Series: How to reset', 'N79系列： 如何重置', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Here are the steps for resetting the N79 series:<br />
<br />
<br />
1. Place the Deebot on the charging dock. Turn <strong>off </strong>the main power switch, and after 5 seconds, turn it on again. Press the auto button. Make sure the blue light is on.&nbsp;<br />
2. Press and <strong>hold down the Auto button</strong> until you hear one initial beep, then three beeps.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G0ewEAC', 'AMR Email Templates', '(Old)Cannot start working / Auto Mode Button flashes but DEEBOT does not work', '(针对旧型号) 地宝不能启动/AUTO 键闪灯但是不开始工作', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Push the Power Switch back and forth 2-3 times, and finally push it to ''I'' for ON.&nbsp;<br />
2. Charge the Deebot for at least 4 hours.<br />
3. After starting, observe the AUTO Mode Button light display: white light is white, and solid-there is electricity: shortly press the AUTO Mode Button intermittently, the red light is solid for 2-3 seconds. No light display, low battery, or no battery:&nbsp;</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G1RMEA0', 'AMR Email Templates', 'Change Dual Frequency Router', '转换双线的路由器', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">If it refers to a dual-frequency router, please follow the steps below.<br />
<br />
1. Two Wi-Fi signals will be emitted, one is 2.4GHz and the other is 5GHz. Our machine does not support the 5GHz frequency band. It is suggested that you turn off 5GHz first when entering the router setting interface and then turn it on after a successful connection.<br />
<br />
2. Generally, the wireless network''s name suffix with 5GHz is 5GHz frequency band. You can be connected to the 5GHz frequency band on cellphone first, turn on open the cellphone network Settings interface, click on the exclamation mark at the right of the 5GHz network, select to remove or ignore this network in the pop-up box (may vary on the different router), to prevent the cellphone automatically connect to 5GHz network when networking.<br />
<br />
3. An IP address or management page will be found at the bottom of each router, e.g. 192.168.1.1. Input this URL into the computer browser or mobile browser to enter the router setting interface.<br />
<br />
4. Find the Wi-Fi setting interface in the router setting interface. In the case of dual-frequency combination, select 2.4GHz only.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G5I2EAK', 'AMR Email Templates', 'Charging tips for DEEBOT (For Older Models)', '充电小提醒 (针对旧型号)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">The machine needs to be switched on and charged, and it will be fully charged in 4-6 hours. After the cleaning is finished, let it return to the Charging Dock (the power supply of the Charging Dock does not need to be switched off). If it is not used for a long time, please fully charge the machine before turning off the Power Switch to save, and insist on recharging it every 3 months to prevent over-discharge of the battery.<br />
<br />
&nbsp;</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G5UwEAK', 'AMR Email Templates', 'T8/N8 Ozmo Water Tank No Water Seepage/Ozmo水箱不排水', 'T8/N8 Ozmo水箱不排水', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Check and make sure the robot''s water outlet on the bottom is clean, and nothing is blocked. Sometimes it gets dusty without us noticing it.<br />
<img alt="ozmo water tank hole" src="https://ecovacs2020.file.force.com/file-asset-public/ozmo_water_tank_hole?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="ozmo water tank hole" /><br />
<img alt="1" src="https://ecovacs2020.file.force.com/file-asset-public/X11111111113?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="1" /><br />
2. Check the reservoir''s outlet by fully pressing the button on it (black plastic mechanism found on the side of the reservoir) to check if it is dispensing water.<br />
<img alt="2" src="https://ecovacs2020.file.force.com/file-asset-public/X225081813500023626?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="2" /><br />
3. Unscrew/open the blue lid of the water tank. If the outlet is clogged, please fill the reservoir with warm water, then give it a brisk shake for 1 minute.<br />
<img alt="3" src="https://ecovacs2020.file.force.com/file-asset-public/X3384?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="3" /><br />
4. If the reservoir runs out of water. Add water to the Reservoir.<br />
<img alt="4" src="https://ecovacs2020.file.force.com/file-asset-public/X445?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="4" /><br />
5. Make sure the water tank is installed in the right position of the machine, and the contact pins are touching the machine.<br />
<img alt="5" src="https://ecovacs2020.file.force.com/file-asset-public/X536?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="5" /><br />
6. After confirming the installation of the water tank and the Cleaning Cloth Plate(Mopping plate), you will hear the voice prompt "Mopping Plate has been installed" / the startup prompt "The mopping work has been started". If there is no prompt:<br />
6.1. Check whether the cleaning cloth plate is firmly locked.<br />
6.2. Check if the small magnet falls off. (Test with coins)</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G6fVEAS', 'AMR Email Templates', 'X2 Empty Internal Water Tank 排空内置水箱', 'X2 排空内置水箱', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>Empty the Built-in Water Tank:</strong>
<ul>
	<li>Navigate to the ''Robot Settings'' in your Deebot''s app.</li>
	<li>Once in ''Robot Settings'', tap on the title<strong>&nbsp;"General Settings(if the app is updated)"</strong>&nbsp;10 times. This action will enable the ''One-tap Drain'' function, allowing you to efficiently empty the built-in water tank.</li>
	<li>Ensure that all the water is completely drained from the tank.</li>
</ul>
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image12?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="image" /><img alt="20251230-083829" src="https://ecovacs2020.file.force.com/file-asset-public/X20251230083829?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="20251230-083829" /><img alt="20251230-083943" src="https://ecovacs2020.file.force.com/file-asset-public/X20251230083943?oid=00D2x000005pVxV" style="max-width: 666.5437499999999px" title="20251230-083943" /></body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7BlEAK', 'AMR Email Templates', 'Dust comes out from DEEBOT (旧型号)', '地宝运作时掉尘出来 (旧型号适用)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Remove the Side Brushes, clean the Side Brushes and their slot, pay attention to the color of the Side Brushes, and the slot when installing.<br />
<br />
2. Remove the Main Brush Cover, remove the Main Brush, and remove the accessories at both ends to clean up. All four sides of the Main Brush Cover need to be stuck in place when installing.<br />
<br />
3. Clean the dust suction port, Dust Bin, and Filter components. (If the Dust Bin is washed with water, please make sure it is completely dry before using.)<br />
<br />
4. Check whether the baffle at the suction port of the Dust Bin is missing or stuck.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7JpEAK', 'AMR Email Templates', 'U2 series dust bin drop 尘盒掉落', 'U2系列 尘盒掉落', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">*Kindly confirm if the dust bin is installed properly (Successfully installed will hear ''click'' sound)<br />
*Reference pictures as below<br />
<img alt="inline309183371" src="https://ecovacs2020.file.force.com/file-asset-public/inline309183371?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="inline309183371" /><img alt="inline-1341064985" src="https://ecovacs2020.file.force.com/file-asset-public/inline1341064985?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="inline-1341064985" /></body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7N3EAK', 'AMR Email Templates', 'GOAT  A & O Series Blade Issue (Installation)', 'GOAT A & O 系列刀盘问题(确认安装)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We regret to hear that you are experiencing issues with your GOAT.<br />
<br />
To help resolve the problem, we recommend trying the following steps:
<ol>
	<li>Check if any grass or debris is blocking the blades or blade disc.</li>
	<li>Remove and reinstall the blades and blade disc.</li>
	<li>Restart the machine.</li>
</ol>
<strong>Maintenance Video References:</strong><br />
Goat A series: <a href="https://youtu.be/GXPj_qClXZc">https://youtu.be/GXPj_qClXZc</a><br />
Goat O series: <a href="https://youtu.be/eIun45yeb28">https://youtu.be/eIun45yeb28</a><br />
<br />
​​​​​​​We hope this helps! Let us know if the issue persists or if you need any additional support</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7YLEA0', 'AMR Email Templates', 'T8/N8 Self Empty Station Not picking up the dust', 'T8/N8 AES 基站不能成功集尘', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">* Please kindly check whether the lids have not been removed yet (underneath the dust bin and auto-empty station inlet). If so, please kindly remove the lids with the key.<br />
<br />
<img alt="inline-1866600104" src="https://ecovacs2020.file.force.com/file-asset-public/inline1866600104?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 423px; height: 246px;" title="inline-1866600104" /><img alt="inline1273776254" src="https://ecovacs2020.file.force.com/file-asset-public/inline1273776254?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="inline1273776254" /><br />
* Please kindly install the black dust bin.<br />
* Please kindly confirm whether the dust bag is well secured.<br />
<img alt="inline-1265104522" src="https://ecovacs2020.file.force.com/file-asset-public/inline1265104522?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="inline-1265104522" /><br />
* Kindly check whether there is anything blocking the evaluation tube. If so, please kindly use a screwdriver to unscrew that and clean it with the Multi Cleaning tool.<br />
<img alt="inline1727241345" src="https://ecovacs2020.file.force.com/file-asset-public/inline1727241345?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="inline1727241345" /><br />
* Kindly check whether there is anything blocking the intake.<br />
* Kindly check if the auto-empty outlet is jammed; if so, please kindly loosen the outlet.<br />
<img alt="inline1844276838" src="https://ecovacs2020.file.force.com/file-asset-public/inline1844276838?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="inline1844276838" /><br />
* Please kindly check whether the Do Not Disturb mode is enabled.<br />
* Kindly maintain the dust bag every 30 days, and if you have a lovely pet at home, we suggest changing it more frequently.<br />
* Kindly change the power outlet and retry again.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7bZEAS', 'AMR Email Templates', 'How to reset M80/M81', 'M80/M81 如何重置地宝', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">There is a reset button under the cover of the Deebot. Attached is the reset button marked in red for your reference.&nbsp;<br />
&nbsp;<br />
&nbsp;Here are the steps for resetting:&nbsp;<br />
<br />
1. Turn on the auto button and make sure the blue light is on.&nbsp;<br />
<br />
2. Please find a sharp tool, like a needle, and insert it into the hole. Press and hold down the reset button until it beeps 3 times.&nbsp;<br />
<img alt="inline1887335017" src="https://ecovacs2020.file.force.com/file-asset-public/inline1887335017?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="inline1887335017" /></body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7dBEAS', 'AMR Email Templates', 'Inquiries for the products not yet available', '客人提前询问还没有上架的型号', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you so much for your interest in Ecovacs.<br />
<br />
Currently, we are still waiting for the updates from our dedicated team on when (Insert the Model) will be available, and at this moment, we have not yet confirmed the date of release. It is recommended to stay tuned or subscribe to the newsletter of our official website for further updates.<br />
<br />
Thank you once again for your patience, and looking forward to you being a part of the Ecovacs family.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7enEAC', 'AMR Email Templates', '(Old) Fail to climb slope', '(针对旧型号) 爬坡失败', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">The climbing of the machine is generally within 1-2 cm (different types of climbing are not the same), and only a 15-degree slope machine can pass smoothly. If the machine has a mopping component installed, the climbing ability may be affected; it is recommended to try a thin mat with a higher slope.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7i1EAC', 'AMR Email Templates', 'Models for Ecovacs Home or Ecovacs 2017 App', '确认Ecovacs Home 和 Ecovacs 2017 可控型号', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Ecovacs has two apps:&nbsp;<strong>ECOVACS HOME</strong> and <strong>DEEBOT 2017</strong><br />
<br />
All are available in the Google Play and Apple IOS App Store.<br />
<br />
The ECOVACS HOME App controls the:<br />
<strong>All New models released after 2019<br />
<br />
Some Older Models:&nbsp;</strong><br />
DEEBOT 500<br />
DEEBOT N79<br />
DEEBOT N79S / N79SE / N79W<br />
DEEBOT 900 / 901 / 907<br />
OZMO 920 / 950<br />
OZMO 960 with AIVI<br />
OZMO 930 / 937<br />
OZMO 601 / 610<br />
DEEBOT 600 / 601<br />
DEEBOT 710 / 711<br />
DEEBOT Slim 2 / Slim Neo<br />
Deebot Mini 2<br />
<br />
The <strong>DEEBOT 2017 App </strong>controls&nbsp;<br />
<br />
DEEBOT M88 / M87<br />
DEEBOT R95<br />
DEEBOT R96<br />
DEEBOT R98</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7jdEAC', 'AMR Email Templates', 'Explained Factory Renew Replacement', '解释什么是“”官翻机“”', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">A product that has been tested, and certified by the original manufacturer to be in perfect working condition. The manufacturer puts them through a comprehensive process and runs tests to check for functionality and quality. It may not be in original retail packaging but will be packaged with original accessories, with a warranty backed by the manufacturer.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7lFEAS', 'AMR Email Templates', 'Recycle Machine Inquiry (IFix)', '需要回收机器 (IFix)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">For the recycle machine inquiry, we would be happy to provide you with a referral to an ECOVACS-approved repair center- iFixRobot for further consultation. Kindly reach out to iFixRobot customer service, and they will assist you with the recycling service procedure. Contact information is below:<br />
<br />
Email address: <a href="service@ifixrobot.com">service@ifixrobot.com</a><br />
Tool Free: 1-855-349-7626/ 1-855-FIX-ROBOT</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7q5EAC', 'AMR Email Templates', '(Old)How To Use DEEBOT Without Wi-Fi Connection', '(针对旧型号) 不联网怎么用', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">If your device is equipped with networking capabilities but you do not have a Wi-Fi connection at home, you may activate the Auto Mode by simply pressing the dedicated Auto Mode Button on the device.<br />
<br />
For advanced features that require connectivity—such as scheduling automated cleaning tasks—we recommend temporarily connecting to the device via your mobile hotspot. Should you need to adjust scheduled tasks in the future, you may reconnect to the hotspot as needed.<br />
<br />
<strong>Important Note:</strong><br />
The device will appear offline once the hotspot is disabled.<br />
Rest assured, the absence of an internet connection will not impact the device’s core functionality.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7rhEAC', 'AMR Email Templates', '(Old) How to Maintain Winbot', '(旧)窗宝日常维护', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">1. Use the cleaning cloth to clean the fan outlet.<br />
2. Wheels at conner: Use a clean cloth to clean the 4 wheels are conner regularly.<br />
3. Ball sensor: use the clean cloth to clean the 4 ball sensors regularly.<br />
4 . Squeegee: use clean cloth to clean the squeegee to make sure it''s clean.<br />
5. Driving wheels: Use the ''↑'' and ''↓'' key on the remote control to rotate the driving wheel and clean it if there''s any obstacle on the rubber belt.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006G7tJEAS', 'AMR Email Templates', 'Reconfirm Puerto Rico Address', '再次确认波多黎哥地址', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you so much for the information provided.<br />
<br />
Please kindly help us to double confirm the address in the following format before we initiate the shipping label, and let us know if there is any correction needed:<br />
<br />
Street:<br />
APT#/Unit# (IF applicable):<br />
City:<br />
State:<br />
Zip Code:<br />
<br />
Thank you so much, and looking forward to your confirmation.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006GbeTEAS', 'AMR Email Templates', 'Special Marketing Inquiries - Trial machines', '寻求试用等合作', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We would like to clarify the scope of support provided by our After-Sales Support Team.<br />
<br />
Our After-Sales Support Team is specifically tailored to handle product-related and warranty inquiries within the North America region. For any questions or assistance related to product usage, troubleshooting, or warranty coverage, please feel free to reach out to our team.<br />
<br />
For marketing-related inquiries, including but not limited to machine trials, promotional opportunities, or marketing collaborations, we kindly ask that you contact our Marketing Manager directly:<br />
<br />
Michelle Jones<br />
Marketing Manager<br />
📧 michelle.jones@ecovacs.com<br />
<br />
Thank you for your understanding and cooperation. Should you have any general questions, please do not hesitate to reach out.</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006GdRmEAK', 'AMR Email Templates', 'X8/X9 Pro Omni: Charging issue', 'X8/X9充电问题', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ul>
	<li>Ensure the Deebot is correctly positioned in the charging dock: When placed properly in the OMNI Station, the three indicator lights on the Deebot should pulse in and out with a <strong>flashing white light</strong>, while the OMNI Station should display a <strong>continuous white light</strong>.</li>
</ul>
<img alt="image" src="https://ecovacs2020.file.force.com/file-asset-public/image13?oid=00D2x000005pVxV" style="max-width: 471.788px; width: 328.991px; height: 585.696px;" title="image" />
<ul>
	<li>If the OMNI Station''s&nbsp;indicator light is not lit, <strong>ensure the power cord is securely connected to both the wall outlet and the station</strong>. Apply a slight additional force if needed to ensure a firm connection.</li>
</ul>
<img alt="e9ed81c1-7428-4427-a697-640ef1e3be6c" src="https://ecovacs2020.file.force.com/file-asset-public/e9ed81c174284427a697640ef1e3be6c?oid=00D2x000005pVxV" style="max-width: 471.788px; width: 305.98px; height: 171.989px;" title="e9ed81c1-7428-4427-a697-640ef1e3be6c" />
<ul>
	<li>Verify that the <strong>Rocker Switch</strong> on the <strong>back of the OMNI Station</strong> is turned on: Ensure the rocker switch on the back of the OMNI Station is in the <strong>"I" position</strong>, indicating that the station is powered on.</li>
</ul>
<img alt="edfbff10-f0b6-4417-9c72-fa37a0ebec1c" src="https://ecovacs2020.file.force.com/file-asset-public/edfbff10f0b644179c72fa37a0ebec1c?oid=00D2x000005pVxV" style="max-width: 471.788px; width: 322.983px; height: 180.994px;" title="edfbff10-f0b6-4417-9c72-fa37a0ebec1c" />
<ul>
	<li>Make sure to remove the lid cover from the top of the Deebot, and ensure the <strong>red switch is fully moved to the right (in the ''I'' position)</strong> to activate the Deebot''s main power. Then, repeat Step 1 to check if the Deebot charges properly.</li>
</ul>
<img alt="81b10044-45bc-4afd-8054-8816806f03de" class="" src="https://ecovacs2020.file.force.com/file-asset-public/X81b1004445bc4afd80548816806f03de?oid=00D2x000005pVxV" style="max-width: 471.788px; width: 277.969px; height: 350.994px;" title="81b10044-45bc-4afd-8054-8816806f03de" />


<div id="" style="left: 7.99716px; top: 1489.36px;">&nbsp;</div>

<div id="" style="left: 7.99716px; top: 1489.36px;">&nbsp;</div>
</body>
</html>', 'Eric. L', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006GsSPEA0', 'AMR Email Templates', 'Dark Objects - Obstacle Avoidance Behavior', '深色/黑色家具避障', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We sincerely apologize for any inconvenience this may have caused.</p>

<p>When an obstacle along the edge has a relatively low front height, the robot may attempt to climb over it. This behavior is normal and does not indicate a malfunction.</p>

<p>Additionally, the robot''s obstacle avoidance system may be less sensitive to black or dark-colored objects. Dark surfaces absorb more light and reflect less, which can result in weaker reflected signals being received by the sensors. As a result, the robot may have difficulty accurately detecting such obstacles.</p>

<p>For safer and more efficient operation, we recommend setting up <strong>Virtual Boundaries</strong> on the <strong>Map Management</strong> page, especially in areas where the robot needs to avoid dark-colored furniture or objects.</p>

<p>Thank you for your understanding and support.</p>
</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006GukLEAS', 'AMR Email Templates', 'Alexa No Response to the Voice Commands', 'Alexa对指令无响应', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Thank you for reaching out to ECOVACS ROBOTICS.<br />
<br />
To get started, please ensure you have logged in to your ECOVACS account on the ECOVACS HOME App and that your DEEBOT is connected and <strong>online</strong>. Then, simply enable the ECOVACS Skill in the Alexa App by tapping the "Enable" button. Once everything is set, you should be able to control your DEEBOT through voice commands.<br />
<br />
If your DEEBOT is already linked to Alexa but is not responding to voice commands, please try the following steps:</p>

<ol>
	<li>Unlink and relink the ECOVACS Skill in the Alexa App to refresh the connection.</li>
	<li>Ensure that both your DEEBOT and Alexa device are connected to the same Wi-Fi network.</li>
	<li>When giving a command, attempt to use a format such as: "Alexa, ask DEEBOT to start cleaning." or&nbsp;&nbsp;"Alexa, ask DEEBOT to mop the master bedroom."</li>
</ol>

<p>&nbsp;</p>

<p><br />
If you have renamed your DEEBOT in the ECOVACS App, please reference the new name when speaking the command.<br />
<br />
You can also refer to the link below for the full list of supported Alexa commands:<br />
<br />
<a href="https://www.amazon.com/ECOVACS-ROBOTICS-Ecovacs-Deebot/dp/B06ZYCJJQS">ECOVACS DEEBOT Alexa Commands</a></p>

<p>If you have any further questions, please feel free to let us know. We''re happy to help.</p>
</body>
</html>', 'Aiden', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006HWrFEAW', 'AMR Email Templates', 'Cannot Verify Manufacture Date to DD-MM-YY', '用户追问生产日期', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>Due to standard production and warehouse process regulations, we are unable to provide the exact production date down to a specific day. Please note that the <strong>manufacture date is not used for standard warranty verification</strong>.</p>

<p>For warranty and after-sales service validation, we kindly ask that you provide a <strong>valid proof of purchase</strong> (such as a receipt or order confirmation). This documentation is required to confirm warranty eligibility.</p>

<p>Thank you for your understanding and cooperation. If you have any questions, please feel free to reach out—we are happy to assist.</p>
</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006HpDxEAK', 'AMR Email Templates', 'Webstore Return - Request for Return Reason - Must TBS first', '**官网订单**退货前必先**排障**', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We regret to learn about your decision.<br />
<br />
Before we assist you with submitting a request to the Webstore order processing team, we kindly ask if you could <strong>share the issues or reasons </strong>that led to this decision. Our team is on standby to assist with troubleshooting, returns, or warranty claims. <strong>If troubleshooting is not successful, we will proceed with the appropriate next steps accordingly</strong>.<br />
<br />
If possible, we would also appreciate it if you could share a brief <strong>video </strong>demonstrating the issue you are experiencing. This will help us better understand the situation and work toward a more efficient resolution.<br />
<br />
<em>For your reference, please find a summary of the <strong>Ecovacs US/CA Official Website</strong> Return and Exchange Policy below:</em></p>

<ul>
	<li><em>Orders placed through the Ecovacs US/CA Official Website are eligible for a refund or exchange within 30 days of purchase.</em></li>
	<li><em>For returns initiated due to personal reasons (such as a change of mind or incompatibility with personal needs), the customer is responsible for return shipping fees.</em></li>
	<li><em>For returns or exchanges resulting from product defects or issues attributable to Ecovacs, return shipping fees will be waived.</em></li>
</ul>

<p><br />
Thank you in advance for your cooperation. We look forward to your response and to assisting you further.</p>
</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006IQobEAG', 'AMR Email Templates', 'Navigation Module Error - T50/X8/X9', '导航模组异常', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<ul>
	<li>Gently adjust the navigation module at the front of the Deebot, and check for any debris or entanglement.</li>
</ul>

<div style="margin-left: 40px;"><img alt="Navigation Module 3" src="https://ecovacs2020.file.force.com/file-asset-public/Navigation_Module_3?oid=00D2x000005pVxV" style="max-width: 669.341796875px" title="Navigation Module 3" /></div>

<div style="margin-left: 40px;"><img alt="Navigation Module 4" src="https://ecovacs2020.file.force.com/file-asset-public/Navigation_Module_4?oid=00D2x000005pVxV" style="max-width: 669.342px; width: 562.949px; height: 185.996px;" title="Navigation Module 4" /></div>

<ul>
	<li>Restart the Deebot (Power OFF → wait a few seconds → ON).</li>
	<li>Run a short test cleaning cycle.</li>
	<li>If the issue persists, perform a factory reset.</li>
</ul>

<div style="margin-left: 40px;"><strong>Gentle Reminder: </strong>Kindly be informed that performing a reset on the Deebot will result in the deletion of all data, including the saved maps. Following the reset, Deebot will go offline and will require the network setup process to be redone to restore its online functionality.<br />
&nbsp;<br />
<strong>How to reset your Deebot:</strong><br />
To initiate a hard reset of the Deebot, press the Reset Button (a tiny grey button near the power switch) for approximately 5 seconds. You will hear a voice prompt stating "Reset to default settings," followed by the commencement of the boot music. This indicates that the default settings have been successfully restored.<br />
&nbsp;</div>
</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006IaftEAC', 'AMR Email Templates', 'X8/T50: Cleaning sink is full/Mop washing tray malfunction/Wastewater not recycl', 'X8/T50: 情节槽满水/脏水不循环', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><strong>1. Confirm that the cleaning sink (mop washing tray) is properly installed and securely in place.</strong><br />
<img alt="1280X1280" src="https://ecovacs2020.file.force.com/file-asset-public/X1280X1280?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="1280X1280" /><br />
<br />
<strong>2. Ensure that the cube-shaped float is fully installed and that its magnet is still present.</strong><br />
<img alt="output" src="https://ecovacs2020.file.force.com/file-asset-public/output?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 460px; height: 345px;" title="output" /><img alt="output (1)" src="https://ecovacs2020.file.force.com/file-asset-public/output_1?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 257px; height: 343px;" title="output (1)" /><br />
<br />
<strong>3. Check the cleaning sink for water:</strong>
<ul>
	<li><strong>If there is no water:</strong></li>
</ul>

<ul style="margin-left: 40px;">
	<li>Verify if the float is obstructed by any foreign objects. If so, clean it thoroughly. Move the float up and down. If it falls back into place naturally, it is functioning properly.</li>
</ul>
<img alt="image (3)" src="https://ecovacs2020.file.force.com/file-asset-public/image_3612?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 355px; height: 474px;" title="image (3)" /><img alt="image (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_183?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 355px; height: 474px;" title="image (1)" /><br />
<strong>If there is water residue in the cleaning sink, follow these steps:</strong>

<ul>
	<li>Open the dirty water tank and inspect the sealing ring for any visible foreign objects. If there are any, clean and wipe the ring. If the sealing ring is clear, ensure the cover is securely closed.</li>
	<li>Remove the sealing plugs, clean them, and reinstall them. Check for any foreign objects between the tank and the station. Once cleared, replace the water tank and press it down to ensure it is securely seated.</li>
</ul>
<img alt="1280X1280 (1)" src="https://ecovacs2020.file.force.com/file-asset-public/X1280X1280_1?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 356px; height: 267px;" title="1280X1280 (1)" /><img alt="image (3) (1)" src="https://ecovacs2020.file.force.com/file-asset-public/image_3_1?oid=00D2x000005pVxV" style="max-width: 706.998px; width: 356px; height: 267px;" title="image (3) (1)" />
<ul>
	<li>Open the<strong> Ecovacs Home App</strong>, go to <strong>Settings</strong>, and select <strong>Device Relocation</strong>. Then click on <strong>Auxiliary Draining </strong>and check if the water can be drained. If the water still cannot be drained, remove the cleaning sink, pour out any remaining water, clean the sink, and reinstall it. Ensure it is pushed all the way in to be properly seated.</li>
</ul>
&nbsp;

<ul>
	<li>Replug the station''s power switch, then return the Deebot to the station by either pressing “Return to Station” on the App. Once the Deebot emits “Start Charging,” navigate to "<strong>Settings</strong>" &gt; "<strong>Device Relocation</strong>" and click on "<strong>Pipeline Check.</strong>" Once the water dispensing is complete, click on "<strong>Auxiliary Draining</strong>" again to see if the issue persists.</li>
</ul>
</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006Iy8jEAC', 'AMR Email Templates', 'Offer US Offer US and CA Coupons - effective Jan 1, 2026', '提供优惠券码 - 新券美国/加拿大通用', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We are pleased to offer you exclusive coupons to use at our online store!<br />
<br />
Please use the coupon codes below to enjoy savings on your next purchase:<br />
<br />
• General Purchases – 5% Off: <strong>CCRB5</strong><br />
• Accessory Purchases – 10% Off: <strong>CCACE10</strong><br />
<br />
You can redeem your coupons at either of the following websites:<br />
Ecovacs Official Webstore (USA):&nbsp;https://www.ecovacs.com/us<br />
Ecovacs Official Webstore (Canada): https://www.ecovacs.com/ca<br />
<br />
Thank you for your continued support. We hope you enjoy your shopping experience with ECOVACS!</p>
</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006NFhFEAW', 'AMR Email Templates', 'Winbot W2S - How to Use Videos', 'W2S 窗宝单机版视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p><a href="https://youtu.be/Or9fGpwMF58">How to Use</a></p>

<p><a href="https://youtu.be/RQK5nBGo2KY">How to Connect WINBOT to the App</a><br />
<br />
<a href="https://youtu.be/mlx4smLevKE">Selecting a Cleaning Mode</a><br />
<br />
<a href="https://youtu.be/B3D-vvQoxhI">WINBOT Daily Maintenance and Cleaning Guide</a><br />
<br />
<a href="https://youtu.be/hPdKKpNAtwU">Side Brush Cleaning</a><br />
<br />
<a href="https://youtu.be/cjNNqDzVf2c">How to Use the Reset Button</a><br />
<br />
<a href="https://youtu.be/d6yJSFuJ9cI">WINBOT Not Spraying Water</a><br />
<br />
<a href="https://youtu.be/d6yJSFuJ9cI">Alert: WINBOT slips</a><br />
<br />
<a href="https://youtu.be/_V3l87zXIZc">Alert: Not enough air pressure</a><br />
<br />
<a href="https://youtu.be/44N12KTR6ZQ">Alert: WINBOT is Trapped</a><br />
<br />
<a href="https://youtu.be/9Ss9tPAya30">Alert: Avoid window edges and reattach WINBOT.</a><br />
<br />
<a href="https://youtu.be/N_ykBrkIre0">Alert: Side Brush Stuck</a></p>
</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006NGTeEAO', 'AMR Email Templates', 'Winbot W2S Omni - How to Use Videos', 'W2S OMNI 使用视频集锦', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;"><a href="https://youtu.be/KUZN_rEQL28">How to Use</a><br />
<br />
<a href="https://youtu.be/69HtDhueLeo">How to Connect WINBOT to the App</a><br />
<br />
<a href="https://youtu.be/FPmqvj7vD0U">Selecting a Cleaning Mode</a><br />
<br />
<a href="https://youtu.be/dwqyDKi-njg">WINBOT Daily Maintenance and Cleaning Guide</a><br />
<br />
<a href="https://youtu.be/BcIiq65X4MY">WINBOT Storage Guide</a><br />
<br />
<a href="https://youtu.be/WMJVDofxqhc">How to Use the Reset Button</a><br />
<br />
<a href="https://youtu.be/TVEk6Pk4bUE">Side Brush Cleaning</a><br />
<br />
<a href="https://youtu.be/rsDxHaM2OYI">WINBOT Not Spraying Water</a><br />
<br />
<a href="https://youtu.be/u8dedovDUsk">Alert: WINBOT Slips</a><br />
<br />
<a href="https://youtu.be/H3PpnUW-8uA">Alert: Not Enough Air Pressure</a><br />
<br />
<a href="https://youtu.be/eO8p_nWp-tw">Alert: WINBOT is Trapped</a><br />
<br />
<a href="https://youtu.be/4E1bkQzOe5g">Alert: Avoid Window Edges and Reattach WINBOT</a><br />
<br />
<a href="https://youtu.be/YsUJC2VVAXw">Alert: Side Brush Stuck</a><br />
<br />
<a href="https://youtu.be/SoX6JcMTzQg">Fixing the Station Power Port Rubber Cover</a><br />
<br />
<a href="https://youtu.be/aBUYPlUP1E0">How to Charge the Station</a><br />
<br />
<a href="https://youtu.be/b8LolkUBicA">How to Use the Station Suction Pad</a><br />
<br />
<a href="https://youtu.be/fXgbWE11K6k">Fix WINBOT Compound Cable Twist</a></body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006Nw7tEAC', 'AMR Email Templates', 'Request Chat Transcript', '用户想要获取Chat Transcript', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">To request a chat transcript, click the vertical three-dot button (<strong>⋮</strong>) in the top-left corner of the chat window and select "Request Chat Transcript."<br />
<br />
<img alt="Request Chat Transcript - SF" src="https://ecovacs2020.file.force.com/file-asset-public/Request_Chat_Transcript_SF?oid=00D2x000005pVxV" style="max-width: 581.4462127685547px" title="Request Chat Transcript - SF" /><br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006NxaEEAS', 'AMR Email Templates', 'Roller Mop - How to Start Mop-Only Task', '滚筒类通用 - 如何启用单拖功能', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Please note that the Mop-Only cleaning mode is exclusively available within the <strong>Zone </strong>Cleaning feature.<br />
<br />
To start a <strong>Mop-Only</strong> task:
<ul>
	<li>Ensure the map is complete—<strong>Zone</strong> Cleaning will be available once done.</li>
	<li>Click on <strong>Zone</strong>, adjust the frame, select the orange Mop icon, and initiate Mop-Only mode.</li>
</ul>
<img alt="Zone Clean Mode - Mop Only" src="https://ecovacs2020.file.force.com/file-asset-public/Zone_Clean_Mode_Mop_Only?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 362.986px; height: 786.771px;" title="Zone Clean Mode - Mop Only" /><br />
<br />
<em>This mode is best suited for smaller, focused cleaning tasks where only mopping is needed.</em><br />
<br />
Please feel free to let us know if you need any further assistance.</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006O6C5EAK', 'AMR Email Templates', 'X8 - Mop Washing Tray Malfunction', 'X8 - 清洁槽异常', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>1. Confirm that the cleaning sink (mop washing tray) is properly installed and securely in place.<br />
<img alt="20250216-152151.144-21" src="https://ecovacs2020.file.force.com/file-asset-public/X2025021615215114421?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 352.986px; height: 265.069px;" title="20250216-152151.144-21" /><br />
&nbsp;<br />
2. Ensure that the cube-shaped float is fully installed and that its magnet is still present.<br />
<img alt="20250216-152151.144-11" src="https://ecovacs2020.file.force.com/file-asset-public/X2025021615215114411?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 283.993px; height: 379.236px;" title="20250216-152151.144-11" /><br />
&nbsp;<br />
&nbsp;<br />
<br />
3. Check the cleaning sink for water:<br />
<br />
<strong>If there is no water:</strong><br />
Verify if the float is obstructed by any foreign objects. If so, clean it thoroughly.<br />
Move the float up and down. If it falls back into place naturally, it is functioning properly.<br />
<br />
<strong>If there is water residue in the cleaning sink, follow these steps:</strong><br />
Open the dirty water tank and inspect the sealing ring for any visible foreign objects. If there are any, clean and wipe the ring. If the sealing ring is clear, ensure the cover is securely closed.<br />
<img alt="20250216-152151.144-8" src="https://ecovacs2020.file.force.com/file-asset-public/X202502161521511448?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 305.99px; height: 408.229px;" title="20250216-152151.144-8" /><br />
&nbsp;<br />
Remove the sealing plugs, clean them, and reinstall them. Check for any foreign objects between the tank and the station. <strong>Once cleared, replace the water tank and press it down to ensure it is securely seated.</strong></p>

<p><img alt="20250216-152151.144-17" src="https://ecovacs2020.file.force.com/file-asset-public/X2025021615215114417?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 344.983px; height: 258.993px;" title="20250216-152151.144-17" /><br />
<img alt="20250216-152151.144-7" src="https://ecovacs2020.file.force.com/file-asset-public/X202502161521511447?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 344.983px; height: 258.993px;" title="20250216-152151.144-7" /><br />
<br />
Open the Ecovacs Home App, go to Settings, and select <strong>Device Relocation</strong>. Then click on <strong>Auxiliary Draining</strong> and check if the water can be drained.&nbsp;<br />
<img alt="Settings - Device Relocation" src="https://ecovacs2020.file.force.com/file-asset-public/Settings_Device_Relocation?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 346.997px; height: 753.733px;" title="Settings - Device Relocation" /><br />
<br />
<strong>If the water still cannot be drained</strong>, remove the cleaning sink, pour out any remaining water, clean the sink, and reinstall it. Ensure it is pushed all the way in to be properly seated.<br />
<br />
Re-plug the station''s power switch, then return the Deebot to the station by either pressing "Return to Station" on the App. Once the Deebot emits&nbsp; "Start Charging," navigate to "Settings" &gt; "Device Relocation" and click on "Pipeline Check." Once the water dispensing is complete, click on "Auxiliary Draining" again to see if the issue persists.<br />
<br />
Please let us know if you need further assistance.</p>
</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006OarhEAC', 'AMR Email Templates', 'T8/N8 Unable to Climb Self-Empty Station', 'T8/N8 无法爬上AES', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">*Wipe the down view sensor at the bottom of the DEEBOT and clean the universal wheel<br />
*Check whether there is signal interference near the dust collector, and try to replace the dust collector again<br />
* Please kindly install the ramp extension<br />
<img alt="20260110-041241" src="https://ecovacs2020.file.force.com/file-asset-public/X20260110041241?oid=00D2x000005pVxV" style="max-width: 706.9979553222656px" title="20260110-041241" /><br />
* Kindly wipe the driving wheel with a clean cloth and rotate it with a finger to check if both wheels are in the same consistency<br />
* Wipe the Infrared signal emitter and bumper with a clean cloth</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006P0B3EAK', 'AMR Email Templates', 'T30/X2 Combo Out Of Stock Provide Upgrade Model', 'T30/X2 Combo 没货提供升级型号', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">Thank you for your kind patience and cooperation while we completed the review of your warranty request.&nbsp;<br />
<br />
In recognition of your loyalty and as a heartfelt thank you for being a part of the ECOVACS family, we would like to offer you a complimentary upgrade to a newer model in light of limited availability for the original model.<br />
<br />
For more information on the <strong>upgrade option<span style="color:#e74c3c;">(s)</span>&nbsp;</strong>to help you decide, please view the information below.<br />
<br />
<strong>Option A:</strong> [<strong><span style="color:#c0392b;">Improvements compared with the original model</span></strong>]<br />
<strong>Product Link:&nbsp;</strong><br />
<br />
<span style="font-size:18px;"><u><strong><span style="color:#e74c3c;">***如果只有一个选择请删除Option B 部分和删除 (S), 请将此段中文删除再发送给用户***</span></strong></u></span><br />
<strong>Option B:</strong> [<strong><span style="color:#c0392b;">Improvements&nbsp;compared with the original model</span></strong>]&nbsp;<br />
<strong>Product Link:&nbsp;</strong><br />
<br />
<br />
Once we receive your confirmation, we will proceed with the appropriate shipment and ensure you are updated throughout the process.<br />
<br />
If you need any further clarification or assistance, please don''t hesitate to reach out.</body>
</html>', 'Alex. W', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006Q6ntEAC', 'AMR Email Templates', 'X8 - Deebot Water Injection Port Dripping Water', 'X8 拖地过程中，注水口持续滴水 (需要补发 201-2498-0654)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">We sincerely apologize for any inconvenience caused.<br />
<br />
Regarding the water dripping issue you reported, please note that a small amount of residual water may remain at the rear water inlet of the X8 PRO OMNI. Due to inertia, slight dripping may occur. We recommend gently <strong>drying the port with a dry cloth </strong>and <strong>extending the Mop Auto Wash Frequency</strong> to help minimize this situation.<br />
<br />
In the meantime, we will proceed with arranging a <strong>Sealing Plug for the Water Injection Port </strong>as a resolution. Kindly provide the following information to assist us with the shipment:
<ul>
	<li><strong>Proof of purchase </strong>(official receipt or invoice);</li>
	<li>Shipping information (full name, address, and contact number);</li>
	<li>A photo of the unit clearly showing the <strong>DEEBOT serial number</strong>, starting with E0 or E4;</li>
	<li>A clear photo of the machine''s water inlet (as attached).</li>
</ul>

<div style="margin-left: 40px;"><img alt="X8 Water Refill Port" src="https://ecovacs2020.file.force.com/file-asset-public/X8_Water_Refill_Port?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 271.979px; height: 203.993px;" title="X8 Water Refill Port" /></div>
<br />
<em>Once we receive the above details, we will proceed with the shipment.&nbsp;</em><br />
<br />
Thank you for your understanding and cooperation. Should you have any further questions, please feel free to contact us.</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006QFG5EAO', 'AMR Email Templates', 'X9 - Deebot Water Injection Port Sealing Plug Missing, Dripping Water', 'X9 注水口胶塞丢失，导致注水口滴水 (需要补发 201-2498-0654)', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">
<p>We sincerely apologize for any inconvenience caused.<br />
<br />
Regarding the water dripping issue you reported on your X9 PRO OMNI, we kindly ask that you first check whether the <strong>sealing plug</strong> at the rear water injection port is missing or has fallen off (as shown in <strong>Picture 1</strong>; please refer to <strong>Picture 2</strong> for how the part should be properly installed). A missing or improperly installed sealing plug may result in water leakage.<br />
<img alt="X8 Water Refill Port" src="https://ecovacs2020.file.force.com/file-asset-public/X8_Water_Refill_Port?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 341.997px; height: 257.049px;" title="X8 Water Refill Port" /><br />
<img alt="X8 Water Refill Port Sealing Plug - Installed" src="https://ecovacs2020.file.force.com/file-asset-public/X8_Water_Refill_Port_Sealing_Plug?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 345.99px; height: 185.625px;" title="X8 Water Refill Port Sealing Plug - Installed" /><br />
<br />
<strong>If the sealing plug is improperly installed</strong>, please remove it and reinstall it securely. We also recommend<strong> cleaning the port with a dry cloth</strong> and <strong>increasing the Mop Auto Wash Frequency</strong> in the app to help minimize this issue.<br />
<br />
However, <strong>if you confirm that the sealing plug is missing</strong> and this has caused the issue, we will proceed with arranging a replacement. Kindly provide the following information to assist us:</p>

<ul>
	<li>Proof of purchase (official receipt or invoice);</li>
	<li>Shipping information (full name, address, and contact number);</li>
	<li>A photo of the unit clearly showing the <strong>DEEBOT serial number</strong>, starting with <strong>E0</strong> or <strong>E4</strong>;</li>
	<li>A clear photo of the machine''s water inlet (as attached).</li>
</ul>

<p><br />
<em>Once we receive and verify the above details, we will proceed with the shipment.</em><br />
<br />
Thank you for your understanding and cooperation. Should you have any further questions, please feel free to contact us.</p>
</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;
INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES ('00Xcz000006Td5lEAC', 'AMR Email Templates', 'Bypass Clean Water Tank Not Full/Dirty Water Tank Full Alarm', '绕开“清水箱无水”或“污水箱水满”警报', '', '<html>
<head>
	<title></title>
</head>
<body style="height: auto; min-height: auto;">When the Deebot starts a cleaning task, it now performs a self-check of both the Deebot and the Docking Station. If insufficient clean water is detected and the issue is not addressed promptly, the system will trigger an error to prevent the cleaning task from continuing.<br />
<br />
To avoid interruptions caused by low clean water or a full dirty water tank, we recommend <strong>enabling "Forced Operation Without Water" </strong>under <strong>Station Advanced Settings</strong> in the <strong>Settings</strong>. This setting allows the robot to continue cleaning even when these conditions are detected.<br />
<img alt="Turn on Forced Operation Without Water" src="https://ecovacs2020.file.force.com/file-asset-public/Turn_on_Forced_Operation_Without_Wa?oid=00D2x000005pVxV" style="max-width: 581.446px; width: 370px; height: 799.757px;" title="Turn on Forced Operation Without Water" /><br />
<br />
&nbsp;</body>
</html>', 'Charlie G.', 1792029242033)
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;

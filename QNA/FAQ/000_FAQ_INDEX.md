# FAQ Reference

Total: 216 entries

| # | Product | Issue | Solution | File |
|---|---|---|---|---|
| 1 | General | If用户想自行ReplaceMain Board，或拆装Replace各类Sensor | 当Replace以下配件或涉及相关拆装Operation时，需进行对应的工装标定/Calibration Tooling：

  ReplaceMain Board； 
  拆装或Replace各类Sensor，包括但不限于： 
  结构光Sensor 
  AI 摄像头 
  沿边/沿面Sensor 
  单线结构光避障Sensor 
  Laser Sensor（线束Laser Sensor）等 
 
 
ReplaceMay导致SensorInstall角度或位置发生变化的配件，例如撞板模组等。 
为确保SensorPositioning准确及设备正常运行，维修Complete后需执行相应的工装标定。

因此科沃斯官方是不Recommend用户自行维修的，而是送到维修中心维修。 | [001_IfReplaceMain_BoardReplaceSensor.md](001_IfReplaceMain_BoardReplaceSensor.md) |
| 2 | General | How to connect Matter with Home Assistant

* 目前官方并未公示过Supporthome assistant，现有的都是三方的。 | https://www.home-assistant.io/integrations/matter/ | [002_How_to_connect_Matter_with_Home_Assistant_Supporthome_assist.md](002_How_to_connect_Matter_with_Home_Assistant_Supporthome_assist.md) |
| 3 | GOAT | 图示脏污程度是否影响机器避障表现 | 一些肉眼不易察觉的粉尘、飞絮等悬浮物也May产生 TOF 杂点，从而影响避障效果。此外，If TOF 镜头表面存在灰尘、污渍或指纹，也会增加产生 TOF 杂点的概率。
Recommend先让用户将 TOF 镜头擦拭干净，并Restart设备后再次测试。IfClean镜头并Restart后Issue仍然存在，则可以初步怀疑是单台机器的 TOF 模组Abnormal，再进一步排查或按售后流程处理。 | [003_FAQ_3.md](003_FAQ_3.md) |
| 4 | GOAT | 用户Need to获取GOAT A系列 Cellular Module Pro (即4G Module) IMEI | Please用户提供相关资料，并Upgrade到飞书“技术Upgrade”群

To proceed, please provide the following:
1. The GOAT Serial Number, located on the bottom of the GOAT (starts with E0).
2. A clear photo of the bottom of the Cellular Module.
3. Confirmation that the Cellular Module is properly installed on the GOAT and that the GOAT is connected and online using your 2.4 GHz home Wi-Fi network.

Once we receive the above information, we will proceed with the next step. | [004_Need_toGOAT_A_Cellular_Module_Pro_4G_Module_IMEI.md](004_Need_toGOAT_A_Cellular_Module_Pro_4G_Module_IMEI.md) |
| 5 | GOAT | 用户质疑Mower在低电15%的时候就进行Return to Charge——用户Recommend将低电Return to Charge的阈值降低到10%甚至5%，或开放Function，允许用户Settings一个百分比，认为这样就可以根据实际情况进行调整 | 用户只考虑了常规情况，Product涉及Need to考虑全部场景，比如机器Positioning出错，机器镜头脏污或者被异物obstruction，乃至遇到极端天气影响机器Positioning等等，机器Need to探索Return to Charge，还有要考虑后续Battery衰减，Need to能保证Return to Charge电量，15%是经过各种评估的结果 | [005_Mower15Return_to_ChargeRecommendReturn_to_Charge105FunctionS.md](005_Mower15Return_to_ChargeRecommendReturn_to_Charge105FunctionS.md) |
| 6 | GOAT | 1/ 这些深色标记具体代表什么？
2/ 这些障碍物数据存储在哪里？
3/ 用户该如何清除或Reset这些数据？
4/ 为何在删除了受影响的Mowing区域后，这些标记依然存在？
5/ 这是固件或 ECOVACS HOME 应用程序已知的缺陷吗？
6 是否有即将推出的Update允许删除、忽略或覆盖这些“虚假障碍物”？
7/ 这些标记出现在没有任何物理障碍物的正常草坪上，导致Mower无法修剪这些本应正常作业的区域。 | 这些深色标记具体代表什么？
用户圈的深绿色方形标记表示“卡困障碍”，即机器曾在此位置被Stuck，系统会记录该位置，并生成1㎡左右的卡困障碍，后续路径规划和MowingTask都会主动避开此区域。不规则的深绿色标记表示普通障碍。
 
这些障碍物数据存储在哪里？
这些数据存在机器内部data/FILES里。
 
用户该如何清除或Reset这些数据？
当前版本暂Not supported手动删除卡困点，该Function计划在下一个OTA版本中上线。
Remap可以清除这些，但If用户每次Create MapComplete后，后续Mowing都会再次生成，就Description这两块是易卡困点。从用户这个地图看，机器应该是在边界处Stuck了。
 
为何在删除了受影响的Mowing区域后，这些标记依然存在？
卡困障碍数据是与大区域（Area）Bind的，删除Zone并不会自动移除这些关联的卡困标记。
 
这是固件或 ECOVACS HOME 应用程序已知的缺陷吗？
这属于当前版本的设计限制，删除卡困障碍的Function已Confirm将在下一版本中推出。
 
是否有即将推出的Update允许删除、忽略或覆盖这些“虚假障碍物”？
是的。下个OTA版本将增加针对卡困障碍的删除Function，但是针对其他障碍，暂时没有删除Function。 | [006_1_2_3_Reset4_Mowing5__ECOVACS_HOME_6_Update7_Mower.md](006_1_2_3_Reset4_Mowing5__ECOVACS_HOME_6_Update7_Mower.md) |
| 7 | GOAT | 固定打草模块的两颗小螺丝规格 | 十字槽盘头平端带垫自攻牙螺钉PWT4.8*18-带齿垫-F | [007_FAQ_7.md](007_FAQ_7.md) |
| 8 | GOAT | 用户表示 O1000RTK Care Kit缺少 RTK Pole Assembly Screw 和 Spring Washer | 1. Self-TApping Screw
Size: 3.9 × 16 mm

2. Flat Washer
Inner Diameter (ID): 12.5 mm
Outer Diameter (OD): 19 mm
Thickness: 3.5 mm
Surface Finish: Zinc-Nickel Alloy Plating | [008_O1000RTK_Care_Kit_RTK_Pole_Assembly_Screw__Spring_Washer.md](008_O1000RTK_Care_Kit_RTK_Pole_Assembly_Screw__Spring_Washer.md) |
| 9 | GOAT | MowerGarage组装4号螺丝螺丝 | 十字槽盘头平端带齿垫自攻螺钉
PWT4.8×18  | [009_MowerGarage4.md](009_MowerGarage4.md) |
| 10 | GOAT | Garage的尺寸 | 801*547*426mm | [010_Garage.md](010_Garage.md) |
| 11 | GOAT | A2500RTK Blade Disc的螺丝尺寸/型号 | PM4*12 | [011_A2500RTK_Blade_Disc.md](011_A2500RTK_Blade_Disc.md) |
| 12 | GOAT | MowerBlade Disc / Blade disc SKU | O1000LiDAR PRO, O1000RTK: 201-2201-0931
A2000LiDAR PRO, A3000LiDAR PRO, A2500RTK, A3000LiDAR: 201-2337-1235 | [012_MowerBlade_Disc__Blade_disc_SKU.md](012_MowerBlade_Disc__Blade_disc_SKU.md) |
| 13 | GOAT | MowerBlade固定螺丝 | 通用螺丝，3.9mm*16mm的自攻螺丝
Self-tApping Screw, 3.9mm*16mm | [013_MowerBlade.md](013_MowerBlade.md) |
| 14 | GOAT | MowerA系列4G Module/Cellular Module拆装Need to用到的螺丝刀型号 | 推荐的螺丝刀规格是：PH2（2 号十字螺丝刀），PH2 (No.2 Phillips) | [014_MowerA4G_ModuleCellular_ModuleNeed_to.md](014_MowerA4G_ModuleCellular_ModuleNeed_to.md) |
| 15 | DEEBOT | 收到新机后，Return to Charge模组位置有残留的胶，擦不掉，甚至影响机器的正常Return to Charge | 用酒精擦拭可擦掉的 | [015_Return_to_ChargeReturn_to_Charge.md](015_Return_to_ChargeReturn_to_Charge.md) |
| 16 | DEEBOT | T90/X11 Side Brush、Roller Brush和滚筒三抬升

******液体污渍检测的前提是开启AI污渍识别和AIVI 3DFunction******
******颗粒物检测的前提是开启颗粒物策略Clean和AIVI 3DFunction****** | 各部件触发抬升场景

1. 滚筒 Roller Mop
识别到地毯（根据地毯Clean策略Settings抬起）、仅扫地模式、回Docking Station回洗、跨房间movement、Create Map、越障脱困

2. Side Brush Side Brush
检测到大颗粒垃圾（猫粮、瓜子、碎石、纸屑团）、检测到液体污渍（水渍、奶渍、汤汁）

3. Roller Brush Main Brush
检测到液体污渍 | [016_T90X11_Side_BrushRoller_BrushAIAIVI_3DFunctionCleanAIVI_3DFu.md](016_T90X11_Side_BrushRoller_BrushAIAIVI_3DFunctionCleanAIVI_3DFu.md) |
| 17 | DEEBOT | 开启AI污渍识别Function后，X11系列 & T90系列Side Brush、Roller Brush/Main Brush遇到液体污渍时的抬升高度 | 6 mm/0.236 inches | [017_AIFunctionX11__T90Side_BrushRoller_BrushMain_Brush.md](017_AIFunctionX11__T90Side_BrushRoller_BrushMain_Brush.md) |
| 18 | DEEBOT | 灵动岛iphone上岛逻辑 | 保持 App 打开，且执行了StartCleaning / 继续CleaningOperation动作，会触发上岛逻辑。其他操控（如语音控制机器、App 处于后台状态等）不会触发上岛。 | [018_iphone.md](018_iphone.md) |
| 19 | DEEBOT | YIKO Assistant 互动的Recommend距离 | 尽量保持在6米以内，发音清楚，音量正常，确保收音正常 | [019_YIKO_Assistant_Recommend.md](019_YIKO_Assistant_Recommend.md) |
| 20 | DEEBOT | Alexa | 机器默认的Clean模式是边扫边拖，所以Alexa也是默认的边扫边拖。科沃斯之前的Product有取下Mopping Plate变为仅扫地的机型，那当取下Mopping Plate后，机器默认仅扫地，Alexa 也就能执行仅扫地
 
Alexa Not supportedT80等新型号的仅扫地指令 | [020_Alexa.md](020_Alexa.md) |
| 21 | DEEBOT | Roller Brush盖与地面摩擦异响 | Roller Brush盖板跟地面剐擦的声音，主要Issue还是在Roller Brush盖板，因为要保证贴地的CE值，不同的光滑环境就May存在这种剐擦的声音，ReplaceRoller Brush盖板正常可以解决 | [021_Roller_Brush.md](021_Roller_Brush.md) |
| 22 | DEEBOT | 正常的Roller Brush盖板橡胶部分与地面摩擦的声音 | 扫地RobotRoller Brush盖板在接触地面时产生的异响，实际上是源于其设计上的精妙之处——采用了浮动式Roller Brush盖板技术。这项技术确保了Roller Brush盖板能与地面实现更紧密的贴合，从而提升Clean效果。在运作过程中，Roller Brush盖板上的橡胶条会与地面发生摩擦，产生一定的声音，这是正常现象，无需担忧。 | [022_Roller_Brush.md](022_Roller_Brush.md) |
| 23 | DEEBOT | Deebot（如N20）红外感应撞板会减速轻碰/机械避障 | 防撞Sensor基于信号发射与接收原理实现避障Function，当发射信号被障碍物阻挡，接收器无法接收信号时，Robot会触发避障。
防撞Sensor虽然能感知到障碍物，但做不到像咱们眼睛那样，一眼就把障碍物的形状、大小和距离看得明明白白。要是障碍物形状特别，或者表面材质干扰了信号反射，Robot判断起来就没那么准，所以有部分障碍物会先减速，再轻轻碰一下（简称机械避障） | [023_DeebotN20.md](023_DeebotN20.md) |
| 24 | DEEBOT | Mopping Plate外扩式（如T30S）剐蹭踢脚线或家具EmitWork噪音 | 为了极致的边角Clean,Mopping Pad盘会和踢脚线有概率性触碰，Mopping Pad盘包胶是软性的，不会对踢脚线和家具造成损伤 ，可在App中将灵隙技术选择标准贴边模式试下 | [024_Mopping_PlateT30SEmitWork.md](024_Mopping_PlateT30SEmitWork.md) |
| 25 | DEEBOT | 机器碰撞桌腿 | 正常的状态下，如用户的家具，如桌子下面障碍物比较密集，机器在尝试脱困时，是会触发机械撞板减速轻碰。 | [025_FAQ_25.md](025_FAQ_25.md) |
| 26 | DEEBOT | 水质偏硬是否会产生水垢堵塞管线Issue | 水质硬度高确实容易累积水垢，长期下来有May让喷水管、水路、Water Tank产生水垢堆积，严重的话确实会影响出水、造成轻微堵塞。Recommend优先Use过滤水，可以大幅减少矿物质残留。
长时间不Use机器时，一定要排空Water Tank、倾干内部残水，减少水垢附着累积。平时定期保养就能Valid避免管路堵塞喔。 | [026_Issue.md](026_Issue.md) |
| 27 | DEEBOT | 能否用碳酸钠溶液从Water Tank灌入主机消毒Clean | 不Recommend您自行调配碳酸钠液倒入Water Tank循环Clean。
碳酸钠属于碱性物质，浓度把握不当会腐蚀机器内部橡胶密封圈、塑胶水路管、水泵零件，长期会造成漏水、零件老化损坏，这类人为药剂腐蚀不在保固范围内。
If要抑菌效果，Please use我们品牌专售Clean液，配方经工程团队测试匹配机器材质，温和不伤害水路。 | [027_Water_TankClean.md](027_Water_TankClean.md) |
| 28 | DEEBOT | 滚筒Motor轴承处断裂/破损——在正常情况下，滚筒Motor轴承是在滚筒Mopping组件的腔体内的，图示的情况是金属连接位置断裂 | 流程处理 | [028_MotorMotorMopping.md](028_MotorMotorMopping.md) |
| 29 | DEEBOT | 图示Clean Water Tank下方漏水是否正常 | 照片里堆积的水量是正常的。关于这单，判断是否正常的方式，可以不看Docking Station内部的积水量，引导用户把Clean Water Tank抬起来之后，观察Water Tank是否直接往下滴水（If直接滴出来水的话，就是不正常）。If不滴水，就Description是Clean Water Tank在与Docking Station分离的时候，有少量水露出来（这是正常的）。并且解释清楚，Docking Station内的小孔设计出来就是为了能够把底部的积水排到Docking Station的Clean槽内，用户无需担心。 | [029_Clean_Water_Tank.md](029_Clean_Water_Tank.md) |
| 30 | DEEBOT | Charge级片破损/开裂外露 | 流程处理 | [030_Charge.md](030_Charge.md) |
| 31 | DEEBOT | X12 系列机器在阳台区域不Cleaning花瓣、落叶等 | 花瓣/落叶形态不规则有高度触发了机器的避障逻辑的May——当前避障策略会优先避免误吸不确定物体，防止卡刷、缠绕等风险；但从用户场景看，阳台落花瓣确实属于期望Cleaning的垃圾，Recommend可先按“安全优先导致避障”进行解释和安抚。 | [031_X12_Cleaning.md](031_X12_Cleaning.md) |
| 32 | DEEBOT | WIFI 天线外露 | 流程处理 | [032_WIFI.md](032_WIFI.md) |
| 33 | DEEBOT | Power按键开裂 | 流程处理 | [033_Power.md](033_Power.md) |
| 34 | DEEBOT | Main Brush腔体内积了很多尘无法清理 | 用废弃的牙刷刷，但严禁直接用水冲洗组件或整机 | [034_Main_Brush.md](034_Main_Brush.md) |
| 35 | DEEBOT | 用户反馈机器Return to Charge时按照图中黄色路线回去，该表现是否正常 | 机器原最优Return to Charge路径（图中红色）被地毯obstruction，设备自动变更了Return to Charge路线。Recommend挪动地毯，清空Return to Charge必经通道即可。 | [035_Return_to_Charge.md](035_Return_to_Charge.md) |
| 36 | DEEBOT | 用户清理机器背面时发现有电线裸露在外面，吐槽机器做工粗糙 | 此位置都有防水处理，您可以安心Use。
【温馨Alert】严禁直接用水冲洗组件或整机，感谢您的理解与配合！ | [036_FAQ_36.md](036_FAQ_36.md) |
| 37 | DEEBOT | WiFi 6 vs WiFi 7 | - WiFi6：标准标配2.4G+5G，向下Compatible
- WiFi7（802.11be）标准本身是2.4G+5G+6G三频段，2.4G射频完全保留 | [037_WiFi_6_vs_WiFi_7.md](037_WiFi_6_vs_WiFi_7.md) |
| 38 | DEEBOT | T90 用户询问是否有办法让机器进窗帘Cleaning或者床单角Cleaning，表示不想关闭 AIVI 3D 避障 | 机器按照正常避障逻辑，会将图示中的物体识别为障碍物并主动避让。Recommend用户将窗帘和床单垂落的部分收起或固定，避免obstruction机器运行路径，从而减少误避障情况的发生。 | [038_T90_CleaningCleaning_AIVI_3D.md](038_T90_CleaningCleaning_AIVI_3D.md) |
| 39 | DEEBOT | X2 系列无Matter入口，先扫这个二维码 |  | [039_X2_Matter.md](039_X2_Matter.md) |
| 40 | DEEBOT | X12 Side Brush备件是否包含螺丝 | 201-2515-0035 (含螺丝) | [040_X12_Side_Brush.md](040_X12_Side_Brush.md) |
| 41 | DEEBOT | OMNI全能Docking Station不出水 | 不出水大概率是水泵的Issue，小概率是管道堵塞、Main Board损坏 | [041_OMNIDocking_Station.md](041_OMNIDocking_Station.md) |
| 42 | General |  |  | [042_FAQ_42.md](042_FAQ_42.md) |
| 43 | General |  |  | [043_FAQ_43.md](043_FAQ_43.md) |
| 44 | General |  |  | [044_FAQ_44.md](044_FAQ_44.md) |
| 45 | General |  |  | [045_FAQ_45.md](045_FAQ_45.md) |
| 46 | General |  |  | [046_FAQ_46.md](046_FAQ_46.md) |
| 47 | General |  |  | [047_FAQ_47.md](047_FAQ_47.md) |
| 48 | General |  |  | [048_FAQ_48.md](048_FAQ_48.md) |
| 49 | General |  |  | [049_FAQ_49.md](049_FAQ_49.md) |
| 50 | General |  |  | [050_FAQ_50.md](050_FAQ_50.md) |
| 51 | General |  |  | [051_FAQ_51.md](051_FAQ_51.md) |
| 52 | General |  |  | [052_FAQ_52.md](052_FAQ_52.md) |
| 53 | General |  |  | [053_FAQ_53.md](053_FAQ_53.md) |
| 54 | General |  |  | [054_FAQ_54.md](054_FAQ_54.md) |
| 55 | General |  |  | [055_FAQ_55.md](055_FAQ_55.md) |
| 56 | General |  |  | [056_FAQ_56.md](056_FAQ_56.md) |
| 57 | General |  |  | [057_FAQ_57.md](057_FAQ_57.md) |
| 58 | General |  |  | [058_FAQ_58.md](058_FAQ_58.md) |
| 59 | General |  |  | [059_FAQ_59.md](059_FAQ_59.md) |
| 60 | General |  |  | [060_FAQ_60.md](060_FAQ_60.md) |
| 61 | General |  |  | [061_FAQ_61.md](061_FAQ_61.md) |
| 62 | General |  |  | [062_FAQ_62.md](062_FAQ_62.md) |
| 63 | General |  |  | [063_FAQ_63.md](063_FAQ_63.md) |
| 64 | General |  |  | [064_FAQ_64.md](064_FAQ_64.md) |
| 65 | General |  |  | [065_FAQ_65.md](065_FAQ_65.md) |
| 66 | General |  |  | [066_FAQ_66.md](066_FAQ_66.md) |
| 67 | General |  |  | [067_FAQ_67.md](067_FAQ_67.md) |
| 68 | General |  |  | [068_FAQ_68.md](068_FAQ_68.md) |
| 69 | General |  |  | [069_FAQ_69.md](069_FAQ_69.md) |
| 70 | General |  |  | [070_FAQ_70.md](070_FAQ_70.md) |
| 71 | General |  |  | [071_FAQ_71.md](071_FAQ_71.md) |
| 72 | General |  |  | [072_FAQ_72.md](072_FAQ_72.md) |
| 73 | General |  |  | [073_FAQ_73.md](073_FAQ_73.md) |
| 74 | General |  |  | [074_FAQ_74.md](074_FAQ_74.md) |
| 75 | General |  |  | [075_FAQ_75.md](075_FAQ_75.md) |
| 76 | General |  |  | [076_FAQ_76.md](076_FAQ_76.md) |
| 77 | General |  |  | [077_FAQ_77.md](077_FAQ_77.md) |
| 78 | General |  |  | [078_FAQ_78.md](078_FAQ_78.md) |
| 79 | General |  |  | [079_FAQ_79.md](079_FAQ_79.md) |
| 80 | General |  |  | [080_FAQ_80.md](080_FAQ_80.md) |
| 81 | General |  |  | [081_FAQ_81.md](081_FAQ_81.md) |
| 82 | General |  |  | [082_FAQ_82.md](082_FAQ_82.md) |
| 83 | General |  |  | [083_FAQ_83.md](083_FAQ_83.md) |
| 84 | General |  |  | [084_FAQ_84.md](084_FAQ_84.md) |
| 85 | General |  |  | [085_FAQ_85.md](085_FAQ_85.md) |
| 86 | General |  |  | [086_FAQ_86.md](086_FAQ_86.md) |
| 87 | General |  |  | [087_FAQ_87.md](087_FAQ_87.md) |
| 88 | General |  |  | [088_FAQ_88.md](088_FAQ_88.md) |
| 89 | General |  |  | [089_FAQ_89.md](089_FAQ_89.md) |
| 90 | General |  |  | [090_FAQ_90.md](090_FAQ_90.md) |
| 91 | General |  |  | [091_FAQ_91.md](091_FAQ_91.md) |
| 92 | General |  |  | [092_FAQ_92.md](092_FAQ_92.md) |
| 93 | General |  |  | [093_FAQ_93.md](093_FAQ_93.md) |
| 94 | General |  |  | [094_FAQ_94.md](094_FAQ_94.md) |
| 95 | General |  |  | [095_FAQ_95.md](095_FAQ_95.md) |
| 96 | General |  |  | [096_FAQ_96.md](096_FAQ_96.md) |
| 97 | General |  |  | [097_FAQ_97.md](097_FAQ_97.md) |
| 98 | General |  |  | [098_FAQ_98.md](098_FAQ_98.md) |
| 99 | General |  |  | [099_FAQ_99.md](099_FAQ_99.md) |
| 100 | General |  |  | [100_FAQ_100.md](100_FAQ_100.md) |
| 101 | General |  |  | [101_FAQ_101.md](101_FAQ_101.md) |
| 102 | General |  |  | [102_FAQ_102.md](102_FAQ_102.md) |
| 103 | General |  |  | [103_FAQ_103.md](103_FAQ_103.md) |
| 104 | General |  |  | [104_FAQ_104.md](104_FAQ_104.md) |
| 105 | General |  |  | [105_FAQ_105.md](105_FAQ_105.md) |
| 106 | General |  |  | [106_FAQ_106.md](106_FAQ_106.md) |
| 107 | General |  |  | [107_FAQ_107.md](107_FAQ_107.md) |
| 108 | General |  |  | [108_FAQ_108.md](108_FAQ_108.md) |
| 109 | General |  |  | [109_FAQ_109.md](109_FAQ_109.md) |
| 110 | General |  |  | [110_FAQ_110.md](110_FAQ_110.md) |
| 111 | General |  |  | [111_FAQ_111.md](111_FAQ_111.md) |
| 112 | General |  |  | [112_FAQ_112.md](112_FAQ_112.md) |
| 113 | General |  |  | [113_FAQ_113.md](113_FAQ_113.md) |
| 114 | General |  |  | [114_FAQ_114.md](114_FAQ_114.md) |
| 115 | General |  |  | [115_FAQ_115.md](115_FAQ_115.md) |
| 116 | General |  |  | [116_FAQ_116.md](116_FAQ_116.md) |
| 117 | General |  |  | [117_FAQ_117.md](117_FAQ_117.md) |
| 118 | General |  |  | [118_FAQ_118.md](118_FAQ_118.md) |
| 119 | General |  |  | [119_FAQ_119.md](119_FAQ_119.md) |
| 120 | General |  |  | [120_FAQ_120.md](120_FAQ_120.md) |
| 121 | General |  |  | [121_FAQ_121.md](121_FAQ_121.md) |
| 122 | General |  |  | [122_FAQ_122.md](122_FAQ_122.md) |
| 123 | General |  |  | [123_FAQ_123.md](123_FAQ_123.md) |
| 124 | General |  |  | [124_FAQ_124.md](124_FAQ_124.md) |
| 125 | General |  |  | [125_FAQ_125.md](125_FAQ_125.md) |
| 126 | General |  |  | [126_FAQ_126.md](126_FAQ_126.md) |
| 127 | General |  |  | [127_FAQ_127.md](127_FAQ_127.md) |
| 128 | General |  |  | [128_FAQ_128.md](128_FAQ_128.md) |
| 129 | General |  |  | [129_FAQ_129.md](129_FAQ_129.md) |
| 130 | General |  |  | [130_FAQ_130.md](130_FAQ_130.md) |
| 131 | General |  |  | [131_FAQ_131.md](131_FAQ_131.md) |
| 132 | General |  |  | [132_FAQ_132.md](132_FAQ_132.md) |
| 133 | General |  |  | [133_FAQ_133.md](133_FAQ_133.md) |
| 134 | General |  |  | [134_FAQ_134.md](134_FAQ_134.md) |
| 135 | General |  |  | [135_FAQ_135.md](135_FAQ_135.md) |
| 136 | General |  |  | [136_FAQ_136.md](136_FAQ_136.md) |
| 137 | General |  |  | [137_FAQ_137.md](137_FAQ_137.md) |
| 138 | General |  |  | [138_FAQ_138.md](138_FAQ_138.md) |
| 139 | General |  |  | [139_FAQ_139.md](139_FAQ_139.md) |
| 140 | General |  |  | [140_FAQ_140.md](140_FAQ_140.md) |
| 141 | General |  |  | [141_FAQ_141.md](141_FAQ_141.md) |
| 142 | General |  |  | [142_FAQ_142.md](142_FAQ_142.md) |
| 143 | General |  |  | [143_FAQ_143.md](143_FAQ_143.md) |
| 144 | General |  |  | [144_FAQ_144.md](144_FAQ_144.md) |
| 145 | General |  |  | [145_FAQ_145.md](145_FAQ_145.md) |
| 146 | General |  |  | [146_FAQ_146.md](146_FAQ_146.md) |
| 147 | General |  |  | [147_FAQ_147.md](147_FAQ_147.md) |
| 148 | General |  |  | [148_FAQ_148.md](148_FAQ_148.md) |
| 149 | General |  |  | [149_FAQ_149.md](149_FAQ_149.md) |
| 150 | General |  |  | [150_FAQ_150.md](150_FAQ_150.md) |
| 151 | General |  |  | [151_FAQ_151.md](151_FAQ_151.md) |
| 152 | General |  |  | [152_FAQ_152.md](152_FAQ_152.md) |
| 153 | General |  |  | [153_FAQ_153.md](153_FAQ_153.md) |
| 154 | General |  |  | [154_FAQ_154.md](154_FAQ_154.md) |
| 155 | General |  |  | [155_FAQ_155.md](155_FAQ_155.md) |
| 156 | General |  |  | [156_FAQ_156.md](156_FAQ_156.md) |
| 157 | General |  |  | [157_FAQ_157.md](157_FAQ_157.md) |
| 158 | General |  |  | [158_FAQ_158.md](158_FAQ_158.md) |
| 159 | General |  |  | [159_FAQ_159.md](159_FAQ_159.md) |
| 160 | General |  |  | [160_FAQ_160.md](160_FAQ_160.md) |
| 161 | General |  |  | [161_FAQ_161.md](161_FAQ_161.md) |
| 162 | General |  |  | [162_FAQ_162.md](162_FAQ_162.md) |
| 163 | General |  |  | [163_FAQ_163.md](163_FAQ_163.md) |
| 164 | General |  |  | [164_FAQ_164.md](164_FAQ_164.md) |
| 165 | General |  |  | [165_FAQ_165.md](165_FAQ_165.md) |
| 166 | General |  |  | [166_FAQ_166.md](166_FAQ_166.md) |
| 167 | General |  |  | [167_FAQ_167.md](167_FAQ_167.md) |
| 168 | General |  |  | [168_FAQ_168.md](168_FAQ_168.md) |
| 169 | General |  |  | [169_FAQ_169.md](169_FAQ_169.md) |
| 170 | General |  |  | [170_FAQ_170.md](170_FAQ_170.md) |
| 171 | General |  |  | [171_FAQ_171.md](171_FAQ_171.md) |
| 172 | General |  |  | [172_FAQ_172.md](172_FAQ_172.md) |
| 173 | General |  |  | [173_FAQ_173.md](173_FAQ_173.md) |
| 174 | General |  |  | [174_FAQ_174.md](174_FAQ_174.md) |
| 175 | General |  |  | [175_FAQ_175.md](175_FAQ_175.md) |
| 176 | General |  |  | [176_FAQ_176.md](176_FAQ_176.md) |
| 177 | General |  |  | [177_FAQ_177.md](177_FAQ_177.md) |
| 178 | General |  |  | [178_FAQ_178.md](178_FAQ_178.md) |
| 179 | General |  |  | [179_FAQ_179.md](179_FAQ_179.md) |
| 180 | General |  |  | [180_FAQ_180.md](180_FAQ_180.md) |
| 181 | General |  |  | [181_FAQ_181.md](181_FAQ_181.md) |
| 182 | General |  |  | [182_FAQ_182.md](182_FAQ_182.md) |
| 183 | General |  |  | [183_FAQ_183.md](183_FAQ_183.md) |
| 184 | General |  |  | [184_FAQ_184.md](184_FAQ_184.md) |
| 185 | General |  |  | [185_FAQ_185.md](185_FAQ_185.md) |
| 186 | General |  |  | [186_FAQ_186.md](186_FAQ_186.md) |
| 187 | General |  |  | [187_FAQ_187.md](187_FAQ_187.md) |
| 188 | General |  |  | [188_FAQ_188.md](188_FAQ_188.md) |
| 189 | General |  |  | [189_FAQ_189.md](189_FAQ_189.md) |
| 190 | General |  |  | [190_FAQ_190.md](190_FAQ_190.md) |
| 191 | General |  |  | [191_FAQ_191.md](191_FAQ_191.md) |
| 192 | General |  |  | [192_FAQ_192.md](192_FAQ_192.md) |
| 193 | General |  |  | [193_FAQ_193.md](193_FAQ_193.md) |
| 194 | General |  |  | [194_FAQ_194.md](194_FAQ_194.md) |
| 195 | General |  |  | [195_FAQ_195.md](195_FAQ_195.md) |
| 196 | General |  |  | [196_FAQ_196.md](196_FAQ_196.md) |
| 197 | General |  |  | [197_FAQ_197.md](197_FAQ_197.md) |
| 198 | General |  |  | [198_FAQ_198.md](198_FAQ_198.md) |
| 199 | General |  |  | [199_FAQ_199.md](199_FAQ_199.md) |
| 200 | General |  |  | [200_FAQ_200.md](200_FAQ_200.md) |
| 201 | General |  |  | [201_FAQ_201.md](201_FAQ_201.md) |
| 202 | General |  |  | [202_FAQ_202.md](202_FAQ_202.md) |
| 203 | General |  |  | [203_FAQ_203.md](203_FAQ_203.md) |
| 204 | General |  |  | [204_FAQ_204.md](204_FAQ_204.md) |
| 205 | General |  |  | [205_FAQ_205.md](205_FAQ_205.md) |
| 206 | General |  |  | [206_FAQ_206.md](206_FAQ_206.md) |
| 207 | General |  |  | [207_FAQ_207.md](207_FAQ_207.md) |
| 208 | General |  |  | [208_FAQ_208.md](208_FAQ_208.md) |
| 209 | General |  |  | [209_FAQ_209.md](209_FAQ_209.md) |
| 210 | General |  |  | [210_FAQ_210.md](210_FAQ_210.md) |
| 211 | General |  |  | [211_FAQ_211.md](211_FAQ_211.md) |
| 212 | General |  |  | [212_FAQ_212.md](212_FAQ_212.md) |
| 213 | General |  |  | [213_FAQ_213.md](213_FAQ_213.md) |
| 214 | General |  |  | [214_FAQ_214.md](214_FAQ_214.md) |
| 215 | General |  |  | [215_FAQ_215.md](215_FAQ_215.md) |
| 216 | General |  |  | [216_FAQ_216.md](216_FAQ_216.md) |


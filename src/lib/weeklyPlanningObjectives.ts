export type WeeklyPlanningObjective = {
  id: string;
  name: string;
  help: string;
  theme: string;
  goal: string;
  planningRules: string[];
  knowledgeRetrievalQuery: string;
};

export type SelectedWeeklyPlanningObjective = Pick<WeeklyPlanningObjective, "id" | "name" | "planningRules" | "knowledgeRetrievalQuery">;
type WeeklyPlanningObjectiveSeed = Omit<WeeklyPlanningObjective, "knowledgeRetrievalQuery">;

type WeeklyPlanningMode =
  | "wedding"
  | "culture_tourism"
  | "heritage"
  | "stay"
  | "food"
  | "outdoor"
  | "museum"
  | "product"
  | "service";

const sharedPlanningRules = [
  "生成的是可发展成小红书生活分享的选题，不得写成运营方案、说明书、服务手册、销售话术或内部策划语言。",
  "不得为了覆盖信息而把每篇任务写成固定流程、完整清单或“先/再/最后”的内容结构。",
  "contentGoal 和 coreView 只描述读者能感受到的主题、事实与体验；不得描述创作方法、图文结构、执行步骤或内容分镜。",
  "除非用户在本周重点中明确要求，否则价格、预约、交通、人数、套餐、流程等只能作为辅助信息，不得自动成为选题主轴。"
];

const objectiveRules: Record<WeeklyPlanningMode, WeeklyPlanningObjectiveSeed[]> = {
  wedding: [
    {
      id: "wedding_details",
      name: "婚礼细节拆解",
      help: "适合婚礼账号冷启动：先从真实图片里拆出新人最想收藏的细节。",
      theme: "婚礼细节拆解和备婚收藏周",
      goal: "提升收藏和评论咨询，让备婚用户明确哪些细节值得参考、适合什么预算和场地",
      planningRules: [
        "不得把婚礼拆成布置清单、采购说明、预算表或供应商介绍；也不得只罗列使用了什么物料。",
        "不得把新人情绪写成模板化煽情，避免把一个细节扩写成泛泛的婚礼鸡汤。",
        "不得虚构新人故事、宾客反应、落地效果或现场评价。"
      ]
    },
    {
      id: "wedding_case_conversion",
      name: "真实案例转化",
      help: "适合已有真实婚礼案例的策划公司：用授权案例建立信任。",
      theme: "真实婚礼案例和咨询转化周",
      goal: "展示真实案例的审美、流程和落地能力，沉淀有效咨询",
      planningRules: [
        "不得把案例写成“我们提供了哪些服务”的复盘报告，也不得把流程职责作为主轴。",
        "不得虚构新人评价、成交过程、前后对比、预算效果或案例成果。",
        "不得默认把档期、套餐、价格和咨询方式拆成独立选题。"
      ]
    },
    {
      id: "wedding_service_experience",
      name: "婚礼体验服务",
      help: "适合展示策划服务、现场体验和新人决策过程，帮助用户理解服务价值。",
      theme: "婚礼策划服务和现场体验周",
      goal: "讲清婚礼策划服务能解决什么问题、体验流程和适合的新人类型，沉淀高意向咨询",
      planningRules: [
        "不得把服务流程逐步教学化，不得用“第几步做什么、谁负责什么”作为主要内容。",
        "不得将咨询转化、服务卖点和套餐权益堆成硬广告。",
        "不得承诺未确认的执行效果、档期或预算结果。"
      ]
    }
  ],
  culture_tourism: [
    {
      id: "destination_route",
      name: "目的地动线",
      help: "适合文旅项目冷启动：先让用户知道这里怎么逛、值不值得去。",
      theme: "文旅目的地动线攻略周",
      goal: "提升收藏和出行咨询，收集用户最关心的交通票务问题",
      planningRules: [
        "不得把每篇都写成完整行程表、交通说明、地图讲解或票务问答。",
        "不得默认强调停车、票价、时长和时间安排，避免让“怎么走”压过目的地体验。",
        "不得虚构距离、开放状态、动线体验或实际游览感受。"
      ]
    },
    {
      id: "festival_activity",
      name: "节庆活动",
      help: "适合有民俗节庆、演出、市集或季节活动的目的地。",
      theme: "节庆活动和周末玩法周",
      goal: "让用户明确活动时间、看点、动线和是否适合自己",
      planningRules: [
        "不得写成活动公告、节目单转述、报名通知或官方新闻稿。",
        "不得只罗列时间、地点和规则，避免让活动信息取代现场氛围和体验。",
        "不得虚构人流、热度、现场反馈、活动效果或参与体验。"
      ]
    },
    {
      id: "tourism_experience_product",
      name: "文旅体验产品",
      help: "适合把目的地的特色体验、线路产品和活动讲清楚。",
      theme: "目的地特色体验和文旅产品周",
      goal: "让用户明确当地有什么值得参与的体验、适合谁、如何预约和如何融入行程",
      planningRules: [
        "不得把体验写成套餐说明、预约流程、服务清单或价格对比。",
        "不得默认以报名方式、时长和适用人群作为唯一切入点。",
        "不得把目的地包装成适合所有人的旅游广告。"
      ]
    }
  ],
  heritage: [
    {
      id: "craft_story",
      name: "工艺故事",
      help: "适合民俗/非遗冷启动：先建立真实质感和文化信任。",
      theme: "非遗工艺故事周",
      goal: "提升收藏和体验咨询，收集用户想了解的工艺问题",
      planningRules: [
        "不得写成工艺百科、流程教材、历史资料汇编或非遗宣传稿。",
        "不得为了科普而逐步罗列制作步骤，也不得猎奇化民俗语境。",
        "不得替传承人虚构经历、情绪、观点或文化结论。"
      ]
    },
    {
      id: "heritage_booking",
      name: "体验预约",
      help: "适合已有工作坊、节庆活动或研学产品的项目。",
      theme: "民俗体验和预约转化周",
      goal: "让用户明确怎么参加、适合谁、时间地点和预约方式",
      planningRules: [
        "不得写成预约须知、收费说明、报名流程或课程介绍。",
        "不得让“怎么报名”取代“为什么会想亲手试一次”的体验表达。",
        "不得编造名额紧张、参与反馈、活动成果或体验效果。"
      ]
    },
    {
      id: "heritage_activity",
      name: "民俗活动体验",
      help: "适合展示节庆、工作坊和亲子研学等可参与的文化体验。",
      theme: "民俗活动和非遗体验周",
      goal: "让用户了解活动特色、参与流程、适合人群和体验价值，促进预约与研学咨询",
      planningRules: [
        "不得把活动写成流程表、亲子课程说明或活动成果汇报。",
        "不得把参与者、现场氛围和作品成果写成官方新闻稿。",
        "不得过度承诺教育价值、文化意义或参与收获。"
      ]
    }
  ],
  stay: [
    {
      id: "room_space",
      name: "房型空间",
      help: "适合民宿/酒店/营地冷启动：先把真实空间讲清楚。",
      theme: "房型空间和入住场景周",
      goal: "提升收藏和日期咨询，让用户判断是否适合入住",
      planningRules: [
        "不得写成平台详情页、设施清单、面积说明、入住条款或房型参数表。",
        "不得每篇都强调价格、人数、房态、退改和预订方式。",
        "不得把真实空间写成没有生活感的样板间，也不得虚构景观和设施。"
      ]
    },
    {
      id: "surrounding_experience",
      name: "周边体验",
      help: "适合把住宿从单一房间扩展成周末目的地。",
      theme: "住宿周边玩法周",
      goal: "让用户知道住这里能玩什么、适合几天几夜",
      planningRules: [
        "不得写成完整旅游攻略、交通地图或景点列表。",
        "不得让周边信息压过住在这里的放松感、停留节奏和生活体验。",
        "不得虚构步行距离、开放状态、周边活动或实际体验。"
      ]
    },
    {
      id: "destination_scenery",
      name: "目的地风景",
      help: "适合单独分享民宿所在旅游区的自然风景、景点与可确认旅游资源，不介绍民宿本身。",
      theme: "目的地风景和旅游资源周",
      goal: "用当地风景和旅游资源建立目的地吸引力，提升用户对这一片区域的向往与收藏",
      planningRules: [
        "本目标只讲民宿所在旅游区的风景、景点、自然环境或可确认旅游资源；不得介绍民宿房型、外观、院子、公共区、早餐、服务或入住体验。",
        "不得把民宿作为内容主体、镜头主体或叙事落点，也不得将住宿推荐、预订、房态、价格和套餐写入正文主线。",
        "不得写成完整旅游攻略、景点清单、交通地图、行程安排或景区宣传稿；应围绕一个具体景色、时段、季节或在地体验展开。",
        "不得虚构景点距离、开放状态、季节景观、游览体验、旅游资源或当地活动。"
      ]
    },
    {
      id: "stay_activity_service",
      name: "住宿活动服务",
      help: "适合展示住宿之外的餐饮、团建、亲子、接驳或季节活动服务。",
      theme: "住宿配套服务和活动体验周",
      goal: "让用户明确住宿能提供哪些配套服务和活动体验，提升预订咨询与停留时长",
      planningRules: [
        "不得写成服务项目说明、团建流程、套餐介绍或接驳须知。",
        "不得默认将价格、档期、预约和同行人数作为主要内容。",
        "不得虚构活动现场、参与者反馈或服务效果。"
      ]
    }
  ],
  food: [
    {
      id: "single_dish",
      name: "单菜品爆款",
      help: "适合餐饮冷启动：每篇只打透一道菜，让用户先记住招牌。",
      theme: "单菜品图文种草周",
      goal: "提升点击和收藏，收集用户最想点的菜品反馈",
      planningRules: [
        "不得把如何分切、如何夹取、菜品摆放位置、几个人如何分食作为内容目标或核心观点。",
        "不得自动写点单教学、套餐组合、价格、预约、停车或上菜流程。",
        "不得把同一道菜机械拆成菜品介绍、分享说明、人数说明和活动说明；多篇任务必须从风味、口感、食材、火候、分量、搭配或自然聚餐感中选择不同切入点。",
        "朋友聚餐或多人共享只能作为轻量背景，不得扩写为边切边聊、按部位夹取、如何分食或建议几个人点。"
      ]
    },
    {
      id: "food_activity_conversion",
      name: "活动转化",
      help: "适合有团购、节日套餐、上新、限时活动或游客套餐的门店。",
      theme: "营销活动和套餐转化周",
      goal: "让用户明确活动主推菜、适合几个人、多少钱、怎么预约、什么时候结束",
      planningRules: [
        "不得只写团购规则、活动期限、价格或套餐权益，也不得把活动海报改写成一篇帖。",
        "人数、套餐和价格可以出现，但不得脱离具体菜品和真实到店体验。",
        "不得制造限时稀缺、虚构折扣力度、销量或顾客抢购反馈。"
      ]
    },
    {
      id: "local_food",
      name: "当地特色",
      help: "适合游客型、本地菜、农家菜或有地域食材记忆点的门店。",
      theme: "当地特色菜和游客到店周",
      goal: "让用户知道来本地为什么要吃这道菜、适合什么行程后到店",
      planningRules: [
        "不得把“本地特色”写成地方知识讲解、游客攻略或交通停车说明。",
        "不得把地域标签硬贴在普通菜品上，也不得虚构产地、做法、历史或文化来源。",
        "不得默认把行程、人数和套餐作为当地特色内容的主轴。"
      ]
    },
    {
      id: "dining_experience",
      name: "到店体验",
      help: "适合展示用餐氛围、服务流程和适合不同人群的消费体验。",
      theme: "餐厅到店体验和服务周",
      goal: "让用户明确到店后的环境、服务、用餐场景和适合人群，降低消费顾虑并促进到店",
      planningRules: [
        "不得把服务流程、座位类型、包间、上菜顺序写成说明书。",
        "不得把适合几个人、坐在哪里、怎么分菜作为主要卖点。",
        "不得用空泛的氛围感、仪式感或高级感代替一顿饭真实的放松、聊天和停留感。"
      ]
    }
  ],
  outdoor: [
    {
      id: "route_diary",
      name: "路线日记",
      help: "适合冷启动：先让用户记住账号会提供真实、可判断的路线复盘。",
      theme: "户外路线日记周",
      goal: "提升点击和收藏，收集用户最想看的路线问题",
      planningRules: [
        "不得写成路线参数报告、安全手册或“我完成了什么”的流水账。",
        "不得每篇都罗列距离、爬升、交通、补给和装备清单。",
        "不得伪造亲历、天气、轨迹、登顶、身体极限或同行体验。"
      ]
    },
    {
      id: "route_guide",
      name: "攻略收藏",
      help: "适合把一条路线讲清楚，让用户觉得能照着走。",
      theme: "户外路线攻略收藏周",
      goal: "让用户明确路线难度、交通补给、时间和适合人群",
      planningRules: [
        "不得把每篇都做成全量攻略、装备清单、出发前检查表或交通换乘说明。",
        "不得让风险提示和参数罗列淹没路线本身的风景、体感与出发欲。",
        "不得把未核验的路线、开放状态、天气、补给和撤退信息写成确定事实。"
      ]
    },
    {
      id: "outdoor_activity_service",
      name: "户外活动服务",
      help: "适合有户外活动、领队、课程或装备服务的账号。",
      theme: "户外活动和装备服务体验周",
      goal: "讲清活动特色、参与门槛、服务流程和装备支持，沉淀报名与咨询",
      planningRules: [
        "不得写成报名说明、领队服务清单、课程介绍或装备售卖页。",
        "不得默认强调名额、价格、报名方式和服务保障。",
        "不得虚构活动现场、参与者反馈、专业资质或安全保障效果。"
      ]
    }
  ],
  museum: [
    {
      id: "exhibition_highlights",
      name: "展览看点",
      help: "适合展馆/研学冷启动：先让用户知道为什么值得看。",
      theme: "展览看点和观展动线周",
      goal: "提升收藏和预约咨询，让用户明确展期、看点和适合人群",
      planningRules: [
        "不得写成展讯公告、展签搬运、必看清单或票务问答。",
        "不得把开放时间、交通和票务作为默认主角。",
        "不得虚构展品故事、展期信息、观看感受或展馆活动。"
      ]
    },
    {
      id: "family_study",
      name: "亲子研学",
      help: "适合有研学课程、亲子讲解或教育产品的展馆。",
      theme: "亲子研学体验周",
      goal: "让家长明确适合年龄、学习点、时长和预约方式",
      planningRules: [
        "不得写成课程大纲、家长说明书、年龄段筛选表或预约流程。",
        "不得只谈教育价值和学习成果，避免把亲子体验写成招生宣传。",
        "不得承诺孩子一定学到什么，也不得虚构儿童参与反馈。"
      ]
    },
    {
      id: "museum_activity",
      name: "展馆活动体验",
      help: "适合推广展览活动、讲解、工作坊和节假日特别体验。",
      theme: "展馆活动和观展体验周",
      goal: "让用户了解展馆活动特色、参与方式和适合人群，促进预约与到馆",
      planningRules: [
        "不得写成活动通知、预约流程、现场流程表或报名须知。",
        "不得把票务、时间安排和参与方式写成全文。",
        "不得虚构活动人数、现场反应、参与成果或讲解效果。"
      ]
    }
  ],
  product: [
    {
      id: "product_seeding",
      name: "产品种草",
      help: "适合特产/文创冷启动：先讲清楚产品是什么、适合谁。",
      theme: "地域产品种草周",
      goal: "提升收藏和购买咨询，收集用户对规格价格的反馈",
      planningRules: [
        "不得写成电商详情页、规格参数表、卖点堆砌或购买教程。",
        "不得默认讲价格、库存、物流和购买路径。",
        "不得夸大功效、虚构使用反馈，也不得把产品写成没有生活场景的物件。"
      ]
    },
    {
      id: "gift_box_conversion",
      name: "礼盒转化",
      help: "适合节日礼盒、伴手礼或文创套装。",
      theme: "伴手礼和礼盒转化周",
      goal: "让用户明确送谁合适、规格价格、怎么购买",
      planningRules: [
        "不得写成送礼攻略、价格组合、促销海报或购买步骤。",
        "不得只按送谁、买几份、多少钱拆选题。",
        "不得制造节日焦虑、稀缺感，也不得虚构销量和购买反馈。"
      ]
    },
    {
      id: "tourism_souvenir",
      name: "文旅伴手礼体验",
      help: "适合把产品与当地旅行、节庆和礼赠场景结合起来。",
      theme: "地方伴手礼和文旅体验周",
      goal: "让用户理解产品的地域特色、使用场景和购买方式，促进伴手礼咨询与转化",
      planningRules: [
        "不得写成旅行纪念品说明、地域文化科普或景区导购。",
        "不得强行关联景区、节庆或游客身份。",
        "不得虚构产地故事、手作过程、旅客评价或地方传统。"
      ]
    }
  ],
  service: [
    {
      id: "service_trust",
      name: "服务信任",
      help: "适合本地服务冷启动：先把服务流程和边界讲清楚。",
      theme: "本地服务流程和信任周",
      goal: "提升评论咨询和预约意向，降低用户对价格和效果的顾虑",
      planningRules: [
        "不得写成服务流程手册、资质说明、成交话术或项目清单。",
        "不得把价格、周期和效果承诺作为默认主轴。",
        "不得虚构案例、前后对比、客户反馈或服务成果。"
      ]
    },
    {
      id: "service_questions",
      name: "问题问答",
      help: "适合收集用户真实顾虑，后续沉淀 FAQ。",
      theme: "本地服务顾虑问答周",
      goal: "收集用户关于价格、流程、适合人群和风险边界的问题",
      planningRules: [
        "不得写成 FAQ 汇编、客服标准回复、条款清单或风险告知书。",
        "不得为了降低顾虑而把正文写成售前咨询对话。",
        "不得替用户制造焦虑，也不得对未确认问题给出确定承诺。"
      ]
    },
    {
      id: "service_activity",
      name: "服务活动体验",
      help: "适合有体验课、主题活动、会员权益或阶段性服务项目的本地服务账号。",
      theme: "本地服务活动和体验周",
      goal: "讲清服务活动的特色、流程、适合人群和参与方式，促进预约与有效咨询",
      planningRules: [
        "不得写成活动通知、会员权益说明、报名须知或服务项目说明。",
        "不得让名额、价格、截止时间和套餐成为唯一内容。",
        "不得虚构参与者体验、现场效果、服务成果或阶段性改变。"
      ]
    }
  ]
};

const objectiveKnowledgeRetrievalQueries: Record<string, string> = {
  wedding_details: "婚礼细节、花艺、甜品、仪式区、桌花、纸品、灯光、材质、配色、可确认场景",
  wedding_case_conversion: "真实婚礼案例、场地条件、设计细节、已确认服务范围、案例边界",
  wedding_service_experience: "婚礼策划服务、现场体验、沟通方式、服务边界、适合的新人场景",
  destination_route: "目的地动线、游览体验、景观、停留场景、可确认服务信息",
  festival_activity: "节庆活动、演出、市集、季节体验、活动看点、可确认参与条件",
  tourism_experience_product: "目的地体验、特色活动、线路产品、场景亮点、可确认服务内容",
  craft_story: "工艺细节、材料、工具、作品、制作体验、文化背景、可确认事实",
  heritage_booking: "体验活动、工作坊、参与条件、时间地点、预约方式、限制条件",
  heritage_activity: "民俗活动、亲子研学、现场体验、活动内容、可确认参与信息",
  room_space: "房型、空间、窗景、设施、入住体验、可确认房间细节",
  surrounding_experience: "住宿周边、自然风景、餐饮、活动、停留体验、可确认出行信息",
  destination_scenery: "民宿所在旅游区、自然风景、景点、山水林地、步道水岸、季节景观、可确认旅游资源",
  stay_activity_service: "住宿配套、餐饮、亲子活动、团建、接驳、服务边界",
  single_dish: "主推菜品、食材、风味、口感、分量、制作特点、用餐场景",
  food_activity_conversion: "套餐、活动规则、适用条件、预约方式、时间限制、不可承诺事项",
  local_food: "本地食材、地域风味、地点、体验、可确认特色",
  dining_experience: "门店空间、服务、到店场景、真实体验细节",
  route_diary: "路线风景、行走体验、关键路况、季节体感、可确认路线事实",
  route_guide: "路线难度、距离爬升、交通补给、装备、撤退点、可确认安全边界",
  outdoor_activity_service: "户外活动、装备支持、参与门槛、服务流程、可确认活动信息",
  exhibition_highlights: "展览看点、展品、展厅、观展体验、展期与可确认服务信息",
  family_study: "亲子研学、讲解内容、适合年龄、活动体验、可确认参与条件",
  museum_activity: "展馆活动、教育体验、现场内容、预约方式、可确认活动信息",
  product_seeding: "产品、原料、工艺、使用场景、规格、可确认产品特点",
  gift_box_conversion: "礼盒、包装、送礼场景、规格、购买方式、时间限制",
  tourism_souvenir: "地方伴手礼、地域特色、产品体验、送礼场景、可确认购买信息",
  service_trust: "服务内容、真实空间、设备、流程、资质、可确认服务边界",
  service_questions: "服务常见问题、适合人群、流程、风险边界、可确认说明",
  service_activity: "服务活动、会员体验、参与条件、时间限制、可确认权益"
};

function withKnowledgeRetrievalQuery(objective: WeeklyPlanningObjectiveSeed): WeeklyPlanningObjective {
  return {
    ...objective,
    knowledgeRetrievalQuery: objectiveKnowledgeRetrievalQueries[objective.id] || objective.name
  };
}

function modeForAccountType(accountType?: string): WeeklyPlanningMode {
  if (accountType === "wedding_planning") return "wedding";
  if (["hiking_diary", "outdoor_travel", "mountain_route", "city_walk_nature", "overseas_hiking"].includes(accountType || "")) return "outdoor";
  if (["restaurant", "cafe_bakery", "hotpot_bbq_latenight", "bar_lightmeal"].includes(accountType || "")) return "food";
  if (accountType === "folk_custom_heritage") return "heritage";
  if (accountType === "homestay_hotel_camp") return "stay";
  if (accountType === "museum_exhibition_study") return "museum";
  if (accountType === "regional_product_cultural_creative") return "product";
  if (accountType === "local_life_service") return "service";
  return "culture_tourism";
}

export function getWeeklyPlanningObjectives(accountType?: string) {
  return objectiveRules[modeForAccountType(accountType)].map(withKnowledgeRetrievalQuery);
}

export function combineWeeklyPlanningObjectives(objectives: WeeklyPlanningObjective[]) {
  const active = objectives.length ? objectives : getWeeklyPlanningObjectives("restaurant").slice(0, 1);
  if (active.length === 1) return active[0];
  return {
    id: active.map((objective) => objective.id).join("+"),
    name: active.map((objective) => objective.name).join(" + "),
    help: active.map((objective) => objective.help).filter(Boolean).join("；"),
    theme: `${active.map((objective) => objective.name).join(" + ")}综合周`,
    goal: active.map((objective) => objective.goal).filter(Boolean).join("；"),
    planningRules: active.flatMap((objective) => objective.planningRules),
    knowledgeRetrievalQuery: active.map((objective) => objective.knowledgeRetrievalQuery).filter(Boolean).join("；")
  } satisfies WeeklyPlanningObjective;
}

export function selectedWeeklyPlanningObjectives(
  accountType: string | undefined,
  ids: string[]
): SelectedWeeklyPlanningObjective[] {
  const available = getWeeklyPlanningObjectives(accountType);
  const selected = available.filter((objective) => ids.includes(objective.id));
  const active = selected.length ? selected : available.slice(0, 1);
  return active.map(({ id, name, planningRules, knowledgeRetrievalQuery }) => ({ id, name, planningRules, knowledgeRetrievalQuery }));
}

export function selectedWeeklyPlanningObjectivesFromTheme(accountType: string | undefined, theme: string | null | undefined) {
  const text = String(theme || "");
  return getWeeklyPlanningObjectives(accountType)
    .filter((objective) => text.includes(objective.name))
    .map(({ id, name, planningRules, knowledgeRetrievalQuery }) => ({ id, name, planningRules, knowledgeRetrievalQuery }));
}

export function formatWeeklyPlanningObjectiveRules(objectives: SelectedWeeklyPlanningObjective[]) {
  const blocks = objectives.map((objective) => [
    `### ${objective.name}`,
    ...objective.planningRules.map((rule) => `- ${rule}`)
  ].join("\n"));
  return [
    "## 已选本周运营目标的专项限制（必须遵守）",
    ...sharedPlanningRules.map((rule) => `- ${rule}`),
    "",
    ...blocks
  ].join("\n");
}

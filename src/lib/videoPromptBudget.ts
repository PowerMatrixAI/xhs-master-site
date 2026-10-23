// Generation guidance, not a post-generation truncation or compression pass.
export const VIDEO_SCRIPT_BUDGET = `篇幅预算：下游完整任务需控制在18000字符以内，目标16000字符，输出应短而完整。
脚本JSON目标不超过6500字符（含字段名与标点）。title≤35字、summary≤160字、perspective/情绪主线≤80字；每镜role/beat≤25字、description≤90字、mainAction≤45字、continuityNote≤45字、suggestedMaterial≤35字。
人物appearance≤50字；位置和姿态各≤20字，道具项≤25字，状态只列实际出镜人物和关键道具，不复述房间装饰。转场reason/outgoingState/incomingState各≤40字。保留所有必要人物、事件、道具与事实，不为节省篇幅删除身份或状态。
字段之间各司其职：description概括事件，mainAction只写主要动作，start/end只写快照；不要在每个字段重复整段剧情和通用禁令。noteTask字段用短句，不写长篇运营分析。以上为表达长度目标，不得为省字删除必填字段、人物或镜头；完整合法JSON优先。`;

export const VIDEO_FRAME_BUDGET = `输出篇幅：framePrompt每镜目标120-220字符，最多260字符；overallDirection≤90字符。保留场景事实、人物数量/位置、必要构图光影；不重复脚本全文、人物表、起止状态JSON或通用执行/验收规则，控制台会补充人物约束。`;
export const VIDEO_MOTION_BUDGET = `输出篇幅：mainVideoPrompt每镜≤140字符，endingTransitionPrompt≤45字符；只写可执行运动、速度和收束，不复述首帧全文、人物外观、状态JSON或通用操作规则。已有mainAction时只补充其运动细节，不扩展新事件。`;

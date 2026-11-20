export const VLOG_CHARACTERS = {
  linchuan: {
    id: "324641305202280", bindName: "林川-山林周末Vlog", type: "image", characterId: "A", version: 2,
    appearance: "28岁东亚男性，黑短发，无胡须眼镜；沙米卷袖衬衫、灰绿长裤、米灰鞋、深棕帆布包左肩左髋"
  },
  shenhe: {
    id: "325994250221723", bindName: "沈禾-田园度假Vlog", type: "image", characterId: "A", version: 1,
    appearance: "27岁东亚女性，鹅蛋脸、深棕杏眼、黑棕低盘发及脸侧碎发、小金耳钉；奶油白无袖V领棉麻及踝长裙、棕色平底细带凉鞋。户外麦色草帽配深色窄帽带，室内可摘帽，无肩包"
  },
  xucheng: {
    id: "326962660226067", bindName: "许澄-泳池度假Vlog", type: "image", characterId: "A", version: 1,
    appearance: "25岁东亚女性，身形纤细，黑色低马尾，自然笑容；珊瑚色方领连体泳衣，细罗纹面料与前襟褶结，赤脚，无配饰"
  }
} as const;
export type VlogCharacterSelection = keyof typeof VLOG_CHARACTERS | "none";
export function isVlogCharacterKey(value: unknown): value is keyof typeof VLOG_CHARACTERS {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(VLOG_CHARACTERS, value);
}

export function vlogCharacterSelection(value: unknown): VlogCharacterSelection {
  if (value === undefined) return "linchuan"; // Existing tasks keep their default.
  if (isVlogCharacterKey(value) || value === "none") return value;
  throw new Error("请选择有效人物形象或不添加人物。");
}

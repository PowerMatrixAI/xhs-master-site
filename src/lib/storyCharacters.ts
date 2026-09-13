export type StoryCharacter = {
  id: string;
  templateId: string;
  name: string;
  description: string;
  imagePath: string;
};

const characters: StoryCharacter[] = [
  { id: "cat-orange", templateId: "cat_moon_post", name: "橘白猫邮差", description: "橘白色小猫、绿色邮差挎包，外观以参考图为准。", imagePath: "/story-characters/cat-orange.png" },
  { id: "cat-gray", templateId: "cat_moon_post", name: "灰白猫邮差", description: "灰白色小猫、蓝色邮差挎包，外观以参考图为准。", imagePath: "/story-characters/cat-gray.png" },
  { id: "niu-brown", templateId: "niu_lai_dream", name: "牛来·橙棕版", description: "橙棕色拟人小牛、浅色口鼻、无服装配饰，外观以参考图为准。", imagePath: "/story-characters/niu-brown.png" },
  { id: "niu-black-white", templateId: "niu_lai_dream", name: "牛来·黑白围巾版", description: "黑白色小牛、黄色围巾，平台临时原创形象，外观以参考图为准。", imagePath: "/story-characters/niu-black-white.png" },
  { id: "dog-corgi", templateId: "dog_reverse_map", name: "小狗·柯基探索版", description: "金白色柯基幼犬、蓝色探索背心、红色指南针吊牌和地图小包，外观以参考图为准。", imagePath: "/story-characters/dog-corgi.png" },
  { id: "dog-black", templateId: "dog_reverse_map", name: "小狗·黑白雨衣版", description: "黑白色小狗、黄色雨衣、深蓝地图挎包，外观以参考图为准。", imagePath: "/story-characters/dog-black.png" },
  { id: "fox-red", templateId: "fox_borrowed_moon", name: "小狐狸·红狐月灯版", description: "赤红色小狐狸、深蓝月纹短斗篷、弯月提灯，外观以参考图为准。", imagePath: "/story-characters/fox-red.png" },
  { id: "fox-silver", templateId: "fox_borrowed_moon", name: "小狐狸·银狐围巾版", description: "银灰色小狐狸、苔绿针织围巾、月牙挂饰提灯，外观以参考图为准。", imagePath: "/story-characters/fox-silver.png" },
  { id: "rabbit-white", templateId: "rabbit_last_train", name: "小兔子·白兔站务版", description: "白色垂耳小兔、深蓝站务帽和制服、棕色票夹挎包，外观以参考图为准。", imagePath: "/story-characters/rabbit-white.png" },
  { id: "rabbit-brown", templateId: "rabbit_last_train", name: "小兔子·棕兔怀表版", description: "肉桂棕色垂耳小兔、砖红针织衫、棕色背包和黄铜怀表，外观以参考图为准。", imagePath: "/story-characters/rabbit-brown.png" }
];

const templateIds = ["cat_moon_post", "dog_reverse_map", "niu_lai_dream", "fox_borrowed_moon", "rabbit_last_train"];

// 后续服务端角色列表只需替换此数据入口。
export function getStoryCharacters(templateId: string): StoryCharacter[] {
  return characters.filter((character) => character.templateId === templateId);
}

export function resolveStoryCharacter(templateId: string, characterId?: string): StoryCharacter | null {
  if (!templateIds.includes(templateId)) throw new Error("故事模板无效。");
  const options = getStoryCharacters(templateId);
  if (!options.length && !characterId) return null;
  const character = options.find((item) => item.id === characterId);
  if (!character) throw new Error("请选择当前故事模板对应的主角形象。");
  return character;
}

export function characterDownloadUrl(character: StoryCharacter, publicBaseUrl: string): string {
  if (!publicBaseUrl) return "";
  const url = new URL(publicBaseUrl);
  if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(url.hostname) || /\.(localhost|local)$/.test(url.hostname)) {
    throw new Error("角色图片公网地址必须是外部可访问的 HTTPS 地址。");
  }
  return new URL(character.imagePath, url).href;
}

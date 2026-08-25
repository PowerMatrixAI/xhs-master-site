type DateLike = string | Date;

export type AccountTypeTemplate = {
  id: number;
  typeKey: string;
  name: string;
  defaultColumns: string;
  weeklyRatio: string;
  imageStrategy: string;
  titleStrategy: string;
  coverStrategy: string;
  interactionStrategy: string;
  commercializationPath: string;
  riskRules: string;
  promptRules: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
};

export type AccountStrategy = {
  id?: number;
  accountId?: number;
  positioning: string;
  strategyJson: string;
  markdown: string;
  agentsMdContent?: string;
  execGuide: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
};

export type Asset = {
  id: number;
  filePath: string;
  fileUrl?: string | null;
  fileType: string;
  sourceType: string;
  location?: string;
  shotAt?: DateLike;
  tags: string;
  suitableTypes: string;
  coverReady: boolean;
  used: boolean;
  authorizationState?: string;
  riskNotes: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  hash?: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
};

export type NoteTask = {
  id: number;
  accountId?: number;
  weeklyPlanId?: number;
  publishAt: DateLike;
  contentType: string;
  contentGoal: string;
  topicTitle: string;
  targetUser: string;
  painPoint: string;
  coreView: string;
  bodyStructure: string;
  requiredImages: string;
  recommendedAssets: string;
  coverCopyDirection: string;
  commentHook: string;
  expectedGoal: string;
  status: string;
  knowledgeSourceKeys?: string[];
  bodyDraft?: string;
  imagePlan?: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
};

export type WeeklyPlan = {
  id: number;
  accountId?: number;
  weekStart: DateLike;
  theme: string;
  goal: string;
  frequency: number;
  ratio: string;
  testHypothesis: string;
  commercializationMove: string;
  interactionGoal: string;
  availableAssets: string;
  taboos: string;
  status?: string;
  knowledgeSnapshotId?: string;
  noteTasks?: NoteTask[];
  createdAt?: DateLike;
  updatedAt?: DateLike;
};

export type AccountReferenceResearch = {
  id: number;
  accountId?: number;
  searchKeywords: string;
  commandJson: string;
  researchPrompt: string;
  rawResults: string;
  selectedAccounts: string;
  summaryMarkdown: string;
  contentFeatures: string;
  personaInsights?: string;
  strategyInsights?: string;
  status: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
};

export type AccountImageStyleStudy = {
  id: number;
  accountId?: number;
  searchKeywords: string;
  commandJson: string;
  researchPrompt: string;
  rawResults: string;
  summaryMarkdown: string;
  styleBriefJson: string;
  status: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
};

export type ExpertRule = {
  id: number;
  accountType: string;
  module: string;
  rule: string;
  source: string;
  confidence: number;
  status: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
};

export type Account = {
  id: number;
  name: string;
  accountParam: string;
  accountType: string;
  stage: string;
  personaBase: string;
  city: string;
  targetUsers: string;
  painPoints: string;
  contentDirections: string;
  businessGoals: string;
  monetization: string;
  referenceAccounts: string;
  materialCondition: string;
  taboos: string;
  profilePath: string;
  assetsPath: string;
  status?: string;
  strategy?: AccountStrategy | null;
  assets?: Asset[];
  weeklyPlans?: WeeklyPlan[];
  referenceResearches?: AccountReferenceResearch[];
  imageStyleStudies?: AccountImageStyleStudy[];
  expertRules?: ExpertRule[];
  createdAt?: DateLike;
  updatedAt?: DateLike;
};

export type Locale = "en" | "zh";

export const translations = {
  en: {
    // app
    appName: "🐑 咩咩~嗷呜 🐺",

    // auth
    signIn: "Sign in",
    signOut: "Sign out",
    register: "Register",
    createAccount: "Create account",
    username: "Username",
    usernameHint: "lowercase, no spaces",
    usernamePlaceholder: "e.g. sarah",
    displayNameLabel: "Display name",
    displayNameHint: "optional",
    displayNamePlaceholder: "leave blank to use username",
    phone: "Phone",
    phoneHint: "optional",
    phonePlaceholder: "e.g. +86 138 0000 0000",
    password: "Password",
    signingIn: "Signing in…",
    creatingAccount: "Creating account…",
    noAccount: "No account?",
    alreadyHaveAccount: "Already have an account?",

    // lists home
    myLists: "My Lists",
    newListButton: "+ New",
    loading: "Loading…",
    noListsYet: "No lists yet.",
    createFirstList: "Create your first list",
    sharedWith: "shared with",
    fromUser: "from",
    notSharedYet: "not shared yet",
    itemSingular: "item",
    itemPlural: "items",

    // list detail
    listNotFound: "List not found.",
    unshare: "Unshare",
    share: "Share",
    delete: "Delete",
    deleteListConfirm: "Delete this list? This cannot be undone.",
    unshareConfirm: "Unshare this list? {name} will lose editing access. Items they've added will remain.",
    wantToCreate: "Want to create your own list?",
    getStarted: "Get started",
    by: "by",

    // new list modal
    newListTitle: "New list",
    titleLabel: "Title",
    titlePlaceholder: "e.g. Cafes to Try",
    categoryLabel: "Category",
    publicListLabel: "Public list",
    publicListHint: "Anyone can discover and view this list",
    creating: "Creating…",
    createList: "Create list",

    // edit list modal
    editList: "Edit list",
    secondaryFieldLabel: "Secondary field label",
    secondaryFieldHint: "e.g. Address, Artist — optional",
    secondaryFieldPlaceholder: "leave blank to hide",
    saving: "Saving…",
    saveChanges: "Save changes",
    titleRequired: "Title is required",

    // add item modal
    addItem: "Add item",
    nameLabel: "Name",
    whyLabel: "Why?",
    optional: "optional",
    uploading: "Uploading…",
    adding: "Adding…",

    // share modal
    shareList: "Share list",
    shareWithLabel: "Share with (username)",
    sharePlaceholder: "e.g. sarah",
    sharing: "Sharing…",

    // item list
    noItemsOwner: "No items yet. Add the first one!",
    noItemsRecipient: "Nothing here yet.",
    dragToReorder: "Drag to reorder",
    deleteItem: "Delete item",
    removeItemConfirm: "Remove this item?",
    tapToChange: "— tap to change",

    // photos
    photosLabel: "Photos",
    photosHint: "optional, up to {max}",
    photoButton: "photo",
    pasteHintMac: "Or paste an image with ⌘V",
    pasteHintOther: "Or paste an image with Ctrl+V",

    // edit item
    editItem: "Edit item",

    // public/private
    publicBadge: "Public",
    privateBadge: "Private",

    // profile
    profile: "Profile",
    currentPassword: "Current password",
    newPasswordLabel: "New password",
    leaveBlankToKeep: "leave blank to keep",
    profileSaved: "Saved!",
    errorWrongPassword: "Current password is incorrect",

    // categories
    categoryCoffee: "Coffee Shops",
    categoryMusic: "Music",
    categoryRestaurant: "Restaurants",
    categoryBook: "Books",
    categoryMovie: "Movies",
    categoryCustom: "Custom",
    categoryText: "Notes",
    categoryCamera: "Camera Roll",
    categoryScreenshots: "Screenshots",
    categoryShopping: "Shopping",
    categoryTears: "Tears",
    textTitlePlaceholder: "Title (optional)",
    textBodyPlaceholder: "Start writing…",
    textBodyLabel: "Content",
    textUntitled: "(untitled)",
    textEmptyNote: "Empty note",
    newNote: "New note",

    // landing
    tagline: "Curated recommendations, shared with the people you care about.",
    communityLists: "Lists from the community",
    noPublicLists: "No public lists yet.",
    beFirst: "Be the first to create one",
    createYours: "Create your own list →",

    // vocab challenge
    mieButton: "🐑 咩~",
    mieTitle: "Forgot password?",
    mieSharedUserLabel: "Username of someone you've shared a list with",
    mieSharedUserPlaceholder: "their username",
    mieInstructions: "Use this word in a sentence, or translate it to Chinese:",
    mieAnswerPlaceholder: "Type a sentence or Chinese translation…",
    mieSubmit: "Submit",
    mieEvaluating: "Professor is reading…",
    mieLoginCountdown: "Logging in in {n}s…",
    mieWrongRetry: "Try again",
    mieNewWord: "New word",

    // photo search
    searchPhotoTitle: "Search for a photo",
    searchPhotoPlaceholder: "Search…",
    searchPhotoButton: "Search",
    searchPhotoSearching: "Searching…",
    searchPhotoAdding: "Adding…",
    searchPhotoNoResults: "No results. Try a different query.",
    searchPhotoError: "Search failed — check SERPER_API_KEY",

    // AI import
    importButton: "AI",
    importTitle: "Import from text",
    importStep1Hint: "Paste any text — notes, messages, markdown lists, anything with recommendations",
    importParseButton: "Parse with AI",
    importParsing: "Parsing…",
    importPreviewHint: "Review and edit before adding",
    importAddButton: "Add {n} items",
    importAdding: "Adding…",
    importBack: "← Edit text",
    importErrorParse: "Could not parse — please try again",
    importErrorAdd: "Failed to add items",
    importNoItems: "No items found. Try adding more detail.",

    // view mode
    viewModeList: "List",
    viewModeWaterfall: "Grid",

    // reactions & comments
    comments: "Comments",
    addComment: "Add a comment…",
    yourName: "Your name",
    postComment: "Post",
    posting: "Posting…",
    noComments: "No comments yet.",
    itemCommentHint: "on {item}",

    // modals
    unsavedChanges: "You have unsaved changes. Discard them?",

    // errors
    errorRequired: "Username and password are required",
    errorUsernamePattern: "Username must be 3-30 lowercase letters, numbers, or underscores",
    errorUsernameTaken: "Username already taken",
    errorInvalidCredentials: "Invalid username or password",
    errorPasswordLength: "Password must be at least 8 characters",
    errorCreateList: "Failed to create list",
    errorAddItem: "Failed to add item",
    errorSave: "Failed to save",
    errorShare: "Failed to share",
    errorRegister: "Registration failed",
    errorLogin: "Login failed",
  },

  zh: {
    appName: "🐑 咩咩~嗷呜 🐺",

    signIn: "登录",
    signOut: "退出登录",
    register: "注册",
    createAccount: "创建账户",
    username: "用户名",
    usernameHint: "小写字母，无空格",
    usernamePlaceholder: "如 sarah",
    displayNameLabel: "显示名称",
    displayNameHint: "可选",
    displayNamePlaceholder: "留空则使用用户名",
    phone: "手机号",
    phoneHint: "可选",
    phonePlaceholder: "如 +86 138 0000 0000",
    password: "密码",
    signingIn: "登录中…",
    creatingAccount: "创建中…",
    noAccount: "没有账户？",
    alreadyHaveAccount: "已有账户？",

    myLists: "我的列表",
    newListButton: "+ 新建",
    loading: "加载中…",
    noListsYet: "还没有列表。",
    createFirstList: "创建第一个列表",
    sharedWith: "分享给",
    fromUser: "来自",
    notSharedYet: "尚未分享",
    itemSingular: "项",
    itemPlural: "项",

    listNotFound: "找不到该列表。",
    unshare: "取消分享",
    share: "分享",
    delete: "删除",
    deleteListConfirm: "确认删除该列表？此操作不可撤销。",
    unshareConfirm: "取消与 {name} 的共享？对方将失去编辑权限，已添加的项目将保留。",
    wantToCreate: "想创建自己的列表？",
    getStarted: "立即注册",
    by: "",

    newListTitle: "新建列表",
    titleLabel: "标题",
    titlePlaceholder: "如 想去的咖啡馆",
    categoryLabel: "分类",
    publicListLabel: "公开列表",
    publicListHint: "所有人均可发现和查看此列表",
    creating: "创建中…",
    createList: "创建列表",

    editList: "编辑列表",
    secondaryFieldLabel: "副字段标签",
    secondaryFieldHint: "如 地址、艺术家 — 可选",
    secondaryFieldPlaceholder: "留空则隐藏",
    saving: "保存中…",
    saveChanges: "保存更改",
    titleRequired: "标题不能为空",

    addItem: "添加项目",
    nameLabel: "名称",
    whyLabel: "推荐理由",
    optional: "可选",
    uploading: "上传中…",
    adding: "添加中…",

    shareList: "分享列表",
    shareWithLabel: "分享给（用户名）",
    sharePlaceholder: "如 sarah",
    sharing: "分享中…",

    noItemsOwner: "还没有项目，添加第一个吧！",
    noItemsRecipient: "这里还什么都没有。",
    dragToReorder: "拖拽排序",
    deleteItem: "删除项目",
    removeItemConfirm: "确认删除该项目？",
    tapToChange: "— 点击切换",

    photosLabel: "照片",
    photosHint: "可选，最多 {max} 张",
    photoButton: "照片",
    pasteHintMac: "或用 ⌘V 粘贴图片",
    pasteHintOther: "或用 Ctrl+V 粘贴图片",

    editItem: "编辑项目",

    publicBadge: "公开",
    privateBadge: "私密",

    profile: "个人资料",
    currentPassword: "当前密码",
    newPasswordLabel: "新密码",
    leaveBlankToKeep: "留空则不修改",
    profileSaved: "已保存！",
    errorWrongPassword: "当前密码不正确",

    categoryCoffee: "咖啡馆",
    categoryMusic: "音乐",
    categoryRestaurant: "餐厅",
    categoryBook: "书籍",
    categoryMovie: "电影",
    categoryCustom: "自定义",
    categoryText: "笔记",
    categoryCamera: "拍摄",
    categoryScreenshots: "截图",
    categoryShopping: "购物清单",
    categoryTears: "泪目",
    textTitlePlaceholder: "标题（可选）",
    textBodyPlaceholder: "开始写作…",
    textBodyLabel: "内容",
    textUntitled: "（无标题）",
    textEmptyNote: "空白笔记",
    newNote: "新建笔记",

    tagline: "精心整理的推荐，与你在乎的人分享。",
    communityLists: "社区列表",
    noPublicLists: "还没有公开列表。",
    beFirst: "成为第一个创建的人",
    createYours: "创建你自己的列表 →",

    mieButton: "🐑 咩~",
    mieTitle: "忘记密码？",
    mieSharedUserLabel: "你曾与之共享列表的用户名",
    mieSharedUserPlaceholder: "对方的用户名",
    mieInstructions: "用这个词造句，或翻译成中文：",
    mieAnswerPlaceholder: "写句子或中文翻译…",
    mieSubmit: "提交",
    mieEvaluating: "教授阅卷中…",
    mieLoginCountdown: "{n}秒后登录…",
    mieWrongRetry: "再试一次",
    mieNewWord: "换一个词",

    searchPhotoTitle: "搜索图片",
    searchPhotoPlaceholder: "搜索…",
    searchPhotoButton: "搜索",
    searchPhotoSearching: "搜索中…",
    searchPhotoAdding: "添加中…",
    searchPhotoNoResults: "未找到结果，换个词试试。",
    searchPhotoError: "搜索失败，请检查 SERPER_API_KEY",

    importButton: "AI",
    importTitle: "从文字导入",
    importStep1Hint: "粘贴任意文字 — 笔记、消息、Markdown 列表等推荐内容",
    importParseButton: "AI 解析",
    importParsing: "解析中…",
    importPreviewHint: "添加前可以编辑修改",
    importAddButton: "添加 {n} 个项目",
    importAdding: "添加中…",
    importBack: "← 重新编辑",
    importErrorParse: "解析失败，请重试",
    importErrorAdd: "添加失败",
    importNoItems: "未找到项目，请提供更详细的内容。",

    viewModeList: "列表",
    viewModeWaterfall: "瀑布",

    comments: "评论",
    addComment: "写下评论…",
    yourName: "你的名字",
    postComment: "发送",
    posting: "发送中…",
    noComments: "还没有评论。",
    itemCommentHint: "关于 {item}",

    unsavedChanges: "有未保存的修改，确认丢弃？",

    errorRequired: "用户名和密码为必填",
    errorUsernamePattern: "用户名须为 3-30 个小写字母、数字或下划线",
    errorUsernameTaken: "用户名已被占用",
    errorInvalidCredentials: "用户名或密码错误",
    errorPasswordLength: "密码至少需要 8 个字符",
    errorCreateList: "创建列表失败",
    errorAddItem: "添加项目失败",
    errorSave: "保存失败",
    errorShare: "分享失败",
    errorRegister: "注册失败",
    errorLogin: "登录失败",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function tr(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  let str = translations[locale][key] as string;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}

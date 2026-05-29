// I18N-1: 翻译字典。zh 为「源真相」语言——值即当前线上所有中文文案,
// 故迁移到 t() 后中文用户看到的内容一字不变。en 为渐进补全的英文翻译。
//
// 这是「基础设施 + 代表性切片」:只搬运了登录页、导航空状态、访客横幅、
// 常用按钮等代表性文案;其余字符串留待后续增量迁移(基础已就绪)。
//
// key 命名约定:`域.具体含义`,例如 common.save / login.title / nav.empty.noGroupsTitle。

import type { Dictionaries } from "./translate";

export const dictionaries: Dictionaries = {
  zh: {
    // 通用按钮 / 词汇
    "common.save": "保存",
    "common.cancel": "取消",
    "common.delete": "删除",
    "common.confirm": "确认",
    "common.done": "完成",
    "common.close": "关闭",
    "common.login": "登录",
    "common.language": "语言",

    // 登录页
    "login.bothDisabled": "当前未启用任何登录方式，请联系管理员。",
    "login.sso": "使用 Casdoor 登录",
    "login.switchToPassword": "使用账号密码登录",
    "login.switchToSso": "返回 SSO 登录",
    "login.usernamePlaceholder": "用户名或邮箱",
    "login.passwordPlaceholder": "密码",
    "login.submit": "登录",
    "login.submitting": "登录中…",
    "login.firstRunHintHtml":
      "首次使用？默认账号 <b>superadmin</b> / 密码 <b>superadmin</b>，登录后请立即修改。",
    "login.dismissHint": "不再提示",
    "login.err.ssoRequired": "该账号仅支持 SSO 登录",
    "login.err.passwordDisabled": "管理员已关闭密码登录",
    "login.err.badCredentials": "账号或密码错误",
    "login.err.generic": "登录失败",

    // 访客横幅
    "guest.banner": "你正在以访客身份浏览，登录后可保存图标、组件与个性化设置。",

    // 导航空状态
    "nav.empty.noGroupsTitle": "还没有任何分类",
    "nav.empty.noGroupsDescEditable": "创建第一个分类来归置你的网站和小组件。",
    "nav.empty.noGroupsDescReadonly": "当前还没有可浏览的内容。",
    "nav.empty.addFirstGroup": "添加第一个分类",
    "nav.empty.noItemsTitle": "这个分类还没有网站",
    "nav.empty.noItemsDescEditable": "添加第一个网站,或从右键菜单加入小组件。",
    "nav.empty.noItemsDescReadonly": "当前分类暂时没有内容。",
    "nav.empty.addFirstIcon": "添加第一个网站",
    "nav.add": "添加",

    // 设置面板:语言
    "settings.language": "界面语言",
    "lang.zh": "简体中文",
    "lang.en": "English",
  },
  en: {
    // Common buttons / words
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.confirm": "Confirm",
    "common.done": "Done",
    "common.close": "Close",
    "common.login": "Log in",
    "common.language": "Language",

    // Login
    "login.bothDisabled":
      "No sign-in method is enabled. Please contact your administrator.",
    "login.sso": "Sign in with Casdoor",
    "login.switchToPassword": "Use username & password",
    "login.switchToSso": "Back to SSO",
    "login.usernamePlaceholder": "Username or email",
    "login.passwordPlaceholder": "Password",
    "login.submit": "Log in",
    "login.submitting": "Logging in…",
    "login.firstRunHintHtml":
      "First time here? Default account <b>superadmin</b> / password <b>superadmin</b> — change it right after signing in.",
    "login.dismissHint": "Don't show again",
    "login.err.ssoRequired": "This account only supports SSO login.",
    "login.err.passwordDisabled": "Password login is disabled by the administrator.",
    "login.err.badCredentials": "Incorrect username or password.",
    "login.err.generic": "Sign-in failed.",

    // Guest banner
    "guest.banner":
      "You're browsing as a guest. Sign in to save icons, widgets and personalization.",

    // Nav empty states
    "nav.empty.noGroupsTitle": "No categories yet",
    "nav.empty.noGroupsDescEditable":
      "Create your first category to organize your sites and widgets.",
    "nav.empty.noGroupsDescReadonly": "There's nothing to browse yet.",
    "nav.empty.addFirstGroup": "Add your first category",
    "nav.empty.noItemsTitle": "This category has no sites yet",
    "nav.empty.noItemsDescEditable":
      "Add your first site, or add a widget from the context menu.",
    "nav.empty.noItemsDescReadonly": "This category has no content yet.",
    "nav.empty.addFirstIcon": "Add your first site",
    "nav.add": "Add",

    // Settings panel: language
    "settings.language": "Language",
    "lang.zh": "简体中文",
    "lang.en": "English",
  },
};

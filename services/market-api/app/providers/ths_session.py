import re

from py_mini_racer import py_mini_racer

from .http import fetch_bytes

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

BROWSER = r"""
var __cookies = {};
function Element() {}
function __element() {
    return {
        style: {}, children: [],
        appendChild: function () {}, removeChild: function () {},
        setAttribute: function () {}, getAttribute: function () { return null; },
        addEventListener: function () {}, attachEvent: function () {}, addBehavior: function () {}
    };
}
var __script = __element();
__script.parentNode = { insertBefore: function () {}, removeChild: function () {} };
var location = {
    href: "https://q.10jqka.com.cn/gn/", protocol: "https:",
    hostname: "q.10jqka.com.cn", host: "q.10jqka.com.cn"
};
var localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
var document = {
    createElement: __element,
    getElementsByTagName: function () { return [__script]; },
    addEventListener: function () {}, attachEvent: function () {},
    documentElement: __element(), body: __element(),
    currentScript: __script, scripts: [__script], readyState: "complete",
    location: location, defaultCharset: "UTF-8"
};
Object.defineProperty(document, "cookie", {
    get: function () {
        return Object.keys(__cookies).map(function (key) { return key + "=" + __cookies[key]; }).join("; ");
    },
    set: function (value) {
        var pair = value.split(";")[0], at = pair.indexOf("="), key = pair.slice(0, at);
        if (/01 Jan 1970/.test(value)) delete __cookies[key];
        else __cookies[key] = pair.slice(at + 1);
    }
});
var navigator = {
    appName: "Netscape", userAgent: "USER_AGENT", appVersion: "5.0",
    platform: "Win32", language: "zh-CN", plugins: [], cookieEnabled: true,
    vendor: "Google Inc.", javaEnabled: function () { return false; }
};
var screen = { width: 1440, height: 900 };
var window = this, top = this, self = this;
window.document = document;
window.navigator = navigator;
window.location = location;
window.localStorage = localStorage;
window.screen = screen;
window.Element = Element;
window.addEventListener = function () {};
window.attachEvent = function () {};
window.setInterval = function () {};
window.setTimeout = function () {};
""".replace("USER_AGENT", USER_AGENT)


def create_token():
    text = fetch_bytes("https://q.10jqka.com.cn/gn/", timeout=15, retries=1).decode("gb18030", "replace")
    match = re.search(r'<script[^>]+src=[\'"]((?:https:)?//s\.thsi\.cn/js/chameleon/[^\'"]+)', text)
    if not match:
        raise RuntimeError("同花顺页面没有提供会话脚本")
    source = fetch_bytes(f"https:{match.group(1).removeprefix('https:')}", timeout=15, retries=1).decode("utf-8")
    context = py_mini_racer.MiniRacer()
    context.eval(BROWSER)
    context.eval(source)
    token = context.eval("(function () { var match = document.cookie.match(/(?:^|; )v=([^;]+)/); return match ? match[1] : ''; })()")
    if not token:
        raise RuntimeError("同花顺访问 Cookie 生成失败")
    return token

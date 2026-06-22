// 登录窗口默认宽度，确保目标网站桌面版布局能正常显示。
const LOGIN_WINDOW_WIDTH = 1280;

// 登录窗口默认高度，给登录表单和右下角状态提示留出空间。
const LOGIN_WINDOW_HEIGHT = 900;

// 登录后重试采集评论的轮询间隔。
const LOGIN_CHECK_INTERVAL_MS = 3_000;

// 登录成功提示显示多久后自动关闭登录窗口。
const LOGIN_SUCCESS_CLOSE_DELAY_MS = 3_000;

module.exports = {
  LOGIN_WINDOW_WIDTH,
  LOGIN_WINDOW_HEIGHT,
  LOGIN_CHECK_INTERVAL_MS,
  LOGIN_SUCCESS_CLOSE_DELAY_MS,
};

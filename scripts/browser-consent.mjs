// These tests request pointer lock and may interfere with the desktop mouse.
// Enable only after the user explicitly authorizes a browser-control test window.
if (process.env.RUN_BROWSER_TESTS !== "1") {
  throw new Error(
    "브라우저 조작 검증은 비활성화되어 있습니다. 사용자 허락 없이 RUN_BROWSER_TESTS를 켜지 마세요.",
  );
}

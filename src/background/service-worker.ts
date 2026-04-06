/** IvyPost Background Service Worker */

// 단축키(Alt+Shift+P) → Content Script에 핀 모드 토글 메시지 전송
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-pin-mode') {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PIN_MODE' });
    }
  }
});

// 스크린샷 캡처 요청 처리
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab({ format: 'png' }).then((dataUrl) => {
      sendResponse({ type: 'SCREENSHOT_RESULT', dataUrl });
    });
    return true; // async response
  }
});

// 확장 프로그램 아이콘 클릭 시에도 핀 모드 토글
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PIN_MODE' });
  }
});

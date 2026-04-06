/** IvyPost Background Service Worker */

/** content script가 로드되어 있는지 확인하고, 없으면 주입 후 메시지 전송 */
const sendToContent = async (tabId: number, msg: unknown) => {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    // content script 미로드 → 주입 후 재전송 (CSS는 JS에 인라인)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    await chrome.tabs.sendMessage(tabId, msg);
  }
};

// 단축키 → Content Script에 핀 모드 토글 메시지 전송
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-pin-mode') {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      await sendToContent(tab.id, { type: 'TOGGLE_PIN_MODE' });
    }
  }
});

// 스크린샷 캡처 요청 처리
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
    await sendToContent(tab.id, { type: 'TOGGLE_PIN_MODE' });
  }
});

/** IvyPost Popup */

const btnPin = document.getElementById('btn-pin')!;
const statusEl = document.getElementById('status')!;
const authorInput = document.getElementById('author-input') as HTMLInputElement;

// 핀 모드 토글
btnPin.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PIN_MODE' });
    window.close();
  }
});

// 작성자 이름 저장/로드
chrome.storage.local.get('author', (result) => {
  authorInput.value = result.author ?? '';
});

authorInput.addEventListener('change', () => {
  chrome.storage.local.set({ author: authorInput.value });
});

// 상태 표시 (간단 헬스체크)
const checkStatus = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    statusEl.textContent = '페이지 없음';
    return;
  }

  try {
    const origin = new URL(tab.url).origin;
    const res = await fetch(`${origin}/__ivypost__/comments?url=/`, {
      method: 'GET',
    });
    if (res.ok) {
      statusEl.textContent = '서버 연동됨';
      statusEl.style.background = 'rgba(16, 185, 129, 0.3)';
    } else {
      statusEl.textContent = '로컬 모드';
    }
  } catch {
    statusEl.textContent = '로컬 모드';
  }
};

checkStatus();

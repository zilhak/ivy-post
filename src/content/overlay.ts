import { collectAnchor, findAnchor } from '../lib/anchor';
import { createComment, fetchComments, getServerStatus } from '../lib/api';
import { getLocal, saveLocal } from '../lib/storage';
import type { Comment, CommentCreate } from '../lib/types';

/** ──────────────────────────────────────
 *  Shadow DOM 호스트 생성
 *  ────────────────────────────────────── */
const host = document.createElement('div');
host.id = 'ivypost-root';
host.style.position = 'absolute';
host.style.top = '0';
host.style.left = '0';
host.style.width = '0';
host.style.height = '0';
host.style.overflow = 'visible';
host.style.pointerEvents = 'none';
host.style.zIndex = '2147483647';
const shadow = host.attachShadow({ mode: 'closed' });

// CSS 로드
const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = chrome.runtime.getURL('overlay.css');
shadow.appendChild(style);

// 오버레이 컨테이너
const container = document.createElement('div');
container.id = 'ivypost-container';
shadow.appendChild(container);

document.body.appendChild(host);

/** ──────────────────────────────────────
 *  상태
 *  ────────────────────────────────────── */
let pinModeActive = false;
let hoveredElement: Element | null = null;
let currentComments: Comment[] = [];

/** ──────────────────────────────────────
 *  상태 배지 (서버 연동 상태 표시)
 *  ────────────────────────────────────── */
const badge = document.createElement('div');
badge.className = 'ivypost-badge';
badge.textContent = 'IvyPost';
container.appendChild(badge);

const updateBadge = () => {
  const status = getServerStatus();
  badge.dataset.status = status;
  badge.title =
    status === 'connected'
      ? 'IvyPost: 서버 연동됨'
      : status === 'not-configured'
        ? 'IvyPost: 서버 미연동 (로컬 모드)'
        : 'IvyPost: 서버 오류';
};

/** ──────────────────────────────────────
 *  핀 모드 — DOM 요소 하이라이트
 *  ────────────────────────────────────── */
const highlight = document.createElement('div');
highlight.className = 'ivypost-highlight';
highlight.style.display = 'none';
container.appendChild(highlight);

const onMouseMove = (e: MouseEvent) => {
  if (!pinModeActive) return;

  const target = e.target as Element;
  if (host.contains(target)) return; // IvyPost UI 자체는 무시

  hoveredElement = target;
  const rect = target.getBoundingClientRect();
  highlight.style.display = 'block';
  highlight.style.top = `${rect.top + window.scrollY}px`;
  highlight.style.left = `${rect.left + window.scrollX}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;
};

const onClick = (e: MouseEvent) => {
  if (!pinModeActive) return;

  const target = e.target as Element;
  if (host.contains(target)) return;

  e.preventDefault();
  e.stopPropagation();

  const anchor = collectAnchor(target);
  showCommentPopup(anchor, target);
};

/** ──────────────────────────────────────
 *  댓글 입력 팝업
 *  ────────────────────────────────────── */
const showCommentPopup = (
  anchor: ReturnType<typeof collectAnchor>,
  targetEl: Element
) => {
  // 핀 모드 해제
  setPinMode(false);

  const rect = targetEl.getBoundingClientRect();
  const popup = document.createElement('div');
  popup.className = 'ivypost-popup';
  popup.style.top = `${rect.bottom + window.scrollY + 8}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;

  popup.innerHTML = `
    <div class="ivypost-popup-header">
      <span>댓글 작성</span>
      <button class="ivypost-popup-close">&times;</button>
    </div>
    <input class="ivypost-popup-author" type="text" placeholder="작성자" />
    <textarea class="ivypost-popup-input" placeholder="피드백을 남겨주세요..." rows="3"></textarea>
    <div class="ivypost-popup-footer">
      <button class="ivypost-popup-submit">등록</button>
    </div>
  `;

  const close = () => popup.remove();
  popup.querySelector('.ivypost-popup-close')!.addEventListener('click', close);

  const authorInput = popup.querySelector('.ivypost-popup-author') as HTMLInputElement;
  const textarea = popup.querySelector('textarea')!;

  // 마지막 작성자 이름 복원
  chrome.storage.local.get('author', (result) => {
    if (result.author) authorInput.value = result.author;
  });

  popup.querySelector('.ivypost-popup-submit')!.addEventListener('click', async () => {
    const content = textarea.value.trim();
    const author = authorInput.value.trim() || '익명';
    if (!content) return;

    // 작성자 이름 기억
    chrome.storage.local.set({ author });

    const commentData: CommentCreate = {
      url: location.pathname + location.search,
      content,
      author,
      anchor,
      metadata: {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
    };

    // 서버에 저장 시도, 실패 시 로컬
    const saved = await createComment(commentData);
    if (saved) {
      currentComments.push(saved);
    } else {
      const local = await saveLocal(commentData);
      currentComments.push(local);
    }

    updateBadge();
    close();
    renderPins();
  });

  container.appendChild(popup);
  textarea.focus();
};

/** ──────────────────────────────────────
 *  핀 렌더링
 *  ────────────────────────────────────── */
const renderPins = () => {
  // 기존 핀 제거
  container.querySelectorAll('.ivypost-pin').forEach((el) => el.remove());

  for (const comment of currentComments) {
    const match = findAnchor(comment.anchor);
    const pin = document.createElement('div');
    pin.className = 'ivypost-pin';

    if (match.element) {
      const rect = match.element.getBoundingClientRect();
      pin.style.top = `${rect.top + window.scrollY - 12}px`;
      pin.style.left = `${rect.left + window.scrollX + rect.width / 2 - 12}px`;

      if (match.confidence < 0.8) {
        pin.classList.add('ivypost-pin--uncertain');
        pin.title = '위치가 정확하지 않을 수 있음';
      }
    } else {
      // 좌표 폴백
      pin.style.top = `${comment.anchor.rect.y * window.innerHeight + window.scrollY - 12}px`;
      pin.style.left = `${comment.anchor.rect.x * window.innerWidth + window.scrollX - 12}px`;
      pin.classList.add('ivypost-pin--lost');
      pin.title = '원래 요소를 찾을 수 없음';
    }

    pin.dataset.commentId = comment.id;
    pin.textContent = comment.resolved ? '✓' : '●';

    // 핀 클릭 시 댓글 상세 표시
    pin.addEventListener('click', () => showCommentDetail(comment, pin));

    container.appendChild(pin);
  }
};

/** ──────────────────────────────────────
 *  댓글 상세 팝업
 *  ────────────────────────────────────── */
const showCommentDetail = (comment: Comment, pinEl: Element) => {
  // 기존 상세 팝업 제거
  container.querySelectorAll('.ivypost-detail').forEach((el) => el.remove());

  const detail = document.createElement('div');
  detail.className = 'ivypost-detail';

  const pinRect = pinEl.getBoundingClientRect();
  detail.style.top = `${pinRect.bottom + window.scrollY + 8}px`;
  detail.style.left = `${pinRect.left + window.scrollX}px`;

  const repliesHtml = comment.replies
    .map(
      (r) => `
      <div class="ivypost-reply">
        <strong>${r.author}</strong>: ${r.content}
        <small>${new Date(r.createdAt).toLocaleString()}</small>
      </div>
    `
    )
    .join('');

  detail.innerHTML = `
    <div class="ivypost-detail-header">
      <strong>${comment.author}</strong>
      <small>${new Date(comment.createdAt).toLocaleString()}</small>
      <button class="ivypost-popup-close">&times;</button>
    </div>
    <p class="ivypost-detail-content">${comment.content}</p>
    ${repliesHtml ? `<div class="ivypost-replies">${repliesHtml}</div>` : ''}
    <div class="ivypost-detail-actions">
      <button class="ivypost-btn-resolve">${comment.resolved ? '다시 열기' : '해결'}</button>
    </div>
  `;

  detail.querySelector('.ivypost-popup-close')!.addEventListener('click', () => {
    detail.remove();
  });

  container.appendChild(detail);
};

/** ──────────────────────────────────────
 *  핀 모드 토글
 *  ────────────────────────────────────── */
/** 핀 모드 전용 style 태그 (페이지에 직접 삽입/제거) */
let pinCursorStyle: HTMLStyleElement | null = null;

const setPinMode = (active: boolean) => {
  pinModeActive = active;
  highlight.style.display = 'none';
  hoveredElement = null;
  container.dataset.pinMode = String(active);

  if (active) {
    // 페이지 커서를 crosshair로 변경
    pinCursorStyle = document.createElement('style');
    pinCursorStyle.textContent = '*, *::before, *::after { cursor: crosshair !important; }';
    document.head.appendChild(pinCursorStyle);

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
  } else {
    // 커서 복원
    if (pinCursorStyle) {
      pinCursorStyle.remove();
      pinCursorStyle = null;
    }

    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
  }
};

/** ──────────────────────────────────────
 *  댓글 로드
 *  ────────────────────────────────────── */
const loadComments = async () => {
  const url = location.pathname + location.search;

  // 서버에서 시도
  const serverComments = await fetchComments(url);
  const localComments = await getLocal(url);

  currentComments = [...serverComments, ...localComments];
  updateBadge();
  renderPins();
};

/** ──────────────────────────────────────
 *  SPA URL 변경 감지
 *  ────────────────────────────────────── */
let lastUrl = location.href;

const onUrlChange = () => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    loadComments();
  }
};

// pushState / replaceState 후킹
const originalPushState = history.pushState.bind(history);
history.pushState = (...args) => {
  originalPushState(...args);
  onUrlChange();
};

const originalReplaceState = history.replaceState.bind(history);
history.replaceState = (...args) => {
  originalReplaceState(...args);
  onUrlChange();
};

window.addEventListener('popstate', onUrlChange);
window.addEventListener('hashchange', onUrlChange);

/** ──────────────────────────────────────
 *  메시지 수신 (Background → Content)
 *  ────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TOGGLE_PIN_MODE') {
    setPinMode(!pinModeActive);
  }
});

/** ──────────────────────────────────────
 *  초기화
 *  ────────────────────────────────────── */
loadComments();

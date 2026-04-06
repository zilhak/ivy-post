import { collectAnchor, findAnchor } from '../lib/anchor';
import { createComment, fetchComments, getServerStatus } from '../lib/api';
import { getLocal, saveLocal } from '../lib/storage';
import type { Comment, CommentCreate } from '../lib/types';
// @ts-ignore — CSS는 빌드 시 text loader로 문자열 변환됨
import cssText from './overlay.css';

/** ──────────────────────────────────────
 *  Shadow DOM 호스트 생성
 *  ────────────────────────────────────── */
const host = document.createElement('div');
host.id = 'ivypost-root';
host.style.position = 'absolute';
host.style.top = '0';
host.style.left = '0';
host.style.pointerEvents = 'none';
host.style.zIndex = '2147483647';
const shadow = host.attachShadow({ mode: 'closed' });

// CSS 인라인 삽입
const style = document.createElement('style');
style.textContent = cssText;
shadow.appendChild(style);

// 오버레이 컨테이너
const container = document.createElement('div');
container.id = 'ivypost-container';
shadow.appendChild(container);

document.documentElement.appendChild(host);

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

/** 하이라이트 위치를 요소에 맞춰 갱신 */
const updateHighlight = (el: Element) => {
  const rect = el.getBoundingClientRect();
  highlight.style.display = 'block';
  highlight.style.top = `${rect.top + window.scrollY}px`;
  highlight.style.left = `${rect.left + window.scrollX}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;
};

/** 깊이 표시 배지 */
const depthBadge = document.createElement('div');
depthBadge.className = 'ivypost-depth-badge';
depthBadge.style.display = 'none';
container.appendChild(depthBadge);

/** 마우스 아래의 원본(가장 깊은) 요소 */
let baseElement: Element | null = null;
/** 현재 깊이 오프셋 (0 = 원본, 양수 = 부모 방향) */
let depthOffset = 0;
/** 깊이 조절 시 고정된 마우스 좌표 */
let anchorX = 0;
let anchorY = 0;
/** 깊이 고정 데드존 반경 (px) */
const DEAD_ZONE = 5;

/** baseElement에서 depthOffset만큼 부모로 올라간 요소 반환 */
const getElementAtDepth = (): Element | null => {
  let el = baseElement;
  for (let i = 0; i < depthOffset && el?.parentElement; i++) {
    if (el.parentElement === document.body || el.parentElement === document.documentElement) break;
    el = el.parentElement;
  }
  return el;
};

const onMouseMove = (e: MouseEvent) => {
  if (!pinModeActive) return;

  const target = e.target as Element;
  if (host.contains(target)) return;

  // 깊이 조절 중이면 데드존 내에서는 무시
  if (depthOffset > 0) {
    const dx = Math.abs(e.clientX - anchorX);
    const dy = Math.abs(e.clientY - anchorY);
    if (dx <= DEAD_ZONE && dy <= DEAD_ZONE) return;
  }

  // 마우스가 새 위치로 이동하면 깊이 리셋
  baseElement = target;
  depthOffset = 0;
  hoveredElement = target;
  updateHighlight(target);
  depthBadge.style.display = 'none';
};

/** 깊이를 변경하고 하이라이트/배지를 갱신. 마우스 좌표로 앵커 고정 */
const adjustDepth = (direction: 'up' | 'down', mouseX: number, mouseY: number) => {
  if (!baseElement) return;

  if (direction === 'down') {
    // 더 깊은 요소 (자식 방향)
    if (depthOffset <= 0) return;
    depthOffset--;
  } else {
    // 더 얕은 요소 (부모 방향)
    const current = getElementAtDepth();
    if (!current?.parentElement || current.parentElement === document.body || current.parentElement === document.documentElement) return;
    depthOffset++;
  }

  // 앵커 좌표 갱신
  anchorX = mouseX;
  anchorY = mouseY;

  hoveredElement = getElementAtDepth();
  if (hoveredElement) updateHighlight(hoveredElement);

  depthBadge.textContent = depthOffset === 0 ? '' : `↑${depthOffset}`;
  depthBadge.style.display = depthOffset === 0 ? 'none' : 'block';

  if (depthBadge.style.display !== 'none') {
    depthBadge.style.top = highlight.style.top;
    depthBadge.style.left = `${parseInt(highlight.style.left) + parseInt(highlight.style.width) + 4}px`;
  }
};

/** 마우스 위치 추적 (키보드 이벤트에는 좌표가 없으므로) */
let lastMouseX = 0;
let lastMouseY = 0;

const onMouseMoveTrack = (e: MouseEvent) => {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
};

const onKeyDown = (e: KeyboardEvent) => {
  if (!pinModeActive || !baseElement) return;

  if (e.key === '=' || e.key === '+') {
    e.preventDefault();
    adjustDepth('down', lastMouseX, lastMouseY);
  } else if (e.key === '-') {
    e.preventDefault();
    adjustDepth('up', lastMouseX, lastMouseY);
  }
};

const onWheel = (e: WheelEvent) => {
  if (!pinModeActive || !baseElement) return;

  e.preventDefault();
  e.stopPropagation();
  adjustDepth(e.deltaY > 0 ? 'up' : 'down', e.clientX, e.clientY);
};

const onClick = (e: MouseEvent) => {
  if (!pinModeActive) return;

  const target = e.target as Element;
  if (host.contains(target)) return;

  e.preventDefault();
  e.stopPropagation();

  // 깊이 조절된 요소 사용
  const selectedElement = hoveredElement || target;
  const anchor = collectAnchor(selectedElement);
  showActionPopup(anchor, selectedElement, e.clientX, e.clientY);
};

/** ──────────────────────────────────────
 *  팝업 위치 결정 — 클릭 좌표 기준, 뷰포트 밖이면 반전
 *  ────────────────────────────────────── */
const positionPopup = (popup: HTMLElement, clientX: number, clientY: number) => {
  // 먼저 보이지 않게 배치해서 크기 측정
  popup.style.visibility = 'hidden';
  popup.style.top = '0';
  popup.style.left = '0';
  container.appendChild(popup);

  const popupRect = popup.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 8;

  // 세로: 기본 아래쪽, 공간 부족하면 위쪽
  let top: number;
  if (clientY + gap + popupRect.height <= vh) {
    top = clientY + gap + window.scrollY;
  } else {
    top = clientY - gap - popupRect.height + window.scrollY;
  }

  // 가로: 기본 오른쪽, 공간 부족하면 왼쪽
  let left: number;
  if (clientX + popupRect.width <= vw) {
    left = clientX + window.scrollX;
  } else {
    left = clientX - popupRect.width + window.scrollX;
  }

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
  popup.style.visibility = '';
};

/** ──────────────────────────────────────
 *  액션 팝업 (1차 메뉴)
 *  ────────────────────────────────────── */
const showActionPopup = (
  anchor: ReturnType<typeof collectAnchor>,
  targetEl: Element,
  clientX: number,
  clientY: number,
) => {
  setPinMode(false);
  updateHighlight(targetEl);

  const popup = document.createElement('div');
  popup.className = 'ivypost-action-popup';

  popup.innerHTML = `
    <div class="ivypost-action-popup-header">
      <span>&lt;${anchor.tagName.toLowerCase()}&gt;</span>
      <button class="ivypost-popup-close">&times;</button>
    </div>
    <div class="ivypost-action-menu">
      <button class="ivypost-action-item" data-action="comment">댓글 작성</button>
    </div>
  `;

  const close = () => {
    popup.remove();
    highlight.style.display = 'none';
  };

  popup.querySelector('.ivypost-popup-close')!.addEventListener('click', close);

  popup.querySelector('[data-action="comment"]')!.addEventListener('click', () => {
    popup.remove();
    showCommentPopup(anchor, targetEl, clientX, clientY);
  });

  positionPopup(popup, clientX, clientY);
};

/** ──────────────────────────────────────
 *  댓글 입력 팝업
 *  ────────────────────────────────────── */
const showCommentPopup = (
  anchor: ReturnType<typeof collectAnchor>,
  targetEl: Element,
  clientX: number,
  clientY: number,
) => {
  // 하이라이트 유지
  updateHighlight(targetEl);

  const popup = document.createElement('div');
  popup.className = 'ivypost-popup';

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

  const close = () => {
    popup.remove();
    highlight.style.display = 'none';
  };
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

  positionPopup(popup, clientX, clientY);
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

    // 핀 호버 시 앵커 요소 하이라이트
    pin.addEventListener('mouseenter', () => {
      const m = findAnchor(comment.anchor);
      if (m.element) {
        const r = m.element.getBoundingClientRect();
        highlight.style.display = 'block';
        highlight.style.top = `${r.top + window.scrollY}px`;
        highlight.style.left = `${r.left + window.scrollX}px`;
        highlight.style.width = `${r.width}px`;
        highlight.style.height = `${r.height}px`;
      }
    });
    pin.addEventListener('mouseleave', () => {
      highlight.style.display = 'none';
    });

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
  depthBadge.style.display = 'none';
  hoveredElement = null;
  baseElement = null;
  depthOffset = 0;
  container.dataset.pinMode = String(active);

  if (active) {
    // 페이지 커서를 crosshair로 변경
    pinCursorStyle = document.createElement('style');
    pinCursorStyle.textContent = '*, *::before, *::after { cursor: crosshair !important; }';
    document.head.appendChild(pinCursorStyle);

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mousemove', onMouseMoveTrack, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
  } else {
    // 커서 복원
    if (pinCursorStyle) {
      pinCursorStyle.remove();
      pinCursorStyle = null;
    }

    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mousemove', onMouseMoveTrack, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('wheel', onWheel, true);
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

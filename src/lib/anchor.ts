import type { Anchor, AnchorMatch } from './types';

/** CSS selector 생성 (간략 버전) */
const generateSelector = (el: Element): string => {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`#${current.id}`);
      break;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(part);
    current = current.parentElement;
  }

  return parts.join(' > ');
};

/** 가장 가까운 id를 가진 조상 요소 찾기 */
const findNearestIdAncestor = (
  el: Element
): Anchor['nearestIdAncestor'] => {
  let current = el.parentElement;
  let depth = 1;

  while (current && current !== document.body) {
    if (current.id) {
      // 조상에서 대상까지의 간략 경로
      const pathParts: string[] = [];
      let walker: Element | null = el;
      for (let i = 0; i < depth; i++) {
        if (walker) {
          pathParts.unshift(walker.tagName.toLowerCase());
          walker = walker.parentElement;
        }
      }

      return {
        id: current.id,
        relativePath: pathParts.join(' > '),
        depth,
      };
    }
    current = current.parentElement;
    depth++;
  }

  return null;
};

/** 안정적인 속성만 수집 */
const getStableAttributes = (el: Element): Record<string, string> => {
  const stable: Record<string, string> = {};
  const keep = ['data-testid', 'role', 'type', 'name', 'aria-label', 'href'];

  for (const name of keep) {
    const val = el.getAttribute(name);
    if (val) stable[name] = val;
  }

  return stable;
};

/** 핀 생성 시 DOM 요소에서 앵커 정보 수집 */
export const collectAnchor = (element: Element): Anchor => {
  const rect = element.getBoundingClientRect();

  return {
    selector: generateSelector(element),
    testId: element.getAttribute('data-testid'),
    id: element.id || null,
    textContent: (element.textContent?.trim() ?? '').slice(0, 100),
    tagName: element.tagName,
    className: typeof element.className === 'string' ? element.className : '',
    rect: {
      x: rect.left / window.innerWidth,
      y: rect.top / window.innerHeight,
    },
    nearestIdAncestor: findNearestIdAncestor(element),
    attributes: getStableAttributes(element),
  };
};

/** 저장된 앵커 정보로 DOM 요소 재탐색 */
export const findAnchor = (anchor: Anchor): AnchorMatch => {
  // 1순위: data-testid
  if (anchor.testId) {
    const el = document.querySelector(`[data-testid="${anchor.testId}"]`);
    if (el) return { element: el, confidence: 1.0 };
  }

  // 2순위: id
  if (anchor.id) {
    const el = document.getElementById(anchor.id);
    if (el) return { element: el, confidence: 1.0 };
  }

  // 3순위: 가장 가까운 id 조상 + 텍스트 검증
  if (anchor.nearestIdAncestor) {
    const parent = document.getElementById(anchor.nearestIdAncestor.id);
    if (parent) {
      const candidates = parent.querySelectorAll(anchor.tagName);
      for (const el of candidates) {
        if (el.textContent?.trim().startsWith(anchor.textContent)) {
          return { element: el, confidence: 0.9 };
        }
      }
    }
  }

  // 4순위: CSS selector + 텍스트 검증
  try {
    const el = document.querySelector(anchor.selector);
    if (el) {
      if (el.textContent?.trim().startsWith(anchor.textContent)) {
        return { element: el, confidence: 0.8 };
      }
      return { element: el, confidence: 0.6 };
    }
  } catch {
    // invalid selector
  }

  // 5순위: 태그 + 클래스 + 텍스트 전체 탐색
  const all = document.querySelectorAll(anchor.tagName);
  for (const el of all) {
    if (
      el.textContent?.trim() === anchor.textContent &&
      (typeof el.className === 'string' ? el.className : '') === anchor.className
    ) {
      return { element: el, confidence: 0.5 };
    }
  }

  // 실패: 좌표 폴백
  return { element: null, confidence: 0 };
};

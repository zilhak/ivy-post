# IvyPost — 화면 댓글 QA 도구

## 규칙

- 코드 수정/추가/삭제 등 작업이 끝나면 자동으로 git commit할 것. 사용자에게 별도 확인 불필요.

## 프로젝트 개요

웹 화면 위에 직접 핀을 찍고 댓글을 남기는 QA 피드백 도구.
크롬 익스텐션으로 동작하며, 어떤 웹사이트에든 달라붙어 사용할 수 있다.

## 핵심 설계 원칙

1. **익스텐션은 서버를 모른다** — `현재 origin + /__ivypost__/*` 로만 요청
2. **서버는 익스텐션을 모른다** — 가이드대로 엔드포인트를 뚫으면 연동됨
3. **서버가 없어도 동작** — API 실패 시 로컬 캐시로 폴백, 안내 메시지만 표시
4. **영구 저장은 서버 책임** — 익스텐션은 캐시/임시저장만 (IndexedDB)

## 아키텍처

```
┌─ 크롬 익스텐션 ───────────────────────────────┐
│                                               │
│  Content Script (Shadow DOM)                  │
│  ├── 핀 오버레이 UI                            │
│  ├── 댓글 작성/조회 패널                        │
│  └── 클릭 위치 + selector 캡처                 │
│                                               │
│  Background Service Worker                    │
│  ├── chrome.tabs.captureVisibleTab() 스크린샷  │
│  ├── API 통신 (서버 or 로컬 폴백)              │
│  └── Native Messaging (cmux 연동, 선택)       │
│                                               │
│  Popup                                        │
│  ├── 현재 페이지 댓글 목록                      │
│  ├── 필터/검색                                 │
│  └── 설정                                     │
└───────────────────────────────────────────────┘
        │
        │  HTTP (현재 origin)
        ▼
┌─ 대상 웹 서버 (구현은 서버 측 자유) ──────────────┐
│                                               │
│  GET  /__ivypost__/comments?url={pageUrl}     │
│  POST /__ivypost__/comments                   │
│  PUT  /__ivypost__/comments/{id}              │
│  DELETE /__ivypost__/comments/{id}            │
│  POST /__ivypost__/screenshots    (optional)  │
│  GET  /__ivypost__/screenshots/{id} (optional)│
│                                               │
│  저장소: SQLite, 파일, 메모리 등 자유           │
└───────────────────────────────────────────────┘
```

## 인터랙션 흐름

### 핀 모드 진입
```
단축키 (예: Alt+Shift+P) → 핀 모드 활성화
  → 마우스 이동 시 DOM 요소 하이라이트
  → 클릭 → 해당 요소에 앵커 정보 수집 + 댓글 팝업 표시
  → 댓글 작성 → POST /__ivypost__/comments
      ├── 200 → 저장 완료, 핀 표시
      └── 에러/404 → "서버 미연동" 메시지 + IndexedDB 임시저장
```

### 댓글 조회 (트리거)
```
페이지 로드 / URL 변경 / 수동 새로고침 → GET /__ivypost__/comments?url=...
  ├── 200 → 앵커 재탐색 → 요소 찾으면 핀 부착, 못 찾으면 좌표 폴백
  └── 에러/404 → 무시, 빈 상태
```

### URL 변경 감지 (SPA 대응)
- `popstate` 이벤트
- `pushState` / `replaceState` 후킹
- `hashchange` 이벤트

## DOM 앵커링 — 요소를 나중에 다시 찾는 방법

핀을 찍은 DOM 요소는 동적으로 변할 수 있다 (리스트 순서 변경, 클래스명 변경, 요소 추가/삭제 등).
한 가지 방법으로는 불안정하므로, **여러 단서를 저장해두고 조합해서 점수 매기기 방식**으로 재탐색한다.

### 핀 생성 시 수집하는 앵커 정보

```json
{
  "anchor": {
    "selector": "div.content > ul > li:nth-child(3) > button",
    "testId": "submit-btn",
    "id": null,
    "textContent": "배포하기",
    "tagName": "BUTTON",
    "className": "submit-btn primary",
    "rect": { "x": 0.73, "y": 0.45 },
    "nearestIdAncestor": {
      "id": "deploy-section",
      "relativePath": "ul > li:nth-child(3) > button",
      "depth": 3
    },
    "attributes": {
      "data-testid": "submit-btn",
      "role": "button",
      "type": "submit"
    }
  }
}
```

### 재탐색 우선순위

| 순위 | 전략 | confidence | 설명 |
|------|------|-----------|------|
| 1 | `data-testid` | 1.0 | 테스트용 속성, 가장 안정적 |
| 2 | `id` | 1.0 | 고유 식별자 |
| 3 | 가장 가까운 `id` 조상 + 상대 경로 + 텍스트 검증 | 0.9 | 조상 id를 기준으로 하위 탐색 |
| 4 | CSS selector + 텍스트 검증 | 0.8 | selector가 맞고 텍스트도 일치 |
| 5 | CSS selector만 (텍스트 불일치) | 0.6 | 위치는 맞지만 내용 변경됨 |
| 6 | 태그 + 클래스 + 텍스트 전체 탐색 | 0.5 | 구조 변경 시 폴백 |
| 7 | 좌표 폴백 | 0 | 요소를 못 찾으면 저장된 뷰포트 비율 좌표에 표시 |

### confidence에 따른 핀 표시

| confidence | 표시 |
|-----------|------|
| 0.8~1.0 | 요소에 핀 부착 (정상) |
| 0.3~0.7 | 요소에 핀 부착 + "위치가 정확하지 않을 수 있음" 표시 |
| 0 | 저장된 좌표에 핀 표시 + "원래 요소를 찾을 수 없음" 표시 |

### 앵커 수집 유틸 (의사코드)

```ts
const collectAnchor = (element: Element): Anchor => {
  const rect = element.getBoundingClientRect();

  // 가장 가까운 id를 가진 조상 찾기
  let nearestIdAncestor = null;
  let current = element.parentElement;
  let depth = 1;
  while (current) {
    if (current.id) {
      nearestIdAncestor = {
        id: current.id,
        relativePath: getRelativePath(current, element),
        depth,
      };
      break;
    }
    current = current.parentElement;
    depth++;
  }

  return {
    selector: generateCssSelector(element),
    testId: element.getAttribute('data-testid'),
    id: element.id || null,
    textContent: element.textContent?.trim().slice(0, 100),
    tagName: element.tagName,
    className: element.className,
    rect: {
      x: rect.left / window.innerWidth,   // 뷰포트 비율
      y: rect.top / window.innerHeight,
    },
    nearestIdAncestor,
    attributes: getStableAttributes(element),
  };
};
```

### 앵커 재탐색 유틸 (의사코드)

```ts
const findAnchor = (anchor: Anchor): { element: Element | null; confidence: number } => {
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

  // 3순위: 가장 가까운 id 조상 + 상대 경로 + 텍스트 검증
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

  // 4순위: selector + 텍스트 검증
  const el = document.querySelector(anchor.selector);
  if (el) {
    if (el.textContent?.trim().startsWith(anchor.textContent)) {
      return { element: el, confidence: 0.8 };
    }
    return { element: el, confidence: 0.6 };
  }

  // 5순위: 태그 + 클래스 + 텍스트 전체 탐색
  const all = document.querySelectorAll(anchor.tagName);
  for (const candidate of all) {
    if (candidate.textContent?.trim() === anchor.textContent
        && candidate.className === anchor.className) {
      return { element: candidate, confidence: 0.5 };
    }
  }

  // 실패: 좌표 폴백
  return { element: null, confidence: 0 };
};
```

## 서버 연동 가이드

> 이 섹션은 IvyPost를 사용하려는 서버 개발자를 위한 가이드.
> 아래 엔드포인트를 구현하면 IvyPost 익스텐션과 자동 연동됨.

### 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/__ivypost__/comments?url={pageUrl}` | 해당 URL의 댓글 목록 |
| `POST` | `/__ivypost__/comments` | 댓글 생성 |
| `PUT` | `/__ivypost__/comments/{id}` | 댓글 수정 / resolve |
| `DELETE` | `/__ivypost__/comments/{id}` | 댓글 삭제 |
| `POST` | `/__ivypost__/screenshots` | 스크린샷 업로드 (optional) |
| `GET` | `/__ivypost__/screenshots/{id}` | 스크린샷 조회 (optional) |

### 요청 형상

**POST /__ivypost__/comments**
```json
{
  "url": "/namespace/detail/my-ns",
  "content": "이 버튼 눌렀을 때 에러남",
  "author": "ljh",
  "anchor": {
    "selector": "div.content > button.submit",
    "testId": "submit-btn",
    "id": null,
    "textContent": "배포하기",
    "tagName": "BUTTON",
    "className": "submit-btn primary",
    "rect": { "x": 0.73, "y": 0.45 },
    "nearestIdAncestor": {
      "id": "deploy-section",
      "relativePath": "ul > li > button",
      "depth": 3
    },
    "attributes": {
      "data-testid": "submit-btn",
      "role": "button"
    }
  },
  "screenshotId": "abc-123",
  "metadata": {
    "viewport": "1920x1080",
    "userAgent": "...",
    "timestamp": "2026-04-06T15:30:00Z"
  }
}
```

### 응답 형상

**GET /__ivypost__/comments?url=...**
```json
{
  "comments": [
    {
      "id": "uuid",
      "url": "/namespace/detail/my-ns",
      "content": "이 버튼 눌렀을 때 에러남",
      "author": "ljh",
      "resolved": false,
      "anchor": {
        "selector": "div.content > button.submit",
        "testId": "submit-btn",
        "id": null,
        "textContent": "배포하기",
        "tagName": "BUTTON",
        "className": "submit-btn primary",
        "rect": { "x": 0.73, "y": 0.45 },
        "nearestIdAncestor": {
          "id": "deploy-section",
          "relativePath": "ul > li > button",
          "depth": 3
        },
        "attributes": { "data-testid": "submit-btn" }
      },
      "screenshotId": "abc-123",
      "createdAt": "2026-04-06T15:30:00Z",
      "replies": [
        {
          "id": "uuid",
          "content": "수정했습니다",
          "author": "kim",
          "createdAt": "2026-04-06T16:00:00Z"
        }
      ]
    }
  ]
}
```

## 크롬 익스텐션 구조

```
ivy-post/
├── manifest.json              # Manifest V3
├── content/
│   ├── overlay.ts             # 핀/댓글 UI (Shadow DOM 격리)
│   └── overlay.css
├── background/
│   └── service-worker.ts      # 스크린샷 캡처, API 통신 허브
├── popup/
│   ├── popup.html             # 댓글 목록, 설정
│   └── popup.ts
├── lib/
│   ├── api.ts                 # 서버 통신 + 에러 폴백
│   ├── storage.ts             # IndexedDB 임시저장
│   └── types.ts               # 공통 타입
├── native/                    # Native Messaging (cmux 연동, 선택)
│   ├── host.js
│   └── com.ivypost.bridge.json
└── assets/
    └── icons/
```

## 동작 모드

| 상황 | 동작 | UI 표시 |
|------|------|---------|
| 서버 API 정상 | 서버 저장/조회, 팀 공유 | 녹색 아이콘 |
| 서버 API 없음 (404) | IndexedDB 임시저장, 혼자만 보임 | 회색 아이콘 + "서버 미연동" |
| 서버 API 에러 (500) | 에러 표시, IndexedDB 폴백 | 주황 아이콘 + 에러 메시지 |

## Native Messaging — cmux/Claude Code 연동 (선택)

댓글에서 "Claude에게 전달" 액션 선택 시:

```
익스텐션 → Native Host (host.js) → cmux claude-spawn --prompt "..."
```

프롬프트에 포함되는 정보:
- 페이지 URL
- 클릭한 요소의 selector
- 댓글 내용
- 스크린샷 (파일 경로)

cmux가 없는 환경에서는 이 기능만 비활성화.

## 기술 스택

- **Manifest V3** (Chrome Extension)
- **TypeScript**
- **Shadow DOM** (호스트 페이지 CSS와 완전 격리)
- **IndexedDB** (로컬 캐시/폴백)
- **chrome.tabs.captureVisibleTab()** (스크린샷)
- 빌드: Vite 또는 esbuild (번들링)

## 개발/빌드

```bash
pnpm install
pnpm dev          # 개발 모드 (watch)
pnpm build        # 프로덕션 빌드 → dist/
```

빌드 결과물(`dist/`)을 `chrome://extensions` → "압축해제된 확장 프로그램을 로드합니다"로 설치.

## 사내 배포

Chrome Web Store 등록 불필요.
- `.crx` 파일 또는 `dist/` 폴더 직접 공유
- 또는 사내 Gitea 릴리즈에 첨부

/** 앵커: DOM 요소를 나중에 다시 찾기 위한 복합 단서 */
export interface Anchor {
  selector: string;
  testId: string | null;
  id: string | null;
  textContent: string;
  tagName: string;
  className: string;
  rect: { x: number; y: number };
  nearestIdAncestor: {
    id: string;
    relativePath: string;
    depth: number;
  } | null;
  attributes: Record<string, string>;
}

/** 댓글 생성 요청 */
export interface CommentCreate {
  url: string;
  content: string;
  author: string;
  anchor: Anchor;
  screenshotId?: string;
  metadata: {
    viewport: string;
    userAgent: string;
    timestamp: string;
  };
}

/** 답글 */
export interface Reply {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

/** 댓글 (서버 응답) */
export interface Comment {
  id: string;
  url: string;
  content: string;
  author: string;
  resolved: boolean;
  anchor: Anchor;
  screenshotId?: string;
  createdAt: string;
  replies: Reply[];
}

/** 서버 응답 */
export interface CommentsResponse {
  comments: Comment[];
}

/** 앵커 재탐색 결과 */
export interface AnchorMatch {
  element: Element | null;
  confidence: number;
}

/** 익스텐션 내부 메시지 */
export type Message =
  | { type: 'TOGGLE_PIN_MODE' }
  | { type: 'PIN_MODE_CHANGED'; active: boolean }
  | { type: 'CAPTURE_SCREENSHOT'; callback?: never }
  | { type: 'SCREENSHOT_RESULT'; dataUrl: string }
  | { type: 'COMMENTS_UPDATED'; url: string };

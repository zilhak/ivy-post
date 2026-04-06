import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';
import type { CommentCreate } from '../types';

// 각 테스트마다 모듈을 새로 로드하기 위해 dynamic import 사용
let fetchComments: typeof import('../api').fetchComments;
let createComment: typeof import('../api').createComment;
let updateComment: typeof import('../api').updateComment;
let deleteComment: typeof import('../api').deleteComment;
let getServerStatus: typeof import('../api').getServerStatus;

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof mock>;

beforeEach(async () => {
  // location 설정
  Object.defineProperty(globalThis, 'location', {
    value: { origin: 'http://localhost:3000' },
    writable: true,
    configurable: true,
  });

  // fetch mock
  mockFetch = mock();
  globalThis.fetch = mockFetch as any;

  // 모듈 캐시 우회를 위해 타임스탬프 쿼리 사용
  const mod = await import('../api');
  fetchComments = mod.fetchComments;
  createComment = mod.createComment;
  updateComment = mod.updateComment;
  deleteComment = mod.deleteComment;
  getServerStatus = mod.getServerStatus;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const dummyComment = {
  id: '1',
  url: '/test',
  content: '테스트 댓글',
  author: 'tester',
  resolved: false,
  anchor: {
    selector: 'div',
    testId: null,
    id: null,
    textContent: '내용',
    tagName: 'DIV',
    className: '',
    rect: { x: 0, y: 0 },
    nearestIdAncestor: null,
    attributes: {},
  },
  createdAt: '2026-01-01T00:00:00Z',
  replies: [],
};

describe('fetchComments', () => {
  test('서버 응답 200 → 댓글 배열 반환', async () => {
    (mockFetch as any).mockReturnValueOnce(
      Promise.resolve(new Response(JSON.stringify({ comments: [dummyComment] }), { status: 200 }))
    );

    const result = await fetchComments('/test');

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('테스트 댓글');
    expect(getServerStatus()).toBe('connected');
  });

  test('서버 404 → 빈 배열, status not-configured', async () => {
    (mockFetch as any).mockReturnValueOnce(
      Promise.resolve(new Response(null, { status: 404 }))
    );

    const result = await fetchComments('/test');

    expect(result).toEqual([]);
    expect(getServerStatus()).toBe('not-configured');
  });

  test('서버 500 → 빈 배열, status error', async () => {
    (mockFetch as any).mockReturnValueOnce(
      Promise.resolve(new Response(null, { status: 500 }))
    );

    const result = await fetchComments('/test');

    expect(result).toEqual([]);
    expect(getServerStatus()).toBe('error');
  });

  test('네트워크 에러 → 빈 배열, status error', async () => {
    (mockFetch as any).mockReturnValueOnce(Promise.reject(new Error('network error')));

    const result = await fetchComments('/test');

    expect(result).toEqual([]);
    expect(getServerStatus()).toBe('error');
  });
});

describe('createComment', () => {
  test('성공 시 생성된 댓글 반환', async () => {
    (mockFetch as any).mockReturnValueOnce(
      Promise.resolve(new Response(JSON.stringify(dummyComment), { status: 201 }))
    );

    const input: CommentCreate = {
      url: '/test',
      content: '새 댓글',
      author: 'tester',
      anchor: dummyComment.anchor,
      metadata: { viewport: '1920x1080', userAgent: 'test', timestamp: '2026-01-01T00:00:00Z' },
    };

    const result = await createComment(input);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('1');
  });
});

describe('updateComment', () => {
  test('resolve 업데이트', async () => {
    const updated = { ...dummyComment, resolved: true };
    (mockFetch as any).mockReturnValueOnce(
      Promise.resolve(new Response(JSON.stringify(updated), { status: 200 }))
    );

    const result = await updateComment('1', { resolved: true });

    expect(result!.resolved).toBe(true);
  });
});

describe('deleteComment', () => {
  test('성공 시 true 반환', async () => {
    (mockFetch as any).mockReturnValueOnce(
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    const result = await deleteComment('1');

    expect(result).toBe(true);
  });

  test('실패 시 false 반환', async () => {
    (mockFetch as any).mockReturnValueOnce(
      Promise.resolve(new Response(null, { status: 500 }))
    );

    const result = await deleteComment('1');

    expect(result).toBe(false);
  });
});

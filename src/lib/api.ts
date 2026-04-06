import type { Comment, CommentCreate, CommentsResponse } from './types';

const BASE_PATH = '/__ivypost__';

/** 서버 연동 상태 */
export type ServerStatus = 'connected' | 'not-configured' | 'error';

let serverStatus: ServerStatus = 'not-configured';

export const getServerStatus = (): ServerStatus => serverStatus;

/** 서버에 요청 — 실패 시 null 반환 (폴백은 호출부에서 처리) */
const request = async <T>(
  path: string,
  options?: RequestInit
): Promise<T | null> => {
  try {
    const res = await fetch(`${location.origin}${BASE_PATH}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    if (res.status === 404) {
      serverStatus = 'not-configured';
      return null;
    }

    if (!res.ok) {
      serverStatus = 'error';
      return null;
    }

    serverStatus = 'connected';
    return (await res.json()) as T;
  } catch {
    serverStatus = 'error';
    return null;
  }
};

/** 현재 URL의 댓글 목록 조회 */
export const fetchComments = async (url: string): Promise<Comment[]> => {
  const data = await request<CommentsResponse>(
    `/comments?url=${encodeURIComponent(url)}`
  );
  return data?.comments ?? [];
};

/** 댓글 생성 */
export const createComment = async (
  comment: CommentCreate
): Promise<Comment | null> => {
  return request<Comment>('/comments', {
    method: 'POST',
    body: JSON.stringify(comment),
  });
};

/** 댓글 수정 / resolve */
export const updateComment = async (
  id: string,
  updates: Partial<Pick<Comment, 'content' | 'resolved'>>
): Promise<Comment | null> => {
  return request<Comment>(`/comments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

/** 댓글 삭제 */
export const deleteComment = async (id: string): Promise<boolean> => {
  const result = await request(`/comments/${id}`, { method: 'DELETE' });
  return result !== null;
};

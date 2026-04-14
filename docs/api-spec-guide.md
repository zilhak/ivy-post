# IvyPost API 스펙 작성 규칙

`docs/openapi.yaml`을 작성·수정할 때 따르는 규칙.

## 원칙

- **openapi.yaml이 API의 단일 원본(Single Source of Truth)**이다.
- 익스텐션의 `src/lib/types.ts`는 이 스펙에서 파생된다.
- 스펙은 서버 구현체(DB, 프레임워크, 언어)에 독립적이어야 한다.

## 필드 소유권 표기

모든 응답 스키마 필드에는 **누가 채우는지** 명시한다.

| 구분 | 표기 방법 | 예시 |
|------|----------|------|
| 서버가 생성하는 필드 | `readOnly: true` + description에 생성 규칙 | `id`, `createdAt`, `replies` |
| 클라이언트가 보내는 필드 | 요청 스키마(`*Create`, `*Update`)에 포함 | `content`, `author`, `anchor` |
| 생성 시 서버 초기화 값 | description에 초기값 명시 | `resolved`: "생성 시 false" |

요청 스키마와 응답 스키마를 분리하여 혼동을 방지한다:
- `CommentCreate` — 클라이언트가 보내는 것
- `CommentUpdate` — 클라이언트가 수정할 수 있는 것
- `Comment` — 서버가 반환하는 전체 형상

## 엔드포인트 description 규칙

- 요청 → 응답 변환 과정에서 **서버가 해야 하는 일**을 description에 기술한다.
- "어떻게 구현하라"가 아니라 "무엇을 해야 하는지"를 쓴다.

```yaml
# Good
description: |
  서버는 요청 본문을 받아 다음 필드를 생성하여 Comment를 반환합니다:
  - `id`: 서버에서 UUID 생성
  - `createdAt`: 서버 시각 (ISO 8601)

# Bad — 구현 방법을 지정
description: |
  SQLite에 INSERT하고 lastInsertRowid를 반환합니다.
```

## 스키마 명명 규칙

| 패턴 | 용도 | 예시 |
|------|------|------|
| `{Entity}` | 응답용 전체 형상 | `Comment`, `Reply` |
| `{Entity}Create` | 생성 요청 본문 | `CommentCreate` |
| `{Entity}Update` | 수정 요청 본문 (partial) | `CommentUpdate` |
| `{Entity}Response` | 목록 응답 래퍼 | `CommentsResponse` |

## 타입 규칙

| 데이터 | OpenAPI 타입 |
|--------|-------------|
| 식별자 | `type: string, format: uuid` |
| 시각 | `type: string, format: date-time` (ISO 8601) |
| JSON 덩어리 (anchor 등) | 별도 스키마로 정의, `$ref`로 참조 |
| 선택 필드 | required에서 제외 |
| null 가능 | `nullable: true` |

## 경로 규칙

- 기본 경로: `/__ivypost__/`
- 리소스 복수형: `/comments`, `/screenshots`
- 개별 리소스: `/comments/{id}`
- 쿼리 파라미터: 필터/검색용 (`?url=...`)

## 변경 시 체크리스트

1. 스키마 필드를 추가/삭제하면 `readOnly` 여부를 확인한다.
2. 요청/응답 스키마 분리가 유지되는지 확인한다.
3. description에 서버 동작 요구사항이 빠지지 않았는지 확인한다.
4. 변경 후 `src/lib/types.ts`와 동기화가 필요한지 확인한다.

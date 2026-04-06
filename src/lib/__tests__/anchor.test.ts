import { describe, test, expect, beforeEach } from 'bun:test';
import { collectAnchor, findAnchor } from '../anchor';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('collectAnchor', () => {
  test('기본 요소에서 앵커 정보 수집', () => {
    document.body.innerHTML = '<button id="btn" class="primary">클릭</button>';
    const el = document.getElementById('btn')!;
    const anchor = collectAnchor(el);

    expect(anchor.id).toBe('btn');
    expect(anchor.tagName).toBe('BUTTON');
    expect(anchor.className).toBe('primary');
    expect(anchor.textContent).toBe('클릭');
  });

  test('data-testid 수집', () => {
    document.body.innerHTML = '<div data-testid="my-div">내용</div>';
    const el = document.querySelector('[data-testid]')!;
    const anchor = collectAnchor(el);

    expect(anchor.testId).toBe('my-div');
    expect(anchor.attributes['data-testid']).toBe('my-div');
  });

  test('id 없는 요소는 id가 null', () => {
    document.body.innerHTML = '<span>텍스트</span>';
    const el = document.querySelector('span')!;
    const anchor = collectAnchor(el);

    expect(anchor.id).toBeNull();
  });

  test('textContent 100자 제한', () => {
    const longText = 'A'.repeat(200);
    document.body.innerHTML = `<p>${longText}</p>`;
    const el = document.querySelector('p')!;
    const anchor = collectAnchor(el);

    expect(anchor.textContent.length).toBe(100);
  });

  test('nearestIdAncestor 탐색', () => {
    document.body.innerHTML = `
      <div id="parent">
        <ul>
          <li><button>전송</button></li>
        </ul>
      </div>
    `;
    const btn = document.querySelector('button')!;
    const anchor = collectAnchor(btn);

    expect(anchor.nearestIdAncestor).not.toBeNull();
    expect(anchor.nearestIdAncestor!.id).toBe('parent');
  });

  test('안정적 속성만 수집 (role, type 등)', () => {
    document.body.innerHTML = '<input type="text" role="searchbox" name="q" data-random="x" />';
    const el = document.querySelector('input')!;
    const anchor = collectAnchor(el);

    expect(anchor.attributes['type']).toBe('text');
    expect(anchor.attributes['role']).toBe('searchbox');
    expect(anchor.attributes['name']).toBe('q');
    expect(anchor.attributes['data-random']).toBeUndefined();
  });

  test('CSS selector 생성', () => {
    document.body.innerHTML = `
      <div>
        <span>첫번째</span>
        <span>두번째</span>
      </div>
    `;
    const second = document.querySelectorAll('span')[1];
    const anchor = collectAnchor(second);

    // selector로 다시 찾을 수 있어야 함
    const found = document.querySelector(anchor.selector);
    expect(found).toBe(second);
  });
});

describe('findAnchor', () => {
  test('1순위: data-testid로 찾기 (confidence 1.0)', () => {
    document.body.innerHTML = '<button data-testid="submit">전송</button>';
    const result = findAnchor({
      selector: 'button',
      testId: 'submit',
      id: null,
      textContent: '전송',
      tagName: 'BUTTON',
      className: '',
      rect: { x: 0, y: 0 },
      nearestIdAncestor: null,
      attributes: {},
    });

    expect(result.element).not.toBeNull();
    expect(result.confidence).toBe(1.0);
  });

  test('2순위: id로 찾기 (confidence 1.0)', () => {
    document.body.innerHTML = '<div id="target">내용</div>';
    const result = findAnchor({
      selector: 'div',
      testId: null,
      id: 'target',
      textContent: '내용',
      tagName: 'DIV',
      className: '',
      rect: { x: 0, y: 0 },
      nearestIdAncestor: null,
      attributes: {},
    });

    expect(result.element).not.toBeNull();
    expect(result.confidence).toBe(1.0);
  });

  test('3순위: id 조상 + 텍스트 (confidence 0.9)', () => {
    document.body.innerHTML = `
      <div id="section">
        <button>취소</button>
        <button>확인</button>
      </div>
    `;
    const result = findAnchor({
      selector: 'div > button:nth-of-type(2)',
      testId: null,
      id: null,
      textContent: '확인',
      tagName: 'BUTTON',
      className: '',
      rect: { x: 0, y: 0 },
      nearestIdAncestor: { id: 'section', relativePath: 'button', depth: 1 },
      attributes: {},
    });

    expect(result.element!.textContent?.trim()).toBe('확인');
    expect(result.confidence).toBe(0.9);
  });

  test('4순위: selector + 텍스트 일치 (confidence 0.8)', () => {
    document.body.innerHTML = '<div><p>단락 내용</p></div>';
    const result = findAnchor({
      selector: 'div > p',
      testId: null,
      id: null,
      textContent: '단락 내용',
      tagName: 'P',
      className: '',
      rect: { x: 0, y: 0 },
      nearestIdAncestor: null,
      attributes: {},
    });

    expect(result.confidence).toBe(0.8);
  });

  test('4순위: selector 일치, 텍스트 불일치 (confidence 0.6)', () => {
    document.body.innerHTML = '<div><p>변경된 내용</p></div>';
    const result = findAnchor({
      selector: 'div > p',
      testId: null,
      id: null,
      textContent: '원래 내용',
      tagName: 'P',
      className: '',
      rect: { x: 0, y: 0 },
      nearestIdAncestor: null,
      attributes: {},
    });

    expect(result.confidence).toBe(0.6);
  });

  test('5순위: 태그 + 클래스 + 텍스트 전체 탐색 (confidence 0.5)', () => {
    document.body.innerHTML = `
      <div>
        <span class="tag">라벨A</span>
        <span class="tag">라벨B</span>
      </div>
    `;
    const result = findAnchor({
      selector: 'invalid > selector',
      testId: null,
      id: null,
      textContent: '라벨B',
      tagName: 'SPAN',
      className: 'tag',
      rect: { x: 0, y: 0 },
      nearestIdAncestor: null,
      attributes: {},
    });

    expect(result.element!.textContent).toBe('라벨B');
    expect(result.confidence).toBe(0.5);
  });

  test('실패: 요소 못 찾으면 confidence 0', () => {
    document.body.innerHTML = '<div>아무것도 없음</div>';
    const result = findAnchor({
      selector: 'button.gone',
      testId: null,
      id: null,
      textContent: '사라진 버튼',
      tagName: 'BUTTON',
      className: 'gone',
      rect: { x: 0.5, y: 0.5 },
      nearestIdAncestor: null,
      attributes: {},
    });

    expect(result.element).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

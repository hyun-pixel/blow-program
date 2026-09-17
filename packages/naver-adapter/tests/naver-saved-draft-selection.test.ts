import { describe, expect, it } from 'vitest';
import {
  selectUniqueSavedDraftListIndex,
  selectUniqueSavedDraftTitleIndex,
} from '../src/naver-connection.js';

describe('네이버 임시글 안전 선택', () => {
  it('임시저장 목록 버튼과 제목이 각각 하나일 때만 선택한다', () => {
    expect(selectUniqueSavedDraftListIndex([
      { label: '저장', identity: 'save-button' },
      { label: '임시저장 3', identity: 'temporary-save-list' },
      { label: '발행', identity: 'publish-button' },
    ])).toBe(1);
    expect(selectUniqueSavedDraftTitleIndex(
      ['다른 글', '실손보험 가입 전 확인할 내용'],
      '실손보험 가입 전 확인할 내용',
    )).toBe(1);
    expect(selectUniqueSavedDraftTitleIndex(
      ['실손보험 가입 전 확인할 내용 2026. 09. 16. 오후 5:38'],
      '실손보험 가입 전 확인할 내용',
    )).toBe(0);
    expect(selectUniqueSavedDraftTitleIndex(
      ['처음 실손보험 가입 전\u200B 확인할 내용'],
      '처음 실손보험 가입 전 확인할 내용',
    )).toBe(0);
  });

  it('현재 네이버 편집기의 저장 건수 버튼을 임시저장 목록으로 인식한다', () => {
    expect(selectUniqueSavedDraftListIndex([
      {
        label: '저장 5 임시저장 목록',
        identity: 'save-button',
        aliases: ['저장\n5', '임시저장 목록'],
      },
      { label: '발행', identity: 'publish-button' },
    ])).toBe(0);
  });

  it('저장 버튼과 분리된 숫자 목록 버튼을 인식한다', () => {
    expect(selectUniqueSavedDraftListIndex([
      { label: '저장', identity: 'save-button' },
      {
        label: '5',
        identity: 'save-count',
        nearSaveControl: true,
      },
      { label: '32', identity: 'font-size', nearSaveControl: false },
    ])).toBe(1);
  });

  it('후보가 없거나 중복되면 임의로 선택하지 않는다', () => {
    expect(selectUniqueSavedDraftListIndex([
      { label: '저장', identity: 'save-button' },
    ])).toBeNull();
    expect(selectUniqueSavedDraftTitleIndex(
      ['같은 제목', '같은 제목'],
      '같은 제목',
    )).toBeNull();
    expect(selectUniqueSavedDraftTitleIndex(
      ['같은 제목', '같은 제목 추가 정보'],
      '같은 제목',
    )).toBeNull();
  });
});

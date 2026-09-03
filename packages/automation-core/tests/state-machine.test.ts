import { describe, expect, it } from 'vitest';
import {
  InvalidPocTransitionError,
  PocStateMachine,
  type PocState,
} from '../src/index.js';

const successfulFlow: readonly PocState[] = [
  'PREFLIGHT',
  'OPEN_BROWSER',
  'EDITOR_READY',
  'TITLE_INPUT',
  'BODY_INPUT',
  'TEMP_SAVE',
  'VERIFY_SAVE',
  'COMPLETED',
];

describe('PocStateMachine', () => {
  it('records the complete mock-editor flow in order', () => {
    const machine = new PocStateMachine();

    for (const state of successfulFlow) {
      machine.transition(state, `${state} 상태 확인`);
    }

    const snapshot = machine.snapshot();

    expect(snapshot.current).toBe('COMPLETED');
    expect(snapshot.isTerminal).toBe(true);
    expect(snapshot.history.map((entry) => entry.state)).toEqual([
      'IDLE',
      ...successfulFlow,
    ]);
  });

  it('rejects a transition that skips the expected step', () => {
    const machine = new PocStateMachine();

    expect(() => machine.transition('BODY_INPUT', '본문 입력')).toThrow(
      InvalidPocTransitionError,
    );
  });

  it('moves an active run to the failed terminal state', () => {
    const machine = new PocStateMachine();

    machine.transition('PREFLIGHT', '실행 전 점검');
    const snapshot = machine.fail('Chrome을 찾지 못했습니다.');

    expect(snapshot.current).toBe('FAILED');
    expect(snapshot.history.at(-1)?.message).toBe(
      'Chrome을 찾지 못했습니다.',
    );
  });

  it('allows a completed run to reset without discarding its history', () => {
    const machine = new PocStateMachine();

    for (const state of successfulFlow) {
      machine.transition(state, state);
    }

    const snapshot = machine.reset();

    expect(snapshot.current).toBe('IDLE');
    expect(snapshot.history.at(-2)?.state).toBe('COMPLETED');
  });
});

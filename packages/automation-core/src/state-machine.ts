export const pocStates = [
  'IDLE',
  'PREFLIGHT',
  'OPEN_BROWSER',
  'EDITOR_READY',
  'TITLE_INPUT',
  'BODY_INPUT',
  'TEMP_SAVE',
  'VERIFY_SAVE',
  'COMPLETED',
  'FAILED',
] as const;

export type PocState = (typeof pocStates)[number];

export interface PocStateEntry {
  readonly state: PocState;
  readonly message: string;
  readonly occurredAt: string;
}

export interface PocSnapshot {
  readonly current: PocState;
  readonly history: readonly PocStateEntry[];
  readonly isTerminal: boolean;
}

const terminalStates = new Set<PocState>(['COMPLETED', 'FAILED']);

const allowedTransitions: Readonly<Record<PocState, readonly PocState[]>> = {
  IDLE: ['PREFLIGHT'],
  PREFLIGHT: ['OPEN_BROWSER', 'FAILED'],
  OPEN_BROWSER: ['EDITOR_READY', 'FAILED'],
  EDITOR_READY: ['TITLE_INPUT', 'FAILED'],
  TITLE_INPUT: ['BODY_INPUT', 'FAILED'],
  BODY_INPUT: ['TEMP_SAVE', 'FAILED'],
  TEMP_SAVE: ['VERIFY_SAVE', 'FAILED'],
  VERIFY_SAVE: ['COMPLETED', 'FAILED'],
  COMPLETED: ['IDLE'],
  FAILED: ['IDLE'],
};

export class InvalidPocTransitionError extends Error {
  constructor(from: PocState, to: PocState) {
    super(`허용되지 않은 POC 상태 변경입니다: ${from} -> ${to}`);
    this.name = 'InvalidPocTransitionError';
  }
}

export class PocStateMachine {
  private currentState: PocState = 'IDLE';
  private readonly entries: PocStateEntry[] = [
    {
      state: 'IDLE',
      message: '테스트를 시작할 수 있습니다.',
      occurredAt: new Date().toISOString(),
    },
  ];

  transition(nextState: PocState, message: string): PocSnapshot {
    if (!allowedTransitions[this.currentState].includes(nextState)) {
      throw new InvalidPocTransitionError(this.currentState, nextState);
    }

    this.currentState = nextState;
    this.entries.push({
      state: nextState,
      message,
      occurredAt: new Date().toISOString(),
    });

    return this.snapshot();
  }

  fail(message: string): PocSnapshot {
    if (terminalStates.has(this.currentState)) {
      throw new InvalidPocTransitionError(this.currentState, 'FAILED');
    }

    return this.transition('FAILED', message);
  }

  reset(): PocSnapshot {
    if (!terminalStates.has(this.currentState)) {
      throw new InvalidPocTransitionError(this.currentState, 'IDLE');
    }

    return this.transition('IDLE', '테스트를 다시 시작할 수 있습니다.');
  }

  snapshot(): PocSnapshot {
    return {
      current: this.currentState,
      history: this.entries.map((entry) => ({ ...entry })),
      isTerminal: terminalStates.has(this.currentState),
    };
  }
}

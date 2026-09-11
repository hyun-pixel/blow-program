export type AdminAccessStage = 'denied' | 'enroll' | 'challenge' | 'ready';

export function decideAdminAccess(input: {
  readonly isAdmin: boolean;
  readonly currentLevel: string | null;
  readonly hasVerifiedTotp: boolean;
}): AdminAccessStage {
  if (!input.isAdmin) {
    return 'denied';
  }

  if (input.currentLevel === 'aal2') {
    return 'ready';
  }

  return input.hasVerifiedTotp ? 'challenge' : 'enroll';
}
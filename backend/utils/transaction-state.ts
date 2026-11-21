import type { Transaction } from 'sequelize';

/** Sequelize 6 exposes finished at runtime, but omits it from its public declarations. */
export function transactionFinished(transaction: Transaction): boolean {
  return 'finished' in transaction && Boolean(transaction.finished);
}

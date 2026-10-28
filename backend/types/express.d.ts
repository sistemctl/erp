import type { RequestUser } from '../../shared/contracts';
import type { Transaction } from 'sequelize';
export interface AuditEntry {
  accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'PRICE_OVERRIDE' | 'EGRESO_CAJA'; modulo: string; registroId?: string | number | null;
  valorAnterior?: unknown; valorNuevo?: unknown;
}
declare global {
  namespace Express {
    interface Request {
      usuario?: RequestUser;
      token?: string;
      cierreAdministrativo?: boolean;
      logAudit?: (entry: AuditEntry) => Promise<void>;
      auditTransaction?: Transaction & { finished?: 'commit' | 'rollback' };
    }
  }
}

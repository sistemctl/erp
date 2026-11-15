import { DataTypes, type Sequelize, type ModelAttributeColumnOptions } from 'sequelize';

// En producción el arranque usa sequelize.sync() SIN alter: crea tablas nuevas pero no
// añade columnas nuevas a tablas existentes. Esta migración, aditiva e idempotente,
// compara cada modelo con su tabla y añade las columnas que falten.
//
// - Una columna NOT NULL sin valor por defecto se añade como NULL (no se puede
//   rellenar una tabla con datos sin un valor). Se registra para revisarla.
// - No crea restricciones UNIQUE (podrían fallar con datos existentes).
// - Convierte a texto las columnas de método de pago que en bases antiguas eran ENUM:
//   el modelo las define como texto para admitir medios de pago configurables.

const METODOS_TEXTO: [string, string][] = [
  ['Abonos', 'metodo'],
  ['PagosVenta', 'metodo'],
  ['DevolucionesVenta', 'metodoReembolso']
];

async function migrateColumnasModelo(sequelize: Sequelize) {
  const qi = sequelize.getQueryInterface();
  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(20261115)', { transaction });

    for (const model of Object.values(sequelize.models)) {
      const tableName = model.getTableName();
      const table = typeof tableName === 'string' ? tableName : tableName.tableName;
      let columnas: Record<string, unknown>;
      try {
        columnas = await qi.describeTable(table, { transaction } as never);
      } catch {
        continue; // tabla inexistente: sync() la crea completa
      }
      for (const [nombre, attr] of Object.entries(model.getAttributes())) {
        if (attr.type instanceof DataTypes.VIRTUAL) continue;
        const campo = attr.field || nombre;
        if (campo in columnas) continue;
        const definicion: ModelAttributeColumnOptions = { ...attr };
        delete definicion.primaryKey;
        delete definicion.unique;
        delete definicion.autoIncrement;
        let advertencia = '';
        if (definicion.allowNull === false && definicion.defaultValue === undefined) {
          definicion.allowNull = true;
          advertencia = ' (añadida como NULL: el modelo la exige NOT NULL sin valor por defecto, revise los registros antiguos)';
        }
        await qi.addColumn(table, campo, definicion, { transaction });
        console.warn(`[Migración] Columna añadida ${table}.${campo}${advertencia}.`);
      }
    }

    for (const [table, column] of METODOS_TEXTO) {
      const [rows] = await sequelize.query(
        `SELECT data_type FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = :table AND column_name = :column`,
        { replacements: { table, column }, transaction }
      ) as [Array<{ data_type: string }>, unknown];
      if (rows[0]?.data_type === 'USER-DEFINED') {
        await sequelize.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE VARCHAR(255) USING "${column}"::text`,
          { transaction }
        );
        console.warn(`[Migración] ${table}.${column} convertido de ENUM a texto (medios de pago configurables).`);
      }
    }
  });
}
export { migrateColumnasModelo };

import type { Transaction } from 'sequelize';
import models = require('../models');
const { Producto } = models;
import { Op } from 'sequelize';

export const PREFIX = '29';
const SEQUENCE_LENGTH = 10;
export const FIRST_CODE = `${PREFIX}${'0'.repeat(SEQUENCE_LENGTH - 1)}1`;
const INTERNAL_PATTERN = /^29\d{10}$/;

export function isInternalBarcode(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && INTERNAL_PATTERN.test(codigo.trim());
}

async function findMaxInternalSequence(transaction?: Transaction) {
  const rows = await Producto.findAll({
    attributes: ['codigoBarras'],
    where: {
      codigoBarras: { [Op.like]: `${PREFIX}%` }
    },
    transaction
  });

  let max = 0n;
  for (const row of rows) {
    if (!isInternalBarcode(row.codigoBarras)) continue;
    try {
      const value = BigInt(row.codigoBarras.slice(PREFIX.length));
      if (value > max) max = value;
    } catch {
      /* ignore malformed */
    }
  }
  return max;
}

function formatInternalCode(sequence: bigint) {
  const padded = String(sequence).padStart(SEQUENCE_LENGTH, '0');
  if (padded.length > SEQUENCE_LENGTH) {
    throw new Error('Se agotó el rango de códigos internos disponibles.');
  }
  return `${PREFIX}${padded}`;
}

async function codeExists(codigo: string, transaction?: Transaction) {
  const found = await Producto.findOne({
    where: { codigoBarras: codigo },
    attributes: ['id'],
    transaction
  });
  return Boolean(found);
}

export async function generateInternalBarcode(transaction?: Transaction) {
  let sequence = await findMaxInternalSequence(transaction);
  if (sequence === 0n) {
    sequence = BigInt(FIRST_CODE.slice(PREFIX.length));
  } else {
    sequence += 1n;
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const codigo = formatInternalCode(sequence);
    if (!(await codeExists(codigo, transaction))) {
      return codigo;
    }
    sequence += 1n;
  }

  throw new Error('No se pudo generar un código interno único.');
}

export function normalizeCodigoBarras(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}


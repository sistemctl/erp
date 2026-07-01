const { Producto } = require('../models');
const { Op } = require('sequelize');

const PREFIX = '29';
const SEQUENCE_LENGTH = 10;
const FIRST_CODE = `${PREFIX}${'0'.repeat(SEQUENCE_LENGTH - 1)}1`;
const INTERNAL_PATTERN = /^29\d{10}$/;

function isInternalBarcode(codigo) {
  return typeof codigo === 'string' && INTERNAL_PATTERN.test(codigo.trim());
}

async function findMaxInternalSequence(transaction) {
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

function formatInternalCode(sequence) {
  const padded = String(sequence).padStart(SEQUENCE_LENGTH, '0');
  if (padded.length > SEQUENCE_LENGTH) {
    throw new Error('Se agotó el rango de códigos internos disponibles.');
  }
  return `${PREFIX}${padded}`;
}

async function codeExists(codigo, transaction) {
  const found = await Producto.findOne({
    where: { codigoBarras: codigo },
    attributes: ['id'],
    transaction
  });
  return Boolean(found);
}

async function generateInternalBarcode(transaction) {
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

function normalizeCodigoBarras(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

module.exports = {
  PREFIX,
  FIRST_CODE,
  isInternalBarcode,
  generateInternalBarcode,
  normalizeCodigoBarras
};

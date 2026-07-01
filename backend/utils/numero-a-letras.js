/**
 * Convierte un número entero a letras en español (pesos colombianos).
 */
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const ESPECIALES = {
  10: 'DIEZ', 11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
  16: 'DIECISÉIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
  20: 'VEINTE', 21: 'VEINTIUNO', 22: 'VEINTIDÓS', 23: 'VEINTITRÉS', 24: 'VEINTICUATRO',
  25: 'VEINTICINCO', 26: 'VEINTISÉIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE'
};

function centenas(n) {
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let texto = '';
  if (c === 1) texto = resto === 0 ? 'CIEN' : 'CIENTO';
  else if (c === 5) texto = 'QUINIENTOS';
  else if (c === 7) texto = 'SETECIENTOS';
  else if (c === 9) texto = 'NOVECIENTOS';
  else if (c > 0) texto = `${UNIDADES[c]}CIENTOS`;
  if (resto > 0) texto += (texto ? ' ' : '') + decenasYUnidades(resto);
  return texto;
}

function decenasYUnidades(n) {
  if (n < 10) return UNIDADES[n];
  if (ESPECIALES[n]) return ESPECIALES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 2 && u > 0) return `VEINTI${UNIDADES[u].toLowerCase()}`.toUpperCase().replace('VEINTIUNO', 'VEINTIÚN');
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

function seccion(n, divisor, singular, plural) {
  const cant = Math.floor(n / divisor);
  const resto = n % divisor;
  let texto = '';
  if (cant > 0) {
    if (cant === 1) texto = singular;
    else texto = `${convertirEntero(cant)} ${plural}`;
  }
  if (resto > 0) texto += (texto ? ' ' : '') + convertirEntero(resto);
  return texto;
}

function convertirEntero(n) {
  if (n === 0) return 'CERO';
  if (n < 100) return decenasYUnidades(n);
  if (n < 1000) return centenas(n);
  if (n < 1000000) return seccion(n, 1000, 'MIL', 'MIL');
  return seccion(n, 1000000, 'UN MILLÓN', 'MILLONES');
}

function numeroALetras(valor) {
  const n = Math.round(parseFloat(valor) || 0);
  return `${convertirEntero(n)} PESOS M/CTE`;
}

module.exports = { numeroALetras };

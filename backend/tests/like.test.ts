import { test } from 'node:test';
import assert = require('node:assert/strict');
import { contiene, escaparLike } from '../utils/like';

test('escaparLike neutraliza los comodines % y _ y la barra de escape', () => {
  assert.equal(escaparLike('50%'), '50\\%');
  assert.equal(escaparLike('cable_usb'), 'cable\\_usb');
  assert.equal(escaparLike('a\\b'), 'a\\\\b');
  assert.equal(escaparLike(undefined), '');
});

test('contiene arma el patrón de búsqueda parcial con el texto escapado', () => {
  assert.equal(contiene('iPhone 15'), '%iPhone 15%');
  assert.equal(contiene('100%'), '%100\\%%');
});

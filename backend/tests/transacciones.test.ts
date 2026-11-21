import { test } from 'node:test';
import assert = require('node:assert/strict');
import fs = require('node:fs');
import path = require('node:path');
import ts = require('typescript');

/**
 * Guardia estática: cada `await sequelize.transaction()` manual de un controlador debe
 * cerrarse en todas sus salidas. Si un `return` sale antes del commit sin rollback (y sin
 * un catch/finally que lo haga), la conexión queda ocupada hasta agotar el pool.
 */
const CONTROLLERS = [path.join(__dirname, '..', 'controllers'), path.join(__dirname, '..', '..', 'controllers')]
  .find((dir) => fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.controller.ts')));

function llama(nodo: ts.Node, metodo: string): boolean {
  let encontrado = false;
  const visitar = (x: ts.Node) => {
    if (encontrado) return;
    if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === metodo) {
      encontrado = true;
      return;
    }
    if (x !== nodo && ts.isFunctionLike(x)) return;
    ts.forEachChild(x, visitar);
  };
  visitar(nodo);
  return encontrado;
}

function transaccionesAbiertas(archivo: string): string[] {
  const fuente = ts.createSourceFile(archivo, fs.readFileSync(archivo, 'utf8'), ts.ScriptTarget.ES2022, true);
  const linea = (n: ts.Node) => fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const hallazgos: string[] = [];

  const revisarDeclaracion = (decl: ts.VariableDeclaration) => {
    // Alcance de la transacción: el bloque donde se declara.
    let alcance: ts.Node = decl;
    while (alcance.parent && !ts.isBlock(alcance) && !ts.isSourceFile(alcance)) alcance = alcance.parent;
    const funcion = (() => { let p: ts.Node | undefined = decl; while (p && !ts.isFunctionLike(p)) p = p.parent; return p; })();
    if (funcion && !(() => { let ok = false; const v = (x: ts.Node) => { if (x !== funcion && ts.isFunctionLike(x)) return; if (ts.isTryStatement(x) && ((x.catchClause && llama(x.catchClause.block, 'rollback')) || (x.finallyBlock && llama(x.finallyBlock, 'rollback')))) ok = true; ts.forEachChild(x, v); }; v(funcion); return ok; })()) {
      hallazgos.push(`${path.basename(archivo)}:${linea(decl)} transacción sin rollback en catch/finally`);
    }

    const visitar = (x: ts.Node) => {
      if (x !== alcance && ts.isFunctionLike(x)) return;
      if (ts.isReturnStatement(x) && x.getStart() > decl.getStart()) {
        let p: ts.Node = x;
        let cubierto = false;
        while (p && p !== alcance) {
          if (ts.isCatchClause(p)) { cubierto = true; break; }
          if (ts.isTryStatement(p) && p.finallyBlock && llama(p.finallyBlock, 'rollback')) { cubierto = true; break; }
          const padre = p.parent;
          if (padre && (ts.isBlock(padre) || ts.isCaseClause(padre))) {
            const previas = padre.statements.slice(0, padre.statements.indexOf(p as ts.Statement));
            if (previas.some((s) => llama(s, 'rollback') || llama(s, 'commit'))) { cubierto = true; break; }
          }
          p = p.parent;
        }
        if (!cubierto) hallazgos.push(`${path.basename(archivo)}:${linea(x)} return sin commit/rollback previo`);
      }
      ts.forEachChild(x, visitar);
    };
    visitar(alcance);
  };

  const recorrer = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.initializer
      && /^await sequelize\.transaction\((\{[^}]*\})?\)$/.test(n.initializer.getText().replace(/\s+/g, ' '))) {
      revisarDeclaracion(n);
    }
    ts.forEachChild(n, recorrer);
  };
  recorrer(fuente);
  return hallazgos;
}

test('toda transacción manual de los controladores se confirma o se deshace en cada salida', () => {
  assert.ok(CONTROLLERS, 'No se encontró la carpeta de controladores fuente.');
  const archivos = fs.readdirSync(CONTROLLERS).filter((f) => f.endsWith('.controller.ts')).map((f) => path.join(CONTROLLERS, f));
  const hallazgos = archivos.flatMap(transaccionesAbiertas);
  assert.deepEqual(hallazgos, []);
});

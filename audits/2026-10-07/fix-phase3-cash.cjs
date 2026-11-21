const fs=require('node:fs');const p='frontend/assets/js/modules/caja.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace(/parseFloat\(([^\n;]*? \|\| (?:0|50000))\)/g,'Number($1)');
s=s.replace(/document.getElementById\('([^']+)'\)\?\.value/g,(_,id)=>`document.querySelector<HTMLInputElement | HTMLSelectElement>('#${id}')?.value`);
s=s.replace('administrativo || data.cierrePendiente;', 'administrativo || !!data.cierrePendiente;').replace('e.categoria.nombre','e.categoria?.nombre');
s=s.replace(/const data = \{\s*monto:/, 'const data = { pinAdmin: undefined as string | undefined,\n      monto:');
s=s.replace("montoInput.value = saldoDisponible;", "montoInput.value = String(saldoDisponible);");
fs.writeFileSync(p,s);

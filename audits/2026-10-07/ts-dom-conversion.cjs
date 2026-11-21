const {base}=require('./ts-conversion-tools.cjs');
module.exports=s=>{
s=base(s);
s=`import { eventField, eventElement, requireSelector, requireField } from '../utils/dom.js';\n`+s;
s=s.replace(/\b(e|event)\.target\.value/g,'eventField($1).value').replace(/\b(e|event)\.target\.checked/g,'(eventField($1) instanceof HTMLInputElement && eventField($1).checked)').replace(/\b(e|event)\.target\.closest/g,'eventElement($1).closest<HTMLElement>');
s=s.replace(/\.contains\((e|event)\.target\)/g,'.contains(eventElement($1))').replaceAll('e.message','errorMessage(e)');
s=s.replace(/((?:document|\w+)\.querySelectorAll)\('([^']+)'\)/g,"$1<HTMLElement>('$2')");
s=s.replace(/(requireElement\('[^']+', \w+\)\.value = )([^;\n]+);/g,'$1String($2);');
s=s.replace(/parseFloat\((requireElement\([^\n]*?\)\.value) \|\| 0\)/g,"parseFloat($1 || '0')");
s=s.replace(/formatter\.format\(([^()\n]+)\)/g,'formatter.format(Number($1))');
return s;
};

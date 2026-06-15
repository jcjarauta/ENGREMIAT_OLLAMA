'use strict';
function s(v,n){if(typeof v!=='string'||v.length===0)throw new Error(n+'_REQUIRED');return v;}
function normalizeEditorCall(input){
if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('INPUT_OBJECT_REQUIRED');
let c={...input},source='CANONICAL_TOP_LEVEL';
if(Array.isArray(c.files)){if(c.files.length!==1)throw new Error('ONE_FILE_REQUIRED');const f=c.files[0];c={path:f.path,new_text:f.new_text!==undefined?f.new_text:f.content,old_text:f.old_text,insert_line:f.insert_line};source='FILES_ARRAY_SINGLE_ITEM';}
const path=s(c.path,'PATH');
if(c.old_text!==undefined){return{tool:'editor',normalized_from:source,strategy:'STR_REPLACE',arguments:{command:'str_replace',path:path,old_str:s(c.old_text,'OLD_TEXT'),new_str:s(c.new_text,'NEW_TEXT')}};}
if(c.insert_line!==undefined){if(!Number.isInteger(c.insert_line)||c.insert_line<1)throw new Error('INSERT_LINE_INVALID');return{tool:'editor',normalized_from:source,strategy:'INSERT',arguments:{command:'insert',path:path,insert_line:c.insert_line,insert_text:s(c.new_text,'NEW_TEXT')}};}
return{tool:'editor',normalized_from:source,strategy:'CREATE_OR_OVERWRITE',arguments:{command:'create',path:path,file_text:s(c.new_text,'NEW_TEXT')}};
}
module.exports={normalizeEditorCall};

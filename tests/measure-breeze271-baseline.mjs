/* Run the same measurement harness against the immutable shipped product. */
import {mkdtempSync,copyFileSync,symlinkSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),scratch=mkdtempSync(join(tmpdir(),'breeze-271-measure-'));
let registered=false;
try{
 execFileSync('git',['worktree','add','--quiet','--detach',scratch,'dfdbbab45e798aabca7f64133eb170265b96a7de'],{cwd:root});registered=true;
 for(const file of ['tests/measure-all-words-browser.mjs','tests/measure-study-picker-scroll-browser.mjs','tests/helpers/all-words-fixture.mjs'])copyFileSync(join(root,file),join(scratch,file));
 symlinkSync(join(root,'node_modules'),join(scratch,'node_modules'),'dir');
 for(const file of ['tests/measure-all-words-browser.mjs','tests/measure-study-picker-scroll-browser.mjs'])execFileSync(process.execPath,[file],{cwd:scratch,stdio:'inherit',env:process.env});
}finally{if(registered)execFileSync('git',['worktree','remove','--force',scratch],{cwd:root});else rmSync(scratch,{recursive:true,force:true});}

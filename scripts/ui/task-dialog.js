/* A single short task surface. Native dialog owns focus, Escape and inert background. */
const taskDialog=/** @type {HTMLDialogElement} */(document.getElementById('task-dialog'));
const taskInput=/** @type {HTMLInputElement} */(document.getElementById('task-input'));
/** @type {null | ((value:string|null)=>void)} */
let resolveTask=null;
let taskHasInput=false;
/** @type {HTMLElement|null} */
let taskReturnFocus=null;
/** @param {{title:string,description?:string,input?:boolean,value?:string,action?:string,danger?:boolean}} options */
function breezeTaskDialog(options){
  // Do not let a second request replace a decision already being made.
  if(taskDialog.open)return Promise.resolve(null);
  taskReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  taskHasInput=!!options.input;
  document.getElementById('task-title').textContent=options.title;
  document.getElementById('task-description').textContent=options.description||'';
  document.getElementById('task-description').hidden=!options.description;
  document.getElementById('task-input-label').hidden=!taskHasInput;
  taskInput.value=options.value||'';taskInput.required=taskHasInput;
  taskInput.setCustomValidity('');
  const submit=document.getElementById('task-submit');
  submit.textContent=options.action||'저장';submit.classList.toggle('danger',!!options.danger);
  const result=new Promise(resolve=>{resolveTask=resolve;});
  taskDialog.showModal();
  if(taskHasInput){taskInput.focus();taskInput.select();}
  else /** @type {HTMLButtonElement} */(taskDialog.querySelector('.task-actions [data-task-cancel]')).focus();
  return result;
}
function finishTask(value){
  const resolve=resolveTask;resolveTask=null;
  taskDialog.close();
  if(taskReturnFocus?.isConnected)taskReturnFocus.focus({preventScroll:true});
  resolve?.(value);
}
taskDialog.querySelectorAll('[data-task-cancel]').forEach(button=>button.addEventListener('click',()=>finishTask(null)));
taskDialog.addEventListener('cancel',event=>{event.preventDefault();finishTask(null);});
taskDialog.addEventListener('close',()=>{if(!taskDialog.open&&resolveTask){const resolve=resolveTask;resolveTask=null;resolve(null);}});
taskInput.addEventListener('input',()=>taskInput.setCustomValidity(''));
document.getElementById('task-form').addEventListener('submit',event=>{
  event.preventDefault();
  if(taskHasInput&&!taskInput.value.trim()){taskInput.setCustomValidity('카테고리 이름을 입력해 주세요.');taskInput.reportValidity();return;}
  finishTask(taskHasInput?taskInput.value.trim():'confirmed');
});

/* Pure back-stack for the Apps in Toss build.
   The native bar owns the visible back button. This plan only chooses
   which in-app layer closes. The first screen exits the mini-app. */

export function tossBackPlan(state){
  const view=state&&state.view||'home';
  if(state?.aiNotice) return 'close-notice';
  if(state?.sentence) return 'close-sentence';
  if(state?.panel) return 'close-panel';
  if(state?.settings) return 'close-settings';
  if(state?.dialog) return 'close-dialog';
  if(state?.studyOpen) return 'study-back';
  if(view!=='home') return 'home';
  return 'exit';
}

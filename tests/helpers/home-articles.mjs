/* The Home 기사 (RSS) tab is dormant: it only runs when config.js sets
   HOME_ARTICLES:true (docs/decisions/010-local-rss-recommendations.md).
   Browser checks of that dormant code pass this to addInitScript before
   navigation. It runs before config.js and adds the flag to whatever config
   the page assigns, so the rest of the served config stays as it was. */
export function enableHomeArticles(){
  let config={HOME_ARTICLES:true};
  Object.defineProperty(window,'BREEZE_CONFIG',{
    configurable:true,
    get(){return config;},
    set(value){config={...(value||{}),HOME_ARTICLES:true};},
  });
}

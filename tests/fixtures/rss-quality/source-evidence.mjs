// Bounded source quotations for human review, never model input or evaluation
// responses. Fresh pages reviewed 2026-10-05; original trial snapshots unknown.
// Each source contributes <=25 quoted words; no full publisher body is stored.
export const sourceEvidence=[
  {id:'RSS-022',url:'https://bloody-disgusting.com/news/3970212/blumhouse-popcorn-bucket-regal-cinemas/',
    quote:'The Blumhouse van popcorn bucket is currently available for preorder.',locator:'Closing purchase paragraph after the product specification list',
    label:'promotion',labelSource:'user-review',reviewStatus:'user-observation-supported-by-fresh-page',
    supports:'Ordering and merchandise features are the central reader action.',
    counterevidence:'The opening supplies some context about collectible cinema buckets and the studio founder; readable context alone does not settle editorial value.',
    limitation:'Fresh page evidence supports the supplied observation but is not the exact trial extraction.'},
  {id:'RSS-039',url:'https://www.dexerto.com/food/taco-bell-is-giving-duolingos-mascot-its-own-sauce-in-taco-day-collab-3414480/',
    quote:'The collaboration also includes a free month of Super Duolingo for eligible Taco Bell Rewards members.',locator:'Subscription offer paragraph below the marketing officer quotation',
    label:'promotion',labelSource:'user-review',reviewStatus:'user-observation-supported-by-fresh-page',
    supports:'The page explains rewards, redemption, availability and promotional events.',
    counterevidence:'It provides factual campaign terms and cultural context; a useful independent assessment could still be eligible even on the same subject.',
    limitation:'The quote proves an offer is described, not promotional primary purpose in isolation; inspect the surrounding article.'},
  {id:'RSS-021',url:'https://bloody-disgusting.com/news/3970198/scarescore/',
    quote:'The idea is simple: Your body is the review.',locator:'Short paragraph after the company formation and launch announcement',
    label:'uncertain',labelSource:'proposed-policy',reviewStatus:'pending-human-review',
    supports:'The fresh page emphasizes a product launch, founder claims, user benefits and planned activations.',
    counterevidence:'It also explains physiological measurements and potential uses, which might supply reader value despite relying on company claims.',
    limitation:'The user called this borderline. Fresh review suggests launch-copy risk, not a confirmed negative or grounds for a deterministic rejection.'},
  {id:'RSS-002',url:'https://allthatsinteresting.com/dorothea-lange-photos',
    quote:'And below, learn more about the woman behind the camera.',locator:'Transition after the photo gallery, before the biography headings',
    label:'editorial',labelSource:'proposed-policy',reviewStatus:'pending-human-review',
    supports:'Below the gallery are developed accounts of training, government assignments, wartime documentation, publication restrictions and later work.',
    counterevidence:'The page has a large gallery and many captions; the exact trial extraction might differ from the fresh readable biography.',
    limitation:'Proposed preservation applies when the supplied extraction includes that biography. The historical candidate is not relabeled approved.'},
  {id:'RSS-001',url:'https://allthatsinteresting.com/cliff-house-san-francisco',
    quote:'The current structure, the third iteration of the Cliff House, dates from 1909.',locator:'Introductory historical overview before the first resort section',
    label:'editorial',labelSource:'proposed-policy',reviewStatus:'pending-human-review',
    supports:'A commercial resort is described through dated ownership, disasters and reconstruction, rather than an ordering offer.',
    counterevidence:'The conclusion mentions planned reopening; that reference alone should not override the developed historical account.',
    limitation:'This is a proposed commerce/history control, not a new human gold label.'},
  {id:'RSS-014',url:'https://bloody-disgusting.com/movie/3969472/erie-review-plays-fast-and-loose-with-found-footage/',
    quote:'Personally, I view this combination as something of an immersion-breaking cop-out',locator:'Critical paragraph discussing the late shift in filmmaking perspective',
    label:'editorial',labelSource:'proposed-policy',reviewStatus:'pending-human-review',
    supports:'The review explains acting, aesthetics and a specific structural criticism of the film.',
    counterevidence:'It also names cast members and upcoming screenings; those promotional facts do not alone erase the criticism.',
    limitation:'The critical passage illustrates independent review value; the full fresh body still needs human labeling before model evaluation.'},
].map(row=>({...row,reviewDate:'2026-10-05',originalTrialSnapshot:false,modelInput:false}));

// Associations explain fixture intent; they do not equate synthetic prose with
// a publisher snapshot or transfer a user label to a synthetic fixture.
export const syntheticEvidenceLinks={
  'narrative-merchandise':['RSS-022'],
  'narrative-collaboration':['RSS-039'],
  'independent-brand-reporting':[],
  'tested-product-review':['RSS-014'],
  'commerce-history':['RSS-001'],
  'substantial-biography-gallery':['RSS-002'],
  'coherent-sensitive-news':[],
  'ambiguous-launch-analysis':['RSS-021'],
};

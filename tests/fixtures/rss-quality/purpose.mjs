// Original synthetic prose for policy/validator tests, not archived trial bodies.
// Labels below are proposed for human review. Only trialObservations are labels
// supplied by the user; neither labels nor response recipes enter model prompts.
export const trialObservations=[
  {id:'RSS022',label:'promotion',labelSource:'user-review',url:'https://bloody-disgusting.com/news/3970212/blumhouse-popcorn-bucket-regal-cinemas/'},
  {id:'RSS039',label:'promotion',labelSource:'user-review',url:'https://www.dexerto.com/food/taco-bell-is-giving-duolingos-mascot-its-own-sauce-in-taco-day-collab-3414480/'},
  {id:'RSS021',label:'uncertain',labelSource:'user-review',url:'https://bloody-disgusting.com/news/3970198/scarescore/'},
  {id:'RSS002',label:'uncertain',labelSource:'user-review',note:'Dorothea Lange biography/gallery: possible false rejection, not a confirmed negative.'},
];
export const purposeFixtures=[
  {id:'narrative-merchandise',label:'promotion',status:'rejected',choices:{promotion:'yes',evidence:'p2'},title:'Studio introduces a collectible cinema bucket',paragraphs:[
    'Cinema souvenirs have become a familiar part of opening nights. A new studio collectible recalls the van used by its founder when the company was young. The introduction connects the design to several popular films, describes how fans collect souvenirs, and explains why the van appears in the studio newsletter.',
    'The new bucket has lights, smoke effects and themed stickers. The company describes it as an essential addition to a fan collection. It is available to preorder through the studio shop before the next release, and readers are invited to buy one for their next movie night. The article lists product dimensions and accessories but does not assess build quality, compare alternatives or examine the business claims.'
  ]},
  {id:'narrative-collaboration',label:'promotion',status:'rejected',choices:{promotion:'yes',evidence:'p2'},title:'A restaurant and language app launch a sauce campaign',paragraphs:[
    'A restaurant chain and a language learning app are celebrating a food holiday with a limited sauce. Their announcement ties the mascot to a familiar meal and explains that the meal name travels across many languages. The campaign includes colorful packets and a playful version of the mascot dressed for the occasion.',
    'Customers can collect the packets at participating restaurants while supplies last. Rewards members can claim a subscription offer, and a launch event will give fans another way to join the celebration. The rest of the story describes locations, dates and redemption steps. It provides no independent taste test, analysis of subscription conditions or scrutiny of either company beyond the launch announcement.'
  ]},
  {id:'independent-brand-reporting',label:'editorial',status:'approved',title:'Why a restaurant promotion drew complaints',paragraphs:[
    'A restaurant chain advertised a subscription reward alongside a new sauce, but customers found that renewal charges were not explained on the posters. Reporters compared the printed offer with the online terms and interviewed customers who received different instructions at three locations. The chain said it would revise the posters.',
    'Consumer researchers describe how a free trial can turn into a recurring expense when cancellation steps are difficult to find. The report sets out the actual conditions, gives the company response and identifies the claims that could not be verified. It includes the campaign name and a product link so readers can inspect the terms, while its central purpose is to explain and scrutinize the offer.'
  ]},
  {id:'tested-product-review',label:'editorial',status:'approved',title:'A week with a new reading device',paragraphs:[
    'The reviewer used the new reading device on a daily commute and compared page turns with an older model. The brighter display made small text easier to see outdoors, but the location of the buttons caused accidental turns when the device was held in one hand. A table records battery use under the same settings on both devices.',
    'The conclusion explains which readers would benefit and which would gain little from an upgrade. It describes the test conditions and acknowledges that a week cannot establish long-term reliability. The review links to the manufacturer and a retailer, and the publisher may receive affiliate revenue. Those links accompany specific tested strengths and weaknesses rather than replace the assessment.'
  ]},
  {id:'commerce-history',label:'editorial',status:'approved',title:'How a department store shaped a town',paragraphs:[
    'The town archive shows how a department store changed the use of its central square. Payroll books reveal that the company employed many young residents, while council minutes describe objections to delivery traffic. Former workers recall both the wages that helped their families and the strict rules that governed their work.',
    'The article follows changes in ownership and compares advertising promises with surviving business records. It explains why the store closed when shopping patterns changed and how the building became a public library. Historic brand names and prices help establish the timeline. The piece sells no current product; the commercial history supplies evidence about labor, architecture and everyday life.'
  ]},
  {id:'substantial-biography-gallery',label:'editorial',status:'approved',title:'A documentary photographer and the people in her pictures',paragraphs:[
    'The biography follows a documentary photographer from portrait work into field assignments during an economic crisis. It explains how she obtained permission, recorded family circumstances and selected images for publication. Archival correspondence shows that some editors removed context from captions, changing how readers understood the people shown.',
    ...Array.from({length:24},(_,i)=>`Gallery section ${i+1} places a photograph within the photographer’s working life. The prose describes an assignment, explains the choices of framing and captioning, and relates the scene to contemporary accounts of housing and employment. The photograph is optional to this developed narrative: the reader can follow the argument and historical setting through the text.`)
  ]},
  {id:'coherent-sensitive-news',label:'editorial',status:'approved',title:'A town reviews its flood response',paragraphs:[
    'After a severe flood, residents asked why warnings reached some neighborhoods later than others. The report reconstructs the timeline from public alerts and interviews with emergency workers. It distinguishes confirmed deaths from missing-person reports and explains why investigators have not yet assigned responsibility for the communications failure.',
    'Engineers describe the limitations of the river gauges and the way evacuation routes cross low ground. Local officials outline proposed changes, while residents question whether the plans account for people without cars. The article includes difficult descriptions of loss and disagreement. Its coherent reporting remains readable and substantive despite the sensitive subject and unresolved policy debate.'
  ]},
  {id:'ambiguous-launch-analysis',label:'uncertain',status:'uncertain',eligibility:'candidate',choices:{promotion:'uncertain'},title:'A new system promises to measure audience fear',paragraphs:[
    'A company says its new audience measurement system can help studios understand how viewers react to horror films. The article describes the proposal and quotes the founder about possible uses. It also asks how physical responses relate to enjoyment, but provides little detail about the measurements or the validation data.',
    'The author suggests that the system could affect film distribution and points out that audience preferences differ. No independent researchers are interviewed and the public evidence is limited. There is some discussion beyond the launch itself, but the supplied body does not settle whether this is substantive analysis or mostly a promotional announcement. The appropriate policy response remains uncertain pending review.'
  ]},
  {id:'positive-defect-without-evidence',label:'uncertain',status:'uncertain',eligibility:'withheld',choices:{promotion:'yes'},title:'An unsupported promotional allegation',paragraphs:[
    'A local reporter describes a business opening and interviews residents about changes to the street. The story includes the business name but gives no purchase instructions or offers. Some residents welcome the jobs, while others discuss noise and parking. The account explains the approval process and the questions still before the council.',
    'The model recipe for this test alleges a promotional defect without selecting any supporting paragraph. The validator must not convert that unsupported allegation into a permanent rejection or an approval. This is a deliberately mocked evidence failure that tests withholding behavior; it is not a claim about the model response to the prose or a human judgment about an actual publisher article.'
  ]},
  {id:'source-failure',label:'source_failure',status:'error',error:'source_unavailable',title:'Source could not be fetched',paragraphs:[]},
  {id:'extraction-failure',label:'extraction_failure',status:'unavailable',title:'Extracted body too short',paragraphs:['Navigation only.']},
];
export function articleFor(fixture){return {title:fixture.title,paragraphs:fixture.paragraphs,links:[],checks:{originalCompleteness:'unknown'}};}
export function mockResponse(article,{questions,MODEL},changes={}) {
  const answers={};
  for(const [key,spec] of Object.entries(questions(article))){
    const keys=Object.keys(spec.criteria),selected=changes[key] || (['promotion','readability','mismatch'].includes(key)?'no':key==='evidence'?'none':keys[0]);
    answers[key]={type:'choice',choice:selected,confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k===selected?1:0]))};
  }
  return {model:MODEL,answers};
}

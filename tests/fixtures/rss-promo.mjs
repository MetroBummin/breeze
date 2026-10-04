const pitch='Use the code SAVE20 at checkout and save 20% on your order. These verified promo codes expire today. Shop now for the limited time deal.';
export const rssPromoFixtures=[
 {name:'thin verified coupon-code pitch',title:'Acme promo codes for October',summary:pitch,reject:true},
 {name:'thin urgent percentage-off pitch',title:'40% off today: limited time deal',summary:'Enter code DEAL40 at checkout for 40% off your order. Claim this deal and shop now.',reject:true},
 {name:'HTML coupon pitch',title:'Acme coupon codes',contentHtml:`<p>${pitch}</p><a href="https://shop.test">Shop now</a>`,reject:true},
 {name:'substantive product review',title:'Acme review with a discount code',summary:pitch,reject:false},
 {name:'buying guide',title:'Acme promo codes: buying guide for refurbished gear',summary:pitch,reject:false},
 {name:'business reporting',title:'Retailers announce new coupon codes',summary:pitch,reject:false},
 {name:'coupon discussion',title:'Why coupon codes change how we shop',summary:pitch,reject:false},
 {name:'discount mentioned in ordinary article',title:'A new camera for travel photographers',summary:pitch,reject:false},
 {name:'uncertain coupon headline',title:'Acme promo codes',summary:'The current offers are available on the website.',reject:false},
 {name:'discount and checkout without boilerplate',title:'Acme coupon codes',summary:'Use code SAVE20 at checkout to save 20%.',reject:false},
 {name:'editorial body behind promo headline',title:'Acme promo codes',summary:pitch+' We tested the products and compare their battery performance.',reject:false},
 {name:'developed body remains uncertain',title:'Acme coupon codes',contentHtml:`<p>${pitch.repeat(12)}</p>`,reject:false},
];

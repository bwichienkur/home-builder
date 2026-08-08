export type CatalogItem={id:string;name:string;brand?:string;model?:string;category:string;dims:[number,number,number];color:string;price?:number;emoji:string;sourceUrl?:string;sourceLabel?:string;note?:string};

export const catalog:CatalogItem[]=[
 {id:'nord-chair',name:'Nord Dining Chair',category:'Seating',dims:[.52,.56,.82],color:'#b26c45',price:129,emoji:'🪑'},
 {id:'linen-sofa',name:'Linen Modular Sofa',category:'Seating',dims:[2.2,.88,.78],color:'#b8b1a3',price:1299,emoji:'🛋️'},
 {id:'oak-table',name:'Solid Oak Table',category:'Tables',dims:[1.8,.9,.76],color:'#9a7048',price:699,emoji:'▰'},
 {id:'side-table',name:'Pebble Side Table',category:'Tables',dims:[.48,.48,.5],color:'#6e746e',price:189,emoji:'●'},
 {id:'bookcase',name:'Arch Bookcase',category:'Storage',dims:[1.1,.34,2],color:'#7e5f45',price:549,emoji:'▥'},
 {id:'queen-bed',name:'Cloud Platform Bed',category:'Bedroom',dims:[1.7,2.1,.55],color:'#d2c5b4',price:899,emoji:'▭'},
 {id:'floor-lamp',name:'Arc Floor Lamp',category:'Lighting',dims:[.45,.45,1.75],color:'#333a36',price:219,emoji:'◉'},
 {id:'plant',name:'Olive Tree',category:'Decor',dims:[.65,.65,1.65],color:'#65765d',price:89,emoji:'♧'},
 // Brands publicly shown in Olsen projects. MSRP is a manufacturer reference,
 // never an Olsen installed-price quote.
 {id:'subzero-cl3650u-panel-ready',name:'36” Classic Over-and-Under Refrigerator',brand:'Sub-Zero',model:'CL3650U/O',category:'Appliances',dims:[.9144,.6096,2.1336],color:'#d8d9d7',price:12575,emoji:'▣',sourceUrl:'https://www.subzero-wolf.com/products/36-classic-over-and-under-refrigerator-freezer-panel-ready-5310972-2748e1850fe070a9bdc4d6ef599ec165/5310972-2748e1850fe070a9bdc4d6ef599ec165',sourceLabel:'Official Sub-Zero page',note:'Panel ready · 36” W × 24” D × 84” H'},
 {id:'wolf-gr366',name:'36” Gas Range — 6 Burners',brand:'Wolf',model:'GR366',category:'Appliances',dims:[.9112,.7207,.9398],color:'#aeb2b3',price:8955,emoji:'▤',sourceUrl:'https://www.subzero-wolf.com/products/36-gas-range-6-burners-5610212-00a3f3e6a569206f40d97c0fbf15aa2d/5610212-00a3f3e6a569206f40d97c0fbf15aa2d',sourceLabel:'Official Wolf page',note:'35⅞” W × 28⅜” D × 37” H'},
 {id:'uline-hbv524',name:'24” Beverage Center',brand:'U-Line',model:'HBV524',category:'Appliances',dims:[.6001,.5953,.8557],color:'#252827',price:5289,emoji:'▥',sourceUrl:'https://www.u-line.com/hbv524.html',sourceLabel:'Official U-Line page',note:'5.1 cu. ft. · 23⅝” W × 23⁷⁄₁₆” D × 33¹¹⁄₁₆” H'},
 {id:'schrock-steam-base-module',name:'Steam Maple Base Cabinet Module',brand:'Schrock Cabinetry',model:'Steam on Maple',category:'Cabinetry',dims:[.9144,.6096,.8763],color:'#eeeae0',emoji:'▦',sourceUrl:'https://www.schrock.com/products/finishes/steam/maple',sourceLabel:'Official Schrock finish',note:'Representative 36” base module · final design and price required'},
 {id:'pompeii-coastal-island',name:'Coastal Quartz Island Surface',brand:'Pompeii Quartz',model:'Coastal',category:'Surfaces',dims:[3.302,1.016,.03],color:'#c7cdd0',emoji:'▰',sourceUrl:'https://pompeiiquartz.com/product/coastal/',sourceLabel:'Official Pompeii page',note:'Representative island cut from a 2 cm or 3 cm slab'},
 {id:'woodtone-fineline-smokey-bourbon',name:'FineLine Panel — Smokey Bourbon',brand:'Woodtone',model:'FineLine 1×6',category:'Paneling',dims:[1.2192,.0175,2.4384],color:'#705344',emoji:'▥',sourceUrl:'https://woodtone.com/product/wall-ceiling/fineline-paneling/',sourceLabel:'Official Woodtone page',note:'Representative 4′ × 8′ panel assembled from FineLine boards'}
];

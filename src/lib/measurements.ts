import type { UnitSystem } from '../types';

const roundEighth=(value:number)=>Math.round(value*8)/8;

export function formatLength(meters:number,unit:UnitSystem,metricDigits=2){
 if(unit==='metric')return `${meters.toFixed(metricDigits)} m`;
 let totalInches=roundEighth(meters/0.0254),feet=Math.floor(totalInches/12),inches=totalInches-feet*12;
 if(inches>=12){feet+=1;inches=0}
 const whole=Math.floor(inches),fraction=Math.round((inches-whole)*8),fractions=['','1/8','1/4','3/8','1/2','5/8','3/4','7/8'];
 return `${feet}' ${whole}${fraction?` ${fractions[fraction]}`:''}"`;
}

export function formatArea(squareMeters:number,unit:UnitSystem){
 if(unit==='metric')return `${squareMeters.toFixed(1)} m²`;
 return `${(squareMeters*10.7639).toFixed(0)} ft²`;
}

export function parseLength(value:string,unit:UnitSystem){
 const input=value.trim().toLowerCase();
 if(!input)return null;
 if(unit==='metric'&&!/[\'\"]/.test(input)){const meters=Number(input.replace(/m|,/g,''));return Number.isFinite(meters)&&meters>0?meters:null}
 const feetMatch=input.match(/(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet)/),feet=feetMatch?Number(feetMatch[1]):0;
 const afterFeet=feetMatch?input.slice((feetMatch.index??0)+feetMatch[0].length):input;
 const mixed=afterFeet.match(/(\d+)?\s*(\d+)\s*\/\s*(\d+)/),decimal=afterFeet.match(/\d+(?:\.\d+)?/);
 let inches=0;
 if(mixed)inches=Number(mixed[1]??0)+Number(mixed[2])/Number(mixed[3]);
 else if(decimal)inches=Number(decimal[0]);
 const meters=(feet*12+inches)*0.0254;
 return Number.isFinite(meters)&&meters>0?meters:null;
}

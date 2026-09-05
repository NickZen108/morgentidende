import test from 'node:test';
import assert from 'node:assert/strict';
import {imageFingerprints,similarFingerprints} from '../src/v3/image-fingerprint.ts';
function pixels(size:number,brightness=0){
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,v=Math.round(110+50*Math.sin(x/size*18)+35*Math.cos(y/size*13)+brightness);
  data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;
 }
 return {width:size,height:size,data};
}
test('resized and brightness-adjusted versions share a visual identity',()=>{
 assert.ok(similarFingerprints(imageFingerprints(pixels(128)),imageFingerprints(pixels(256,15))));
});
test('modest crop is recognised as the same family',()=>{
 const original=pixels(200),data=new Uint8Array(160*160*4);
 for(let y=0;y<160;y++)data.set(original.data.slice(((y+20)*200+20)*4,((y+20)*200+180)*4),y*160*4);
 assert.ok(similarFingerprints(imageFingerprints(original),imageFingerprints({width:160,height:160,data})));
});
test('uninformative images fail closed',()=>assert.throws(()=>imageFingerprints({width:64,height:64,data:new Uint8Array(64*64*4)}),/ambiguous/));
test('different fingerprints do not match',()=>assert.equal(similarFingerprints(['0'.repeat(64)],['1'.repeat(64)]),false));

import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import {imageFingerprints,similarFingerprints} from '../src/v3/image-fingerprint';
test('JPEG recompression preserves visual identity despite different bytes',()=>{
 const width=160,height=120,data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;data[i]=110+60*Math.sin(x/9);data[i+1]=120+60*Math.cos(y/7);data[i+2]=80+(x+y)%100;data[i+3]=255;
 }
 const high=jpeg.encode({width,height,data},90).data,low=jpeg.encode({width,height,data},35).data;
 assert.notDeepEqual(high,low);
 assert.ok(similarFingerprints(imageFingerprints(jpeg.decode(high,{useTArray:true})),imageFingerprints(jpeg.decode(low,{useTArray:true}))));
});

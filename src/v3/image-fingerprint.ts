export interface Pixels {width:number;height:number;data:Uint8Array}
/** Area averages remove resolution/compression noise. Multiple windows include modest crops. */
export function imageFingerprints(image:Pixels):string[]{
 const {width,height,data}=image;
 if(width<32||height<32||data.length!==width*height*4)throw new Error('image_pixels_invalid');
 const hashes:string[]=[];
 for(const scale of [1,0.9,0.8])for(const anchor of scale===1?[0.5]:[0,0.5,1]){
  const w=Math.floor(width*scale),h=Math.floor(height*scale);
  const left=Math.floor((width-w)*anchor),top=Math.floor((height-h)*anchor);
  const values:number[]=[];
  for(let y=0;y<8;y++)for(let x=0;x<9;x++){
   const x0=left+Math.floor(x*w/9),x1=left+Math.floor((x+1)*w/9);
   const y0=top+Math.floor(y*h/8),y1=top+Math.floor((y+1)*h/8);
   let sum=0,count=0;
   for(let py=y0;py<y1;py++)for(let px=x0;px<x1;px++){
    const i=(py*width+px)*4;sum+=data[i]*0.299+data[i+1]*0.587+data[i+2]*0.114;count++;
   }
   values.push(sum/count);
  }
  // Low-information images are not safe to identify automatically.
  if(Math.max(...values)-Math.min(...values)<12)continue;
  let hash='';for(let y=0;y<8;y++)for(let x=0;x<8;x++)hash+=values[y*9+x]>values[y*9+x+1]?'1':'0';
  hashes.push(hash);
 }
 if(!hashes.length)throw new Error('image_identity_ambiguous');
 return [...new Set(hashes)];
}
export function similarFingerprints(a:string[],b:string[]){
 return a.some(left=>b.some(right=>left.length===64&&right.length===64&&[...left].filter((bit,i)=>bit!==right[i]).length<=8));
}

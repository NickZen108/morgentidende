import test from 'node:test';
import assert from 'node:assert/strict';

// Guard the production fix structurally: vision image input must be data:, never a remote URL.
test('media vision uses data URI input',async()=>{
 const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../src/v3/media.ts',import.meta.url),'utf8'));
 assert.match(source,/image_url:\{url:dataUri\}/);
 assert.match(source,/data:\$\{mime\};base64,/);
 assert.doesNotMatch(source,/image_url:\{url\}\}/);
 assert.match(source,/visionBytes\(env,imageBytes,'image\/jpeg',article\)/);
});

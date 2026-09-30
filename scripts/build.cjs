// Publish only the five game files; never expose local configuration or logs.
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const files=['index.html','firebase-config.js','rankings-core.js','rankings.js','rankings.css'];
const output=path.join(root,'dist');
fs.mkdirSync(output,{recursive:true});
const unexpected=fs.readdirSync(output).filter(name=>!files.includes(name));
if(unexpected.length)throw new Error('Unexpected files in dist; refusing to publish: '+unexpected.join(', '));
for(const name of files)fs.copyFileSync(path.join(root,name),path.join(output,name));
console.log('Prepared five game files for Hosting.');

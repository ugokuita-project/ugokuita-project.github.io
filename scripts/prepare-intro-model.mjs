// Source-node indices are pinned to the upstream revision in assets/models/README.md.
import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Group,Mesh,Box3,Vector3} from 'three';
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(x=>{this.result=x;this.onloadend?.();});}};
const src=fs.readFileSync(process.argv[2]);
const gltf=await new GLTFLoader().parseAsync(src.buffer.slice(src.byteOffset,src.byteOffset+src.byteLength),'');
gltf.scene.updateMatrixWorld(true);
const wheels=[{name:'wheel-front-left',ids:[57],center:[.164,.074,-.1595],radius:.079},{name:'wheel-front-right',ids:[80,81],center:[.164,.074,.1595],radius:.079},{name:'wheel-rear-right',ids:[5002,5003],center:[-.187,.114,.1885],radius:.114},{name:'wheel-rear-left',ids:[5011,5012],center:[-.187,.114,-.1885],radius:.114}];
const partitions=[{name:'body',center:[0,0,0],ids:[]},...wheels].map(x=>({...x,materials:new Map()}));
gltf.scene.traverse(n=>{if(!n.isMesh)return; const idx=gltf.parser.associations.get(n)?.nodes; const part=partitions.find(p=>p.ids.includes(idx))||partitions[0]; let geometry=n.geometry.clone().applyMatrix4(n.matrixWorld); if(geometry.index)geometry=geometry.toNonIndexed(); for(const k of Object.keys(geometry.attributes)) if(!['position','normal'].includes(k))geometry.deleteAttribute(k); geometry.translate(...part.center.map(v=>-v)); const key=n.material.uuid; if(!part.materials.has(key))part.materials.set(key,{material:n.material,geometries:[]});part.materials.get(key).geometries.push(geometry);});
const root=new Group();
for(const p of partitions){const group=new Group();group.name=p.name;group.position.fromArray(p.center);group.userData.radius=p.radius;for(const {material,geometries}of p.materials.values())group.add(new Mesh(mergeGeometries(geometries),material));root.add(group);}
const buffer=await new GLTFExporter().parseAsync(root,{binary:true});fs.writeFileSync(process.argv[3],Buffer.from(buffer));console.log('prepared',buffer.byteLength,'bytes',root.children.map(n=>[n.name,n.children.length]));

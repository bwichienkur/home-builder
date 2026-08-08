import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
export function createCatalogLoader(renderer:any){const loader=new GLTFLoader();const draco=new DRACOLoader().setDecoderPath('/draco/');const ktx2=new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);loader.setDRACOLoader(draco);loader.setKTX2Loader(ktx2);return loader}

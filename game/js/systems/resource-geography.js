// Deterministic, compact per-tile resource geography.
// Durable state is limited to sparse changes from the seed-generated baseline.
import { state } from "../core/state.js";
import { WORLD_W,WORLD_H,BIOME } from "../core/config.js";

const VERSION=1;

function worldW(){return Number(state.worldW)||WORLD_W;}
function worldH(){return Number(state.worldH)||WORLD_H;}
function cellCount(){return worldW()*worldH();}

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function hash32(seed,index,salt){
    let value=(Number(seed)>>>0)^Math.imul(index+1,0x9e3779b1)^salt;
    value=Math.imul(value^(value>>>16),0x7feb352d);
    value=Math.imul(value^(value>>>15),0x846ca68b);
    return (value^(value>>>16))>>>0;
}
function unitHash(seed,index,salt){return hash32(seed,index,salt)/0x100000000;}
function tileIndex(x,y){return y*worldW()+x;}
function readTile(x,y){
    const tx=Math.floor(Number(x)),ty=Math.floor(Number(y));
    if(!Number.isInteger(tx)||!Number.isInteger(ty)||tx<0||ty<0||tx>=worldW()||ty>=worldH())return null;
    return {x:tx,y:ty,index:tileIndex(tx,ty)};
}
function ensureGeography(){
    const geo=state.resourceGeography;
    if(!geo||geo.version!==VERSION||!(geo.forestStock instanceof Uint16Array)||geo.forestStock.length!==cellCount()){
        throw new Error("Resource geography has not been generated for this realm.");
    }
    return geo;
}

export function generateResourceGeography(seed=state.worldSeed){
    const resolution=Number(state.terrainResolution)||0;
    const width=Number(state.terrainPixW)||0;
    const height=Number(state.terrainPixH)||0;
    const heights=state.heightMap,moistures=state.moistureMap;
    if(!resolution||!width||!height||!heights||!moistures||heights.length!==width*height||moistures.length!==width*height){
        throw new Error("Terrain must be generated before resource geography.");
    }
    const worldSeed=Number.isSafeInteger(Number(seed))&&Number(seed)>0?Number(seed)>>>0:1;
    const count=cellCount();
    const forestCapacity=new Uint16Array(count);
    const forestStock=new Uint16Array(count);
    const stoneCapacity=new Uint16Array(count);
    const stoneStock=new Uint16Array(count);
    const fertility=new Uint8Array(count);
    const waterAccess=new Uint8Array(count);
    const forestShift=((state.worldOptions?.forests??52)-50)*0.0016;
    const forestLine=BIOME.FOREST-forestShift;
    const sea=Number(state.seaLevel)||BIOME.SHALLOW_WATER;
    const resourceBias=((state.worldOptions?.resources??50)-50)*0.004;
    const fertilityBias=((state.worldOptions?.fertility??55)-50)*0.003;
    const W=worldW(),H=worldH();
    for(let y=0;y<H;y++){
        for(let x=0;x<W;x++){
            const index=tileIndex(x,y);
            const px=clamp(Math.floor((x+0.5)*resolution),0,width-1);
            const py=clamp(Math.floor((y+0.5)*resolution),0,height-1);
            const mapIndex=py*width+px;
            const h=Number(heights[mapIndex])||0;
            const moisture=clamp(Number(moistures[mapIndex])||0,0,1);
            if(h<sea)waterAccess[index]=1;

            // Forest stands follow the same terrain threshold used by the renderer.
            if(h>=forestLine&&h<BIOME.ROCK){
                const density=clamp((h-forestLine)/Math.max(0.001,BIOME.ROCK-forestLine),0,1);
                const presence=0.42+density*0.34+moisture*0.18+resourceBias;
                if(unitHash(worldSeed,index,0x46525354)<presence){
                    const capacity=35+Math.floor(density*85+moisture*55+unitHash(worldSeed,index,0x46434150)*45);
                    forestCapacity[index]=capacity;
                    forestStock[index]=capacity;
                }
            }

            // Stone deposits are clustered in rocky highlands, not on every rock tile.
            if(h>=BIOME.ROCK&&h<BIOME.SNOW&&unitHash(worldSeed,index,0x53544f4e)<0.52+resourceBias){
                const elevation=clamp((h-BIOME.ROCK)/Math.max(0.001,BIOME.SNOW-BIOME.ROCK),0,1);
                const capacity=60+Math.floor(elevation*260+unitHash(worldSeed,index,0x53434150)*180);
                stoneCapacity[index]=capacity;
                stoneStock[index]=capacity;
            }

            // Fertility is a derived terrain property; it is not a consumable node.
            if(h>=BIOME.SAND&&h<=BIOME.DENSE_GRASS){
                fertility[index]=Math.round(clamp(0.18+moisture*0.72+(0.58-h)*0.28+fertilityBias,0,1)*100);
            }
        }
    }
    state.resourceGeography={version:VERSION,seed:worldSeed,forestCapacity,forestStock,stoneCapacity,stoneStock,fertility,waterAccess};
    return state.resourceGeography;
}

export function getResourceNodeAt(x,y){
    const point=readTile(x,y);
    if(!point)return null;
    const geo=ensureGeography(),i=point.index;
    return {
        x:point.x,y:point.y,
        forestStock:geo.forestStock[i],forestCapacity:geo.forestCapacity[i],
        stoneStock:geo.stoneStock[i],stoneCapacity:geo.stoneCapacity[i],
        waterAccess:Boolean(geo.waterAccess[i]),fertility:geo.fertility[i]
    };
}

export function findNearestResourceNode(type,x,y,radius=8){
    const origin=readTile(x,y);
    if(!origin)return null;
    const geo=ensureGeography();
    const limit=clamp(Math.floor(Number(radius)||0),0,Math.max(worldW(),worldH()));
    const minX=Math.max(0,origin.x-limit),maxX=Math.min(worldW()-1,origin.x+limit);
    const minY=Math.max(0,origin.y-limit),maxY=Math.min(worldH()-1,origin.y+limit);
    let best=null,bestDistance=Infinity;
    for(let ty=minY;ty<=maxY;ty++){
        for(let tx=minX;tx<=maxX;tx++){
            const i=tileIndex(tx,ty);
            const available=type==="forest"?geo.forestStock[i]:type==="stone"?geo.stoneStock[i]:type==="water"?geo.waterAccess[i]:0;
            if(!available)continue;
            const dx=tx-origin.x,dy=ty-origin.y,distance=dx*dx+dy*dy;
            if(distance>limit*limit||distance>=bestDistance)continue;
            bestDistance=distance;
            best={x:tx,y:ty,distance:Math.sqrt(distance),available};
        }
    }
    return best;
}

function extract(type,x,y,amount){
    const point=readTile(x,y);
    const requested=Math.floor(Number(amount));
    if(!point||!Number.isFinite(requested)||requested<1)return 0;
    const geo=ensureGeography();
    const stock=type==="forest"?geo.forestStock:geo.stoneStock;
    const taken=Math.min(stock[point.index],requested);
    stock[point.index]=Math.max(0,Math.floor(stock[point.index]-taken+1e-9));
    return taken;
}
export function harvestForest(x,y,amount){return extract("forest",x,y,amount);}
export function extractStone(x,y,amount){return extract("stone",x,y,amount);}

export function regrowForests(days=1){
    const elapsed=Number(days);
    if(!Number.isFinite(elapsed)||elapsed<=0)return 0;
    const geo=ensureGeography(),growth=Math.max(0,Math.floor(elapsed/25));
    if(!growth)return 0;
    let restored=0;
    const count=cellCount();
    for(let i=0;i<count;i++){
        const missing=geo.forestCapacity[i]-geo.forestStock[i];
        if(missing<=0)continue;
        const amount=Math.min(missing,growth);
        geo.forestStock[i]+=amount;
        restored+=amount;
    }
    return restored;
}

export function serializeResourceGeography(){
    const geo=ensureGeography();
    const forest=[],stone=[];
    const count=cellCount();
    for(let i=0;i<count;i++){
        if(geo.forestStock[i]!==geo.forestCapacity[i])forest.push([i,geo.forestStock[i]]);
        if(geo.stoneStock[i]!==geo.stoneCapacity[i])stone.push([i,geo.stoneStock[i]]);
    }
    return {version:VERSION,forest,stone};
}

export function validateResourceGeographySnapshot(snapshot){
    if(snapshot===undefined||snapshot===null)return true;
    if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot)||snapshot.version!==VERSION)throw new Error("Save data contains an unsupported resource geography version.");
    const count=cellCount();
    for(const key of ["forest","stone"]){
        const entries=snapshot[key];
        if(!Array.isArray(entries)||entries.length>count)throw new Error("Save data contains an invalid "+key+" resource delta.");
        const seen=new Set();
        for(const entry of entries){
            if(!Array.isArray(entry)||entry.length!==2||!Number.isInteger(entry[0])||entry[0]<0||entry[0]>=count||!Number.isInteger(entry[1])||entry[1]<0||entry[1]>65535||seen.has(entry[0])){
                throw new Error("Save data contains an invalid "+key+" resource entry.");
            }
            seen.add(entry[0]);
        }
    }
    return true;
}

export function restoreResourceGeography(snapshot){
    const geo=ensureGeography();
    validateResourceGeographySnapshot(snapshot);
    if(!snapshot)return 0;
    let restored=0;
    for(const [index,stock] of snapshot.forest){
        if(stock>geo.forestCapacity[index])continue;
        geo.forestStock[index]=stock;restored++;
    }
    for(const [index,stock] of snapshot.stone){
        if(stock>geo.stoneCapacity[index])continue;
        geo.stoneStock[index]=stock;restored++;
    }
    return restored;
}

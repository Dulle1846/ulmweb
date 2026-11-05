// Spatially indexed combat: local target selection avoids all-pairs scans.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { recordNaturalDeath } from "../systems/mortality.js";
import { queueParticle,queueFloater,queueMessage } from "../core/presentation-effects.js";
import { rand as seededRand } from "../core/random.js";
const rand=(min,max)=>seededRand(min,max,"combat");

const CELL=8;
const TILE_SIZE=48;
function key(x,y){return Math.floor(x/CELL)+":"+Math.floor(y/CELL);}
function indexEntities(entities){
 const buckets=new Map();
 for(const entity of entities){
  const k=key(entity.x,entity.y);
  if(!buckets.has(k))buckets.set(k,[]);
  buckets.get(k).push(entity);
 }
 return buckets;
}
function nearestFromBuckets(x,y,buckets,radius,accept=()=>true){
 const minX=Math.floor((x-radius)/CELL),maxX=Math.floor((x+radius)/CELL);
 const minY=Math.floor((y-radius)/CELL),maxY=Math.floor((y+radius)/CELL);
 let nearest=null,best=radius*radius;
 for(let bx=minX;bx<=maxX;bx++)for(let by=minY;by<=maxY;by++){
  const local=buckets.get(bx+":"+by)||[];
  for(const candidate of local){
   if(candidate.dead||!accept(candidate))continue;
   const dx=candidate.x-x,dy=candidate.y-y,d=dx*dx+dy*dy;
   if(d<best){best=d;nearest=candidate;}
  }
 }
 return nearest;
}
export function updateCombat(){
 const enemies=state.entities.filter(e=>!e.dead&&e.isEnemy());
 if(!enemies.length)return;
 const defenders=state.entities.filter(e=>!e.dead&&[TYPE.GUARD,TYPE.KNIGHT,TYPE.ARCHER,TYPE.TOWER].includes(e.type));
 const enemyBuckets=indexEntities(enemies),defenderBuckets=indexEntities(defenders);
 const keep=state.entities.find(e=>!e.dead&&e.type===TYPE.KEEP)||null;
 const tick=state.tick;
 for(const enemy of enemies){
  if(enemy.dead)continue;
  const nearby=nearestFromBuckets(enemy.x,enemy.y,defenderBuckets,32);
  const target=nearby||keep;
  if(!target)continue;
  const dx=target.x-enemy.x,dy=target.y-enemy.y,dist=Math.hypot(dx,dy);
  if(dist>1.8){enemy.x+=Math.sign(dx)*0.065;enemy.y+=Math.sign(dy)*0.065;}
  else if(tick%13===0){
   target.hp-=enemy.type===TYPE.TROLL?32:13;
   queueParticle(target.x*TILE_SIZE+rand(-10,10),target.y*TILE_SIZE-10,"#f43f5e",18,rand(-3,3),rand(-4,-1));
   if(target.hp<=0){
    if(target.isKing)recordNaturalDeath(target,"battle");
    else target.dead=true;
    if(target.type===TYPE.KEEP){state.gameOver=true;queueMessage("THE REALM FELL","THE KEEP WAS DESTROYED",5000);}
   }
  }
  if(Math.random()<0.02){enemy.hp-=22;if(enemy.hp<=0)enemy.dead=true;}
 }
 for(const defender of defenders){
  if(defender.dead)continue;
  const enemy=nearestFromBuckets(defender.x,defender.y,enemyBuckets,7);
  if(!enemy)continue;
  if(tick%(defender.type===TYPE.ARCHER?22:14)!==0)continue;
  enemy.hp-=defender.type===TYPE.KNIGHT?34:18;
  queueParticle(enemy.x*TILE_SIZE+12,enemy.y*TILE_SIZE-18,"#fde047",22,rand(-1,4),-3);
  if(enemy.hp<=0){enemy.dead=true;queueFloater(enemy.x*TILE_SIZE,enemy.y*TILE_SIZE,"SLAIN","#eab308");}
 }
}

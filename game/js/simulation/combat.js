// Spatially indexed combat: local target selection avoids all-pairs scans.
import { TYPE } from "../core/types.js";
import { state } from "../core/state.js";
import { queueParticle,queueFloater,queueMessage } from "../core/presentation-effects.js";
import { rand as seededRand } from "../core/random.js";
import { getRaidDamageMultiplier } from "../systems/rooms.js";
import { getCourtModifiers } from "../systems/court.js";
import { getSoldierPower,getSoldierArmor,recordMilitaryVictory,recordMilitaryWound,recordMilitaryCasualty } from "../systems/military.js";
import { getJungleTacticsAt } from "../systems/resource-geography.js";
const rand=(min,max)=>seededRand(min,max,"combat");

const CELL=8;
const TILE_SIZE=48;
// A guard or knight must close to melee range, like the raiders do. Only
// archers and towers may strike across the seven-tile local search radius.
// Treating every defender as ranged let a levy volley kill raiders before
// cover, retaliation or the local bonus could ever matter in a real raid.
const DEFENDER_REACH=Object.freeze({
 [TYPE.GUARD]:1.8,
 [TYPE.KNIGHT]:2.2,
 [TYPE.ARCHER]:7,
 [TYPE.TOWER]:7,
});
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
 const raidDamageMultiplier=getRaidDamageMultiplier();
 const readiness=Math.max(1,Math.min(1.25,Number(getCourtModifiers().militaryReadiness)||1));
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
  const jungle=getJungleTacticsAt(enemy.x,enemy.y);
  const jungleSpeed=jungle?Math.max(.42,1/(Number(jungle.movementFactor)||1)):1;
  if(dist>1.8){enemy.x+=Math.sign(dx)*0.065*jungleSpeed;enemy.y+=Math.sign(dy)*0.065*jungleSpeed;}
  // Dense jungle turns an approach into an ambush lane. The roll uses the
  // existing seeded combat stream, so the same realm still replays identically.
  if(jungle&&tick%23===0&&rand(0,1)<Math.min(.42,Number(jungle.ambushChance)||0)){
   const hit=Math.max(1,Math.round(5+Number(jungle.guerrillaBonus||0)*12));
   enemy.hp-=hit;
   queueFloater(enemy.x*TILE_SIZE,enemy.y*TILE_SIZE,"AMBUSH","#a3e635");
   if(enemy.hp<=0)enemy.dead=true;
  }
  if(jungle&&tick%37===0&&Number(jungle.supplyFactor||1)<.72){
   enemy.hp-=1;
   // Supply attrition is a visible battlefield event, not a silent stat.
   queueFloater(enemy.x*TILE_SIZE,enemy.y*TILE_SIZE-12,"SUPPLY","#fbbf24");
   if(enemy.hp<=0)enemy.dead=true;
  }
  if(enemy.dead)continue;
  if(dist<=1.8&&tick%13===0){
   const baseDamage=enemy.type===TYPE.TROLL?32:13;
   const armor=getSoldierArmor(target);
   // A defender standing in the jungle gets real cover. Local levies know the
   // trails and use the ambush lanes; a foreign raider does not.
   const cover=getJungleTacticsAt(target.x,target.y);
   const localDefender=Boolean(target.military&&target.military.origin==="levy");
   const coverMultiplier=cover?1-Math.min(.32,(Number(cover.defenceBonus)||0)*.35+(localDefender?(Number(cover.localAdvantage)||0)*.08:0)):1;
   target.hp-=Math.max(1,Math.round(baseDamage*raidDamageMultiplier/readiness*(1-armor)*coverMultiplier));
   queueParticle(target.x*TILE_SIZE+rand(-10,10),target.y*TILE_SIZE-10,"#f43f5e",18,rand(-3,3),rand(-4,-1));
   if(target.hp<=0){
    if(!target.isKing&&!target.isBuilding?.())recordMilitaryCasualty(target,"raid");
    target.dead=true;
    if(target.type===TYPE.KEEP){state.gameOver=true;queueMessage("THE REALM FELL","THE KEEP WAS DESTROYED",5000);}
   }else if(!target.isKing&&getSoldierPower(target)>0&&target.hp/target.maxHp<0.55&&rand(0,1)<0.22){
    recordMilitaryWound(target);
   }
  }
  // A raid crossing prepared ground can trigger a trap. It used to remove
  // health without any battlefield feedback; keep the existing damage but
  // make the cause visible next to the raider.
  if(rand(0,1)<0.02){
   enemy.hp-=22;
   queueFloater(enemy.x*TILE_SIZE,enemy.y*TILE_SIZE-8,"TRAP","#fb923c");
   if(enemy.hp<=0)enemy.dead=true;
  }
 }
 for(const defender of defenders){
  if(defender.dead)continue;
  const reach=DEFENDER_REACH[defender.type]||1.8;
  const enemy=nearestFromBuckets(defender.x,defender.y,enemyBuckets,reach);
  if(!enemy)continue;
  if(tick%(defender.type===TYPE.ARCHER?22:14)!==0)continue;
  const namedPower=getSoldierPower(defender);
  const basePower=namedPower>0?namedPower:(defender.type===TYPE.KNIGHT?34:18);
  const jungleDefence=getJungleTacticsAt(defender.x,defender.y);
  const local=Boolean(defender.military&&defender.military.origin==="levy");
  const junglePower=jungleDefence?1+Math.min(.38,(Number(jungleDefence.guerrillaBonus)||0)*.3
      +(local?(Number(jungleDefence.localAdvantage)||0)*.12:0)):1;
  enemy.hp-=Math.max(1,Math.round(basePower*readiness*junglePower));
  queueParticle(enemy.x*TILE_SIZE+12,enemy.y*TILE_SIZE-18,"#fde047",22,rand(-1,4),-3);
  if(enemy.hp<=0){enemy.dead=true;if(namedPower>0)recordMilitaryVictory(defender);queueFloater(enemy.x*TILE_SIZE,enemy.y*TILE_SIZE,"SLAIN","#eab308");}
 }
}

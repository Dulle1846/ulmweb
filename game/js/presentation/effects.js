// Maps declarative domain effects to the active browser presentation implementation.

import { drainPresentationEffects } from '../core/presentation-effects.js';
import { createParticle, createFloater } from './rendering/particles.js';
import { showBigMessage } from './rendering/ui.js';

export function flushPresentationEffects() {
    const effects = drainPresentationEffects();

    for (const effect of effects) {
        switch (effect.type) {
            case "particle":
                createParticle(
                    effect.x, effect.y, effect.color, effect.life,
                    effect.vx, effect.vy, effect.size
                );
                break;
            case "floater":
                createFloater(effect.x, effect.y, effect.text, effect.color);
                break;
            case "message":
                showBigMessage(effect.title, effect.subtitle, effect.timeout);
                break;
            default:
                throw new Error(`Unknown presentation effect: ${effect.type}`);
        }
    }
}

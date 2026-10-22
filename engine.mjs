/**
 * Medieval battle engine. Owns deployment, living-unit counts, targeting, projectile damage, and victory state.
 */
// Balance values use battlefield pixels for distance and seconds for timing.
export const TYPES = {
    sword: {
        name: "Swordsmen",
        hp: 100,
        speed: 26,
        damage: 18,
        range: 15,
        cooldown: 0.85,
    },
    cavalry: {
        name: "Cavalry",
        hp: 85,
        speed: 55,
        damage: 10,
        range: 18,
        cooldown: 0.85,
    },
    bow: {
        name: "Bowmen",
        hp: 60,
        speed: 22,
        damage: 12,
        range: 175,
        cooldown: 1.5,
    },
};
// The engine owns combat state; regiment records retain deployment positions for reset.
export class Battle {
    /**
     * Initialize an empty battle.
     *
     * Inputs: None; uses enclosing state where needed.
     * @returns New Battle instance.
     */
    constructor() {
        this.clear();
    }
    /**
     * Clear armies, projectiles, timing, and victory state.
     *
     * Inputs: None; uses enclosing state where needed.
     * @returns No value is returned; updates the current state, scene, or interface.
     */
    clear() {
        this.regiments = [];
        this.units = [];
        this.arrows = [];
        this.time = 0;
        this.running = false;
        this.finished = false;
        this.nextId = 1;
        this.targetTimer = 0;
        this.winner = null;
    }
    // Keep fallen soldiers for casualty history, but only living soldiers consume capacity.
    // New soldiers form a square grid; randomized cooldowns stagger their first attacks.
    /**
     * Deploy a regiment while enforcing the living-soldier capacity.
     *
     * @param faction - Zero-based faction index.
     * @param type - Unit type key: sword, cavalry, or bow.
     * @param count - Number of soldiers in the regiment.
     * @param x - Deployment center in battlefield pixels.
     * @param y - Deployment center in battlefield pixels.
     * @returns True if deployed; false for an unknown type or exceeded capacity.
     */
    add(faction, type, count, x, y) {
        if (
            !TYPES[type] ||
            this.units.filter((u) => u.hp > 0).length + count > 1200
        )
            return false;
        const id = this.nextId++;
        this.regiments.push({ id, faction, type, count, x, y });
        const cols = Math.ceil(Math.sqrt(count));
        for (let i = 0; i < count; i++) {
            const s = TYPES[type];
            this.units.push({
                id: this.units.length,
                faction,
                type,
                regiment: id,
                x: Math.max(
                    12,
                    Math.min(1188, x + ((i % cols) - (cols - 1) / 2) * 10),
                ),
                y: Math.max(
                    12,
                    Math.min(
                        788,
                        y +
                            (Math.floor(i / cols) -
                                (Math.ceil(count / cols) - 1) / 2) *
                                10,
                    ),
                ),
                hp: s.hp,
                cool: Math.random() * 0.6,
                target: null,
                angle: 0,
            });
        }
        this.refresh();
        return true;
    }
    // A regiment remains active while at least one of its soldiers survives.
    // Count casualties separately so live reinforcements do not erase battle history.
    /**
     * Calculate living soldiers, active regiments, and faction casualties.
     *
     * Inputs: None; uses enclosing state where needed.
     * @returns Battle totals and eight faction summaries containing deployed, alive, fallen, and regiment counts.
     */
    stats() {
        const alive = this.units.filter((u) => u.hp > 0);
        const active = new Set(alive.map((u) => u.regiment));
        return {
            soldiers: alive.length,
            regiments: active.size,
            factions: Array.from({ length: 8 }, (_, faction) => {
                const units = this.units.filter((u) => u.faction === faction),
                    survivors = alive.filter((u) => u.faction === faction);
                return {
                    deployed: units.length,
                    alive: survivors.length,
                    fallen: units.length - survivors.length,
                    regiments: new Set(survivors.map((u) => u.regiment)).size,
                };
            }),
        };
    }
    // Deployment edits force retargeting. Reinforcements can reopen a finished battle,
    // but resuming remains an explicit action when the simulation was paused or finished.
    /**
     * Invalidate targets and reopen combat when deployment edits restore opposing factions.
     *
     * Inputs: None; uses enclosing state where needed.
     * @returns No value is returned; updates the current state, scene, or interface.
     */
    refresh() {
        this.targetTimer = 0;
        if (
            new Set(this.units.filter((u) => u.hp > 0).map((u) => u.faction))
                .size > 1
        ) {
            this.finished = false;
            this.winner = null;
        }
    }
    // Erasing removes the regiment from the deployment too. Clear references to its
    // soldiers so surviving attackers and arrows cannot keep targeting erased units.
    /**
     * Erase a regiment and clear attacks targeting its soldiers.
     *
     * @param id - Regiment identifier to remove.
     * @returns No value is returned; updates the current state, scene, or interface.
     */
    remove(id) {
        this.regiments = this.regiments.filter((r) => r.id !== id);
        const removed = new Set(this.units.filter((u) => u.regiment === id));
        this.units = this.units.filter((u) => !removed.has(u));
        for (const u of this.units) if (removed.has(u.target)) u.target = null;
        this.arrows = this.arrows.filter((a) => !removed.has(a.target));
        this.refresh();
    }
    // Rebuild soldiers at full health from the current deployment, including reinforcements.
    /**
     * Restore the current deployment at full health and reset battle progress.
     *
     * Inputs: None; uses enclosing state where needed.
     * @returns No value is returned; updates the current state, scene, or interface.
     */
    reset() {
        const setup = this.regiments.map((r) => ({ ...r }));
        this.clear();
        for (const r of setup) this.add(r.faction, r.type, r.count, r.x, r.y);
    }
    // Require two living factions before starting or resuming combat.
    /**
     * Start or resume a battle with at least two living factions.
     *
     * Inputs: None; uses enclosing state where needed.
     * @returns True if combat starts; false if fewer than two factions survive.
     */
    start() {
        if (
            new Set(this.units.filter((u) => u.hp > 0).map((u) => u.faction))
                .size < 2
        )
            return false;
        this.finished = false;
        this.winner = null;
        this.running = true;
        return true;
    }
    // Recompute nearest enemies every quarter second rather than every simulation tick.
    // All other factions are hostile; squared distance avoids square roots during search.
    /**
     * Advance movement, attacks, projectiles, and victory detection by one simulation tick.
     *
     * @param dt - Elapsed simulation time in seconds, capped at 0.05.
     * @returns No value is returned; updates the current state, scene, or interface.
     */
    step(dt) {
        if (!this.running) return;
        dt = Math.min(dt, 0.05);
        this.time += dt;
        const alive = this.units.filter((u) => u.hp > 0);
        this.targetTimer -= dt;
        if (this.targetTimer <= 0) {
            this.targetTimer = 0.25;
            for (const u of alive) {
                let best = Infinity;
                u.target = null;
                for (const v of alive) {
                    if (v.faction === u.faction) continue;
                    const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2;
                    if (d < best) {
                        best = d;
                        u.target = v;
                    }
                }
            }
        }
        // Collect attacks before applying damage so opponents can strike on the same tick.
        // Bow attacks create projectiles and deal damage only when those projectiles arrive.
        const hits = [];
        for (const u of alive) {
            u.cool -= dt;
            const t = u.target;
            if (!t || t.hp <= 0) continue;
            const s = TYPES[u.type],
                dx = t.x - u.x,
                dy = t.y - u.y,
                d = Math.hypot(dx, dy);
            u.angle = Math.atan2(dy, dx);
            if (d > s.range) {
                const move = Math.min(s.speed * dt, d - s.range + 1);
                u.x += (dx / (d || 1)) * move;
                u.y += (dy / (d || 1)) * move;
            } else if (u.cool <= 0) {
                u.cool = s.cooldown;
                if (u.type === "bow")
                    this.arrows.push({
                        x: u.x,
                        y: u.y,
                        target: t,
                        damage: s.damage,
                    });
                else hits.push([t, s.damage]);
            }
        }
        // Arrows track their target as it moves; discard each arrow on impact.
        this.arrows = this.arrows.filter((a) => {
            const dx = a.target.x - a.x,
                dy = a.target.y - a.y,
                d = Math.hypot(dx, dy);
            if (d <= 340 * dt) {
                if (a.target.hp > 0) hits.push([a.target, a.damage]);
                return false;
            }
            a.x += (dx / d) * 340 * dt;
            a.y += (dy / d) * 340 * dt;
            return true;
        });
        for (const [u, damage] of hits) u.hp = Math.max(0, u.hp - damage);
        // Check victory after resolving damage, allowing a draw if every faction is lost.
        const factions = new Set(
            this.units.filter((u) => u.hp > 0).map((u) => u.faction),
        );
        if (factions.size <= 1) {
            this.running = false;
            this.finished = true;
            this.winner = factions.size ? [...factions][0] : null;
        }
    }
}

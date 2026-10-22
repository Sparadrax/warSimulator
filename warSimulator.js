/**
 * War Simulator browser interface. Connects regiment controls, saved deployments, battle reports, and canvas rendering to the engine.
 */
// Browser controls and rendering are separate from the battle engine.
import { Battle, TYPES } from "./engine.mjs?v=3";
const $ = (id) => document.getElementById(id),
    canvas = $("battlefield"),
    ctx = canvas.getContext("2d");
const colors = [
    "#72b7ff",
    "#ff7979",
    "#e3bd5e",
    "#b597f5",
    "#67d5a1",
    "#f499ca",
    "#f49c58",
    "#91dce2",
];
const names = [
    "Azure",
    "Crimson",
    "Gold",
    "Violet",
    "Emerald",
    "Rose",
    "Amber",
    "Ice",
];
let factions = 3,
    selected = 0,
    type = "sword",
    erase = false,
    hover = null,
    last = 0,
    accumulator = 0,
    reportTimer = 0;
const battle = new Battle();
/**
 * Show feedback in the battle report.
 *
 * @param s - Message text to display.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function message(s) {
    $("notice").textContent = s;
}
// Keep the faction selector and color swatches synchronized with the same selection.
/**
 * Synchronize faction options, color swatches, and the battle report.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function factionUI() {
    const select = $("faction");
    select.replaceChildren();
    $("faction-key").replaceChildren();
    for (let i = 0; i < factions; i++) {
        select.add(new Option(`${names[i]} faction`, i));
        const b = document.createElement("button");
        b.style.background = colors[i];
        b.title = `${names[i]} faction`;
        b.setAttribute("aria-label", b.title);
        b.setAttribute("aria-pressed", String(i === selected));
        b.onclick = () => {
            selected = i;
            factionUI();
        };
        $("faction-key").append(b);
    }
    select.value = selected;
    $("add-faction").disabled = factions >= 8;
    report();
}
// Read live totals from the engine; destroyed regiments are excluded from active counts.
/**
 * Render survivor counts, casualties, active regiments, time, and battle status.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function report() {
    const stats = battle.stats();
    $("total").textContent =
        `${stats.soldiers} living soldiers · ${stats.regiments} active regiments`;
    $("roster").replaceChildren();
    for (let i = 0; i < factions; i++) {
        const initial = stats.factions[i].deployed,
            n = stats.factions[i].alive;
        const row = document.createElement("div");
        row.className = "army-row";
        row.innerHTML = `<div class="army-title"><i style="background:${colors[i]}"></i>${names[i]}<strong>${n}</strong></div><div class="army-bar"><span style="background:${colors[i]};width:${initial ? (n / initial) * 100 : 0}%"></span></div><small>${initial - n} fallen · ${stats.factions[i].regiments} active regiments</small>`;
        $("roster").append(row);
    }
    $("clock").textContent =
        `${String(Math.floor(battle.time / 60)).padStart(2, "0")}:${String(Math.floor(battle.time % 60)).padStart(2, "0")}`;
    $("phase").textContent = battle.finished
        ? "Battle ended"
        : battle.running
          ? "Battle in progress"
          : battle.time
            ? "Paused"
            : "Deployment";
    $("start").textContent = battle.finished
        ? "Battle ended"
        : battle.running
          ? "Ⅱ Pause battle"
          : battle.time
            ? "▶ Resume battle"
            : "▶ Start battle";
    $("start").disabled = battle.finished;
    $("field-title").textContent = battle.running
        ? "Battle in progress"
        : battle.finished
          ? "Battle complete"
          : erase
            ? "Click a regiment to erase"
            : "Click the field to place a regiment";
    $("field-message").textContent = battle.finished
        ? battle.winner === null
            ? "Draw — no survivors"
            : `${names[battle.winner]} faction wins`
        : "";
}
// Persist deployment recipes only. Reloading restores armies, not combat progress.
/**
 * Save deployment recipes to optional browser local storage.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function persist() {
    try {
        localStorage.setItem(
            "war-simulator-setup",
            JSON.stringify({ factions, regiments: battle.regiments }),
        );
    } catch {}
}
// Editing works during deployment, running combat, and pauses. Erasing uses the
// surviving formation center because soldiers move away from their deployment position.
/**
 * Deploy or erase a regiment at a battlefield position during any battle phase.
 *
 * @param x - Horizontal position in battlefield pixels.
 * @param y - Vertical position in battlefield pixels.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function place(x, y) {
    if (erase) {
        let nearest = null,
            d = 65;
        for (const r of battle.regiments) {
            const soldiers = battle.units.filter(
                (u) => u.regiment === r.id && u.hp > 0,
            );
            if (!soldiers.length) continue;
            const cx =
                    soldiers.reduce((sum, u) => sum + u.x, 0) / soldiers.length,
                cy =
                    soldiers.reduce((sum, u) => sum + u.y, 0) / soldiers.length;
            const distance = Math.hypot(cx - x, cy - y);
            if (distance < d) {
                nearest = r;
                d = distance;
            }
        }
        if (nearest) {
            battle.remove(nearest.id);
            message("Regiment removed.");
        }
    } else if (
        battle.add(
            selected,
            type,
            +$("size").value,
            Math.max(50, Math.min(1150, x)),
            Math.max(50, Math.min(750, y)),
        )
    )
        message(`${TYPES[type].name} deployed for ${names[selected]}.`);
    else message("The battlefield supports up to 1,200 living soldiers.");
    persist();
    report();
}
/**
 * Replace the current battle with a three-faction example deployment.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function demo() {
    battle.clear();
    factions = Math.max(3, factions);
    for (let f = 0; f < 3; f++) {
        const angle = (f * Math.PI * 2) / 3 - Math.PI / 2;
        const x = 600 + Math.cos(angle) * 330,
            y = 400 + Math.sin(angle) * 260;
        battle.add(f, "sword", 36, x, y);
        battle.add(f, "bow", 24, x + 60, y + 45);
        battle.add(f, "cavalry", 18, x - 60, y + 45);
    }
    factionUI();
    persist();
    message("Three armies are ready. Add regiments or start the battle.");
}
/**
 * Pause running combat or attempt to start or resume the battle.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function toggle() {
    if (battle.finished) return;
    if (battle.running) battle.running = false;
    else if (!battle.start())
        message("Deploy soldiers for at least two factions before starting.");
    else message("Every faction attacks the closest enemy.");
    report();
}
$("faction").onchange = (e) => {
    selected = +e.target.value;
    factionUI();
};
$("add-faction").onclick = () => {
    if (factions < 8) {
        selected = factions++;
        factionUI();
        persist();
    }
};
$("unit-types").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    type = b.dataset.type;
    for (const button of $("unit-types").children)
        button.setAttribute("aria-pressed", String(button === b));
    const s = TYPES[type];
    $("unit-stats").textContent =
        `HP ${s.hp} · DMG ${s.damage} · SPEED ${s.speed}`;
};
$("unit-types").children[0].click();
$("size").oninput = () => {
    $("size-value").value = $("size").value;
};
/**
 * Select placement or erasing and update control states.
 *
 * @param value - True for erasing; false for placement.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function tool(value) {
    erase = value;
    $("place").setAttribute("aria-pressed", String(!value));
    $("erase").setAttribute("aria-pressed", String(value));
    report();
}
$("place").onclick = () => tool(false);
$("erase").onclick = () => tool(true);
$("demo").onclick = demo;
$("clear").onclick = () => {
    battle.clear();
    persist();
    report();
    message("Field cleared. Click to deploy new regiments.");
};
$("start").onclick = toggle;
$("reset").onclick = () => {
    battle.reset();
    accumulator = 0;
    report();
    message("Original positions restored. You can edit the armies.");
};
// Convert pointer coordinates from the responsive canvas to the fixed 1200 × 800 field.
/**
 * Convert a pointer event to coordinates in the fixed-size battlefield.
 *
 * @param e - Pointer or mouse event with client coordinates.
 * @returns Object containing x and y coordinates in battlefield pixels.
 */
function point(e) {
    const r = canvas.getBoundingClientRect();
    return {
        x: ((e.clientX - r.left) * 1200) / r.width,
        y: ((e.clientY - r.top) * 800) / r.height,
    };
}
canvas.onpointermove = (e) => {
    hover = point(e);
};
canvas.onpointerleave = () => (hover = null);
canvas.onclick = (e) => {
    const p = point(e);
    place(p.x, p.y);
};
// Provide keyboard placement without intercepting native input and button shortcuts.
canvas.onkeydown = (e) => {
    if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(
            e.code,
        )
    ) {
        e.preventDefault();
        hover ||= { x: 600, y: 400 };
        if (e.code === "Enter") place(hover.x, hover.y);
        else {
            hover.x = Math.max(
                50,
                Math.min(
                    1150,
                    hover.x + ({ ArrowLeft: -20, ArrowRight: 20 }[e.code] || 0),
                ),
            );
            hover.y = Math.max(
                50,
                Math.min(
                    750,
                    hover.y + ({ ArrowUp: -20, ArrowDown: 20 }[e.code] || 0),
                ),
            );
        }
    }
};
document.addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === "Space") {
        e.preventDefault();
        toggle();
    }
    if (e.code === "KeyR") $("reset").click();
});
// Paint seeded decorative terrain once and reuse it every frame; it does not block movement.
const terrain = document.createElement("canvas");
terrain.width = 1200;
terrain.height = 800;
const tc = terrain.getContext("2d");
tc.fillStyle = "#192c25";
tc.fillRect(0, 0, 1200, 800);
let seed = 391;
const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
};
for (let i = 0; i < 14000; i++) {
    tc.fillStyle = rand() > 0.5 ? "#36503b" : "#223c2d";
    tc.globalAlpha = 0.35;
    tc.fillRect(rand() * 1200, rand() * 800, rand() * 3 + 1, rand() * 3 + 1);
}
tc.globalAlpha = 1;
tc.strokeStyle = "#ffffff07";
for (let x = 0; x <= 1200; x += 50) {
    tc.beginPath();
    tc.moveTo(x, 0);
    tc.lineTo(x, 800);
    tc.stroke();
}
for (let y = 0; y <= 800; y += 50) {
    tc.beginPath();
    tc.moveTo(0, y);
    tc.lineTo(1200, y);
    tc.stroke();
}
// Draw fallen markers first, then living formations, health bars, arrows and placement hints.
/**
 * Render terrain, fallen markers, surviving soldiers, projectiles, and placement hints.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function draw() {
    ctx.drawImage(terrain, 0, 0);
    for (const u of battle.units) {
        if (u.hp > 0) continue;
        ctx.fillStyle = colors[u.faction] + "40";
        ctx.fillRect(u.x - 2, u.y - 2, 4, 4);
    }
    for (const r of battle.regiments) {
        const soldiers = battle.units.filter(
            (u) => u.regiment === r.id && u.hp > 0,
        );
        if (!soldiers.length) continue;
        const x = soldiers.reduce((a, u) => a + u.x, 0) / soldiers.length,
            y = soldiers.reduce((a, u) => a + u.y, 0) / soldiers.length;
        ctx.fillStyle = "#0b1220b0";
        ctx.fillRect(x - 22, y - 37, 44, 4);
        ctx.fillStyle = colors[r.faction];
        ctx.fillRect(
            x - 22,
            y - 37,
            (44 * soldiers.reduce((a, u) => a + u.hp, 0)) /
                (r.count * TYPES[r.type].hp),
            4,
        );
    }
    for (const u of battle.units) {
        if (u.hp <= 0) continue;
        ctx.save();
        ctx.translate(u.x, u.y);
        ctx.rotate(u.angle);
        ctx.fillStyle = colors[u.faction];
        ctx.strokeStyle = "#0c1915";
        ctx.lineWidth = 1;
        if (u.type === "cavalry") {
            ctx.beginPath();
            ctx.moveTo(7, 0);
            ctx.lineTo(0, 5);
            ctx.lineTo(-7, 0);
            ctx.lineTo(0, -5);
            ctx.closePath();
        } else if (u.type === "bow") {
            ctx.beginPath();
            ctx.moveTo(5, 0);
            ctx.lineTo(-4, 4);
            ctx.lineTo(-4, -4);
            ctx.closePath();
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
        if (u.type === "sword") {
            ctx.strokeStyle = "#dce8e0";
            ctx.beginPath();
            ctx.moveTo(3, -3);
            ctx.lineTo(8, -3);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.strokeStyle = "#f4e4b2";
    ctx.lineWidth = 1.5;
    for (const a of battle.arrows) {
        const angle = Math.atan2(a.target.y - a.y, a.target.x - a.x);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x - Math.cos(angle) * 9, a.y - Math.sin(angle) * 9);
        ctx.stroke();
    }
    if (hover) {
        ctx.strokeStyle = erase ? "#ff7979" : colors[selected];
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(hover.x - 30, hover.y - 30, 60, 60);
        ctx.setLineDash([]);
        ctx.fillStyle = colors[selected];
        ctx.font = "12px system-ui";
        ctx.fillText(
            erase ? "Erase" : `${$("size").value} ${TYPES[type].name}`,
            Math.min(hover.x + 36, 1010),
            hover.y,
        );
    }
}
// Advance combat in fixed 1/60-second steps for consistent behavior at every speed.
// Cap elapsed wall time after tab suspension and refresh report DOM at most five times a second.
/**
 * Run fixed simulation steps, throttle report updates, and schedule the next render.
 *
 * @param now - Animation-frame timestamp in milliseconds.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function frame(now) {
    const delta = Math.min((now - (last || now)) / 1000, 0.1);
    last = now;
    if (battle.running) {
        accumulator += delta * +$("speed").value;
        while (accumulator >= 1 / 60 && battle.running) {
            battle.step(1 / 60);
            accumulator -= 1 / 60;
        }
    } else accumulator = 0;
    reportTimer += delta;
    if (reportTimer > 0.2) {
        report();
        reportTimer = 0;
    }
    draw();
    requestAnimationFrame(frame);
}
// Local storage is optional and untrusted: validate saved regiments before restoring them.
let restored = false;
try {
    const saved = JSON.parse(localStorage.getItem("war-simulator-setup"));
    if (saved && Array.isArray(saved.regiments)) {
        factions = Math.max(2, Math.min(8, Number(saved.factions) || 3));
        for (const r of saved.regiments) {
            if (
                Number.isInteger(r.faction) &&
                r.faction >= 0 &&
                r.faction < factions &&
                TYPES[r.type] &&
                Number.isInteger(r.count) &&
                r.count >= 6 &&
                r.count <= 60 &&
                Number.isFinite(r.x) &&
                Number.isFinite(r.y)
            )
                battle.add(r.faction, r.type, r.count, r.x, r.y);
        }
        restored = true;
    }
} catch {}
if (!restored) demo();
factionUI();
requestAnimationFrame(frame);

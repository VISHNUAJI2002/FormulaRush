/* math_data.js
   Central Database for FormulaRush Questions (Visual & Voice)
   Used by: single_script.js, multiplayer_script.js
*/

// --- SHAPE SVGs ---
window.SHAPES = {
    // 2D Shapes
    triangle: `<svg class="shape-svg" viewBox="0 0 100 100"><polygon points="50,15 90,85 10,85" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    square: `<svg class="shape-svg" viewBox="0 0 100 100"><rect x="15" y="15" width="70" height="70" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    circle: `<svg class="shape-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="35" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    rectangle: `<svg class="shape-svg" viewBox="0 0 100 100"><rect x="10" y="30" width="80" height="40" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    pentagon: `<svg class="shape-svg" viewBox="0 0 100 100"><polygon points="50,10 90,40 75,90 25,90 10,40" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    hexagon: `<svg class="shape-svg" viewBox="0 0 100 100"><polygon points="50,10 85,30 85,70 50,90 15,70 15,30" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    line: `<svg class="shape-svg" viewBox="0 0 100 100"><line x1="10" y1="90" x2="90" y2="10" stroke="cyan" stroke-width="5"/></svg>`,
    arc: `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M 10 50 Q 50 10 90 50" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    parallelogram: `<svg class="shape-svg" viewBox="0 0 100 100"><polygon points="25,20 85,20 75,80 15,80" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    semicircle: `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M 10 50 A 40 40 0 0 1 90 50 Z" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    trapezium: `<svg class="shape-svg" viewBox="0 0 100 100"><polygon points="25,25 75,25 90,75 10,75" stroke="cyan" fill="none" stroke-width="5"/></svg>`,
    angle: `<svg class="shape-svg" viewBox="0 0 100 100"><line x1="20" y1="80" x2="80" y2="80" stroke="cyan" stroke-width="5"/><line x1="20" y1="80" x2="60" y2="20" stroke="cyan" stroke-width="5"/><path d="M 35 80 A 15 15 0 0 0 40 60" stroke="cyan" fill="none" stroke-width="3"/></svg>`,
    // 3D Shapes
    cube: `<svg class="shape-svg" viewBox="0 0 100 100"><rect x="10" y="30" width="50" height="50" stroke="cyan" fill="none" stroke-width="3"/><rect x="40" y="10" width="50" height="50" stroke="cyan" fill="none" stroke-width="3"/><line x1="10" y1="30" x2="40" y2="10" stroke="cyan" stroke-width="3"/><line x1="60" y1="30" x2="90" y2="10" stroke="cyan" stroke-width="3"/><line x1="10" y1="80" x2="40" y2="60" stroke="cyan" stroke-width="3"/><line x1="60" y1="80" x2="90" y2="60" stroke="cyan" stroke-width="3"/></svg>`,
    hemisphere: `<svg class="shape-svg" viewBox="0 0 100 100"><path d="M 10 60 A 40 40 0 0 1 90 60 L 90 60 Z" stroke="cyan" fill="none" stroke-width="5"/><ellipse cx="50" cy="60" rx="40" ry="10" stroke="cyan" fill="none" stroke-width="3"/></svg>`,
    sphere: `<svg class="shape-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="cyan" fill="none" stroke-width="5"/><ellipse cx="50" cy="50" rx="40" ry="10" stroke="cyan" fill="none" stroke-width="3" stroke-dasharray="5,5"/></svg>`,
    cylinder: `<svg class="shape-svg" viewBox="0 0 100 100"><ellipse cx="50" cy="20" rx="30" ry="10" stroke="cyan" fill="none" stroke-width="5"/><ellipse cx="50" cy="80" rx="30" ry="10" stroke="cyan" fill="none" stroke-width="5"/><line x1="20" y1="20" x2="20" y2="80" stroke="cyan" stroke-width="5"/><line x1="80" y1="20" x2="80" y2="80" stroke="cyan" stroke-width="5"/></svg>`,
    cone: `<svg class="shape-svg" viewBox="0 0 100 100"><ellipse cx="50" cy="80" rx="30" ry="10" stroke="cyan" fill="none" stroke-width="5"/><line x1="20" y1="80" x2="50" y2="10" stroke="cyan" stroke-width="5"/><line x1="80" y1="80" x2="50" y2="10" stroke="cyan" stroke-width="5"/></svg>`
};

// --- DATA POOLS ---
window.VOICE_DATA = {
    shapes: [
        {html: window.SHAPES.triangle, a:"triangle"}, 
        {html: window.SHAPES.square, a:"square"}, 
        {html: window.SHAPES.circle, a:"circle"}, 
        {html: window.SHAPES.rectangle, a:"rectangle"},
        {html: window.SHAPES.pentagon, a:"pentagon"}, 
        {html: window.SHAPES.hexagon, a:"hexagon"},
        {html: window.SHAPES.line, a:["line", "line segment", "lie"]}, 
        {html: window.SHAPES.arc, a:["arc", "ark", "art", "arch", "dark"]},
        {html: window.SHAPES.parallelogram, a:"parallelogram"}, 
        {html: window.SHAPES.trapezium, a:["trapezium", "trapezoid"]}, 
        {html: window.SHAPES.angle, a:["angle", "angel", "ankle"]},
        // 3D Shapes
        {html: window.SHAPES.cube, a:["cube", "cute", "kube"]}, 
        {html: window.SHAPES.semicircle, a:"semicircle"},
        {html: window.SHAPES.hemisphere, a:"hemisphere"},
        {html: window.SHAPES.cylinder, a:"cylinder"},
        {html: window.SHAPES.cone, a:["cone", "corn", "bone", "kaun"]}
    ], 
    // DIFFERENTIATION
    diff: [
        {t:"d/dx (x²)", a:["2x", "two x"]}, 
        {t:"d/dx (sin x)", a:["cos x", "cost x", "cause x", "cosine"]}, 
        {t:"d/dx (e^x)", a:["e power x", "e^x", "exponential"]}, 
        {t:"d/dx (ln x)", a:["one by x", "1/x", "one over x"]},
        {t:"d/dx (5x)", a:["5", "five"]},
        {t:"d/dx (cos x)", a:["minus sin x", "-sin x", "negative sine"]},
        {t:"d/dx (10)", a:["0", "zero", "constant"]},
        {t:"d/dx (x³)", a:["3x²", "three x square", "3x^2"]},
        {t:"d/dx (x)", a:["1", "one"]},
        {t:"d/dx (tan x)", a:["sec square x", "secant squared", "sec^2 x"]}
    ],
    // INTEGRATION
    int: [
        {t:"∫ 2x dx", a:["x squared", "x^2", "x square"]}, 
        {t:"∫ cos x dx", a:["sin x", "sign x", "sine x"]}, 
        {t:"∫ 1/x dx", a:["ln x", "log x", "natural log"]}, 
        {t:"∫ e^x dx", a:["e^x", "e power x"]},
        {t:"∫ 1 dx", a:["x", "ex"]},
        {t:"∫ sin x dx", a:["minus cos x", "-cos x", "negative cosine"]},
        {t:"∫ 0 dx", a:["constant", "c", "constant c"]},
        {t:"∫ x dx", a:["x square by two", "x^2/2", "half x square"]},
        {t:"∫ 5 dx", a:["5x", "five x", "5 times x", "five into x", "five times ex"]},
        {t:"∫ sec²x dx", a:["tan x", "tangent"]}
    ],
// TRIGONOMETRY (Expanded: 0, 30, 45, 60, 90)
    trig: [
        // 0 Degrees
        {t:"sin(0°)", a:["0", "zero","hero"]}, 
        {t:"cos(0°)", a:["1", "one"]}, 
        {t:"tan(0°)", a:["0", "zero","hero"]},
        // 30 Degrees
        {t:"sin(30°)", a:["0.5", "point five", "half", "one by two", "1/2"]},
        {t:"cos(30°)", a:["root three by two", "root 3 by 2", "0.866"]},
        {t:"tan(30°)", a:["one by root three", "1/root 3", "one over root three", "0.577"]},
        // 45 Degrees
        {t:"sin(45°)", a:["one by root two", "1/root 2", "one over root two", "0.707"]},
        {t:"cos(45°)", a:["one by root two", "1/root 2", "one over root two", "0.707"]},
        {t:"tan(45°)", a:["1", "one"]},
        // 60 Degrees
        {t:"sin(60°)", a:["root three by two", "root 3 by 2", "0.866"]},
        {t:"cos(60°)", a:["0.5", "point five", "half", "one by two", "1/2"]},
        {t:"tan(60°)", a:["root three", "root 3", "1.732"]},
        // 90 Degrees
        {t:"sin(90°)", a:["1", "one"]},
        {t:"cos(90°)", a:["0", "zero"]},
        {t:"tan(90°)", a:["undefined", "infinity", "infinite", "not defined"]},
        // Bonus (180 for completeness)
        {t:"sin(180°)", a:["0", "zero","hero"]},
        {t:"cos(180°)", a:["-1", "minus one", "negative one"]}
    ]
};
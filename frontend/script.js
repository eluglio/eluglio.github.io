const hoje = new Date();
const dia = String(hoje.getDate()).padStart(2, '0');
const mes = String(hoje.getMonth() + 1).padStart(2, '0'); // O mês começa em 0 (janeiro = 0), por isso somamos 1

const dataAtual = `${dia}/${mes}`;
// Default Agenda Dataset
const defaultAgendaData = [
    { date: dataAtual, eventName: "Novo evento", location: "Novo local", time: "0h", responsible: "Responsável" }
];

// Global State
let agendaData = JSON.parse(localStorage.getItem('agenda_data_items_v5')) || [...defaultAgendaData];
let base64ImgLeft = localStorage.getItem('agenda_img_left_b64') || null;
let base64ImgRight = localStorage.getItem('agenda_img_right_b64') || null;
let currentTheme = localStorage.getItem('agenda_card_theme_v5') || 'oficial';

let loadedImgLeft = new Image();
let loadedImgRight = new Image();
let isLeftImgLoaded = false;
let isRightImgLoaded = false;

// Fator de escala uniforme recalculado a cada desenho (ver drawAgendaCanvas),
// usado para fontes, traços e paddings fixos continuarem proporcionais
// quando a resolução real do canvas muda.
let _s = 1;

function saveData() {
    localStorage.setItem('agenda_data_items_v5', JSON.stringify(agendaData));
    localStorage.setItem('agenda_card_theme_v5', currentTheme);
}

window.onload = function() {
    document.fonts.ready.then(() => {
        restoreCanvasSize();
        initImageObjects();
        updateThemeUI();
        renderEditorTable();
        drawAgendaCanvas();
        initCanvasResize();
    });
};

// --- REDIMENSIONAMENTO DO CARD: ALTERA A RESOLUÇÃO REAL DA IMAGEM GERADA ---
// Arrastar as bordas (ou escolher um preset) muda o width/height de verdade
// do <canvas>, então tanto a área de edição quanto o PNG baixado refletem
// o novo tamanho — não é só um zoom visual.
const CANVAS_SIZE_STORAGE_KEY = 'agenda_canvas_size_v2';
const DEFAULT_CANVAS_W = 1080;
const DEFAULT_CANVAS_H = 1380;
const CANVAS_MIN_W = 480;
const CANVAS_MIN_H = 480;
const CANVAS_MAX_W = 2160; // acima disso a geração fica pesada sem ganho real de qualidade
const CANVAS_MAX_H = 2160;

// Presets de tamanho prontos para as principais redes sociais
const SIZE_PRESETS = {
    ig_feed:   { label: 'Instagram Feed',     w: 1080, h: 1350 },
    ig_square: { label: 'Instagram Quadrado', w: 1080, h: 1080 },
    ig_story:  { label: 'Stories / Reels',    w: 1080, h: 1920 },
    whatsapp:  { label: 'Status WhatsApp',    w: 1080, h: 1920 },
    facebook:  { label: 'Facebook Post',      w: 1200, h: 630 },
    twitter:   { label: 'X (Twitter)',        w: 1600, h: 900 }
};

// Aplica uma nova resolução real ao canvas (usada pelo arraste e pelos presets)
function applyCanvasSize(w, h, options) {
    const opts = options || {};
    const persist = opts.persist !== false;
    const redraw = opts.redraw !== false;

    const canvas = document.getElementById('agendaCanvas');
    const box = document.getElementById('canvasBox');
    if (!canvas) return;

    w = Math.round(Math.min(Math.max(w, CANVAS_MIN_W), CANVAS_MAX_W));
    h = Math.round(Math.min(Math.max(h, CANVAS_MIN_H), CANVAS_MAX_H));

    canvas.width = w;
    canvas.height = h;
    if (box) box.style.aspectRatio = `${w} / ${h}`;

    if (persist) {
        try {
            localStorage.setItem(CANVAS_SIZE_STORAGE_KEY, JSON.stringify({ w: w, h: h }));
        } catch (e) { /* ignora */ }
    }
    if (redraw) drawAgendaCanvas();
}

// Chamada pelos botões de preset
function applyCanvasPreset(key) {
    const preset = SIZE_PRESETS[key];
    if (!preset) return;
    applyCanvasSize(preset.w, preset.h);
    updatePresetUI(key);
}

// Destaca visualmente o preset ativo (ou remove o destaque em tamanhos customizados)
function updatePresetUI(activeKey) {
    Object.keys(SIZE_PRESETS).forEach(key => {
        const btn = document.getElementById(`preset-btn-${key}`);
        if (!btn) return;
        if (key === activeKey) {
            btn.classList.remove('border-stone-800', 'hover:border-stone-600');
            btn.classList.add('border-emerald-400', 'ring-2', 'ring-emerald-400/30');
        } else {
            btn.classList.remove('border-emerald-400', 'ring-2', 'ring-emerald-400/30');
            btn.classList.add('border-stone-800', 'hover:border-stone-600');
        }
    });
}

// Restaura o tamanho salvo (ou o padrão) antes do primeiro desenho
function restoreCanvasSize() {
    let w = DEFAULT_CANVAS_W;
    let h = DEFAULT_CANVAS_H;
    try {
        const saved = JSON.parse(localStorage.getItem(CANVAS_SIZE_STORAGE_KEY));
        if (saved && saved.w && saved.h) {
            w = saved.w;
            h = saved.h;
        }
    } catch (e) { /* ignora */ }

    applyCanvasSize(w, h, { persist: false, redraw: false });

    const matchedPreset = Object.keys(SIZE_PRESETS).find(
        key => SIZE_PRESETS[key].w === w && SIZE_PRESETS[key].h === h
    );
    updatePresetUI(matchedPreset || null);
}

// Reseta para a resolução padrão do gerador (botão "Redefinir")
function resetCanvasBoxSize() {
    applyCanvasSize(DEFAULT_CANVAS_W, DEFAULT_CANVAS_H);
    updatePresetUI(null);
}

function initCanvasResize() {
    const box = document.getElementById('canvasBox');
    const canvas = document.getElementById('agendaCanvas');
    if (!box || !canvas) return;

    let dir = null;
    let startX = 0, startY = 0;
    let startDisplayW = 0, startDisplayH = 0;
    let startCanvasW = 0, startCanvasH = 0;
    let rafScheduled = false;

    function scheduleRedraw() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
            rafScheduled = false;
            drawAgendaCanvas();
        });
    }

    function onPointerDown(e) {
        dir = e.currentTarget.dataset.dir;
        const rect = box.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startDisplayW = rect.width;
        startDisplayH = rect.height;
        startCanvasW = canvas.width;
        startCanvasH = canvas.height;
        box.classList.add('is-resizing');
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!dir) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Converte o deslocamento exibido na tela para a resolução real do canvas
        const scaleX = startCanvasW / startDisplayW;
        const scaleY = startCanvasH / startDisplayH;

        let newW = startCanvasW;
        let newH = startCanvasH;

        if (dir.includes('e')) newW = startCanvasW + dx * scaleX;
        if (dir.includes('w')) newW = startCanvasW - dx * scaleX;
        if (dir.includes('s')) newH = startCanvasH + dy * scaleY;
        if (dir.includes('n')) newH = startCanvasH - dy * scaleY;

        newW = Math.min(Math.max(newW, CANVAS_MIN_W), CANVAS_MAX_W);
        newH = Math.min(Math.max(newH, CANVAS_MIN_H), CANVAS_MAX_H);

        canvas.width = Math.round(newW);
        canvas.height = Math.round(newH);
        box.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
        updatePresetUI(null);
        scheduleRedraw();
    }

    function onPointerUp() {
        if (!dir) return;
        dir = null;
        box.classList.remove('is-resizing');
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        try {
            localStorage.setItem(CANVAS_SIZE_STORAGE_KEY, JSON.stringify({ w: canvas.width, h: canvas.height }));
        } catch (e) { /* ignora */ }
    }

    box.querySelectorAll('.resize-handle').forEach(handle => {
        handle.addEventListener('pointerdown', onPointerDown);
    });
}

function initImageObjects() {
    if (base64ImgLeft) {
        loadedImgLeft.onload = () => { isLeftImgLoaded = true; drawAgendaCanvas(); };
        loadedImgLeft.src = base64ImgLeft;
    } else {
        isLeftImgLoaded = false;
    }

    if (base64ImgRight) {
        loadedImgRight.onload = () => { isRightImgLoaded = true; drawAgendaCanvas(); };
        loadedImgRight.src = base64ImgRight;
    } else {
        isRightImgLoaded = false;
    }
}

function handleImageUpload(event, side) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Data = e.target.result;
        if (side === 'left') {
            base64ImgLeft = base64Data;
            localStorage.setItem('agenda_img_left_b64', base64Data);
            loadedImgLeft = new Image();
            loadedImgLeft.onload = () => { isLeftImgLoaded = true; drawAgendaCanvas(); };
            loadedImgLeft.src = base64Data;
        } else if (side === 'right') {
            base64ImgRight = base64Data;
            localStorage.setItem('agenda_img_right_b64', base64Data);
            loadedImgRight = new Image();
            loadedImgRight.onload = () => { isRightImgLoaded = true; drawAgendaCanvas(); };
            loadedImgRight.src = base64Data;
        }
    };
    reader.readAsDataURL(file);
}

// --- CANVAS RENDERING ENGINE ---
function drawAgendaCanvas() {
    const canvas = document.getElementById('agendaCanvas');
    const ctx = canvas.getContext('2d');

    // W e H agora refletem a resolução REAL do canvas (muda com o arraste e os presets)
    const W = canvas.width;
    const H = canvas.height;

    // Fatores de escala em relação ao design de referência (1080x1380)
    const sx = W / DEFAULT_CANVAS_W;
    const sy = H / DEFAULT_CANVAS_H;
    _s = Math.min(sx, sy); // escala uniforme p/ fontes, traços e paddings fixos

    const sizeDisplay = document.getElementById('preset-size-display');
    if (sizeDisplay) sizeDisplay.innerText = `${W} × ${H}`;

    ctx.clearRect(0, 0, W, H);

    // 1. Background Gradient per Theme
    let bgGrad = ctx.createRadialGradient(W/2, H/2, 50 * _s, W/2, H/2, W * 0.75);

    if (currentTheme === 'lilas') {
        bgGrad.addColorStop(0, '#3d1b54');
        bgGrad.addColorStop(0.65, '#240d34');
        bgGrad.addColorStop(1, '#180826');
    } else if (currentTheme === 'rosa') {
        bgGrad.addColorStop(0, '#5e0d39');
        bgGrad.addColorStop(0.65, '#3b0623');
        bgGrad.addColorStop(1, '#240214');
    } else if (currentTheme === 'amarelo') {
        bgGrad.addColorStop(0, '#594100');
        bgGrad.addColorStop(0.65, '#3b2b00');
        bgGrad.addColorStop(1, '#211800');
    } else if (currentTheme === 'azul') {
        bgGrad.addColorStop(0, '#092082');
        bgGrad.addColorStop(0.65, '#091545');
        bgGrad.addColorStop(1, '#050b24');
    } else {
        // Oficial (Bordô)
        bgGrad.addColorStop(0, '#3b020d');
        bgGrad.addColorStop(0.65, '#240107');
        bgGrad.addColorStop(1, '#120004');
    }

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle background glow
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.beginPath();
    ctx.arc(W/2, H/2, 430 * _s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Header Images / Fallbacks
    const marginX = 65 * sx;
    const headerY = 65 * sy;
    const headerMaxH = 125 * sy;
    const leftBoxMaxW = 400 * sx;
    const rightBoxMaxW = 420 * sx;

    if (isLeftImgLoaded && loadedImgLeft.complete && loadedImgLeft.naturalWidth !== 0) {
        const aspect = loadedImgLeft.naturalWidth / loadedImgLeft.naturalHeight;
        const drawH = headerMaxH;
        const drawW = drawH * aspect;
        ctx.drawImage(loadedImgLeft, marginX, headerY, Math.min(drawW, leftBoxMaxW), drawH);
    } else {
        drawStylizedHeaderBox(ctx, marginX, headerY, leftBoxMaxW, headerMaxH, "AGENDA DA SEMANA", "#10b981");
    }

    if (isRightImgLoaded && loadedImgRight.complete && loadedImgRight.naturalWidth !== 0) {
        const aspect = loadedImgRight.naturalWidth / loadedImgRight.naturalHeight;
        const drawH = headerMaxH;
        const drawW = drawH * aspect;
        const finalW = Math.min(drawW, rightBoxMaxW);
        ctx.drawImage(loadedImgRight, W - marginX - finalW, headerY, finalW, drawH);
    } else {
        drawStylizedHeaderBox(ctx, W - marginX - leftBoxMaxW, headerY, leftBoxMaxW, headerMaxH, "PRESIDENTE LULA", "#ef4444");
    }

    // 3. Agenda Rows Rendering
    const itemCount = agendaData.length;
    document.getElementById('item-count-badge').innerText = itemCount;

    const startY = 225 * sy;
    const availableHeight = 1050 * sy;

    if (itemCount > 0) {
        const itemHeight = Math.min(98 * sy, Math.max(62 * sy, Math.floor((availableHeight - (itemCount - 1) * 10 * sy) / itemCount)));
        const rowGap = Math.min(12 * sy, Math.max(6 * sy, Math.floor((availableHeight - itemCount * itemHeight) / (itemCount + 1))));

        const cardX = marginX;
        const cardWidth = W - marginX * 2;

        agendaData.forEach((item, index) => {
            const currentY = startY + index * (itemHeight + rowGap);
            drawSingleAgendaRow(ctx, cardX, currentY, cardWidth, itemHeight, item);
        });
    } else {
        ctx.save();
        ctx.font = `bold ${Math.round(24 * _s)}px 'Montserrat', sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.textAlign = "center";
        ctx.fillText("Nenhum evento registrado na agenda.", W / 2, startY + availableHeight / 2);
        ctx.restore();
    }

    // 4. Footer
    const footerLineY = 1305 * sy;
    const footerTextY = 1335 * sy;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = Math.max(1, 1 * _s);
    ctx.beginPath();
    ctx.moveTo(marginX, footerLineY);
    ctx.lineTo(W - marginX, footerLineY);
    ctx.stroke();

    // Left Footer Text
    ctx.font = `bold ${Math.round(20 * _s)}px 'Montserrat', sans-serif`;
    ctx.fillStyle = "#f3f4f6";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("📣  Acompanhe a agenda em Santo André", marginX + 5 * sx, footerTextY);

    // Right Hashtag Badge
    ctx.font = `900 ${Math.round(20 * _s)}px 'Montserrat', sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText("#SantoAndreComLula", W - marginX - 5 * sx, footerTextY);
    ctx.restore();
}

// Draw Single Row with 4 Columns - Full Multiline Support in Canvas
function drawSingleAgendaRow(ctx, x, y, width, height, item) {
    ctx.save();

    // Column Width Allocation
    const dateW = Math.floor(width * 0.14);      // ~133px Date
    const eventW = Math.floor(width * 0.32);     // ~304px Event Name
    const respW = Math.floor(width * 0.22);      // ~209px Responsible
    const mainW = width - dateW - eventW - respW; // ~304px Location & Time

    const dateX = x;
    const eventX = dateX + dateW;
    const mainX = eventX + eventW;
    const respX = mainX + mainW;

    const radius = 14 * _s;

    // -------------------------------------------------------------
    // 1. GREEN DATE BADGE (MULTILINE)
    // -------------------------------------------------------------
    ctx.fillStyle = "#059669";
    ctx.beginPath();
    ctx.moveTo(dateX + radius, y);
    ctx.lineTo(dateX + dateW, y);
    ctx.lineTo(dateX + dateW, y + height);
    ctx.lineTo(dateX + radius, y + height);
    ctx.arcTo(dateX, y + height, dateX, y + height - radius, radius);
    ctx.lineTo(dateX, y + radius);
    ctx.arcTo(dateX, y, dateX + radius, y, radius);
    ctx.closePath();
    ctx.fill();

    // Date Divider Line
    ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
    ctx.lineWidth = 2 * _s;
    ctx.beginPath();
    ctx.moveTo(dateX + dateW, y);
    ctx.lineTo(dateX + dateW, y + height);
    ctx.stroke();

    // Date Text Multiline Drawing
    const dateFontSize = Math.round(height * 0.28);
    ctx.font = `900 ${dateFontSize}px 'Montserrat', sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const dateLines = wrapText(ctx, item.date || "", dateW - 12 * _s, 3);
    const dateLineH = dateFontSize * 1.1;
    const dateTotalH = dateLines.length * dateLineH;
    const dateStartY = y + (height - dateTotalH) / 2;

    dateLines.forEach((dLine, idx) => {
        ctx.fillText(dLine, dateX + dateW / 2, dateStartY + idx * dateLineH);
    });

    // -------------------------------------------------------------
    // 2. EVENT NAME BLOCK (MULTILINE)
    // -------------------------------------------------------------
    ctx.fillStyle = "#0f172a"; // Deep Slate Dark
    ctx.fillRect(eventX, y, eventW, height);

    const eventFontSize = Math.round(height * 0.22);
    ctx.font = `800 ${eventFontSize}px 'Montserrat', sans-serif`;
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const eventLines = wrapText(ctx, item.eventName || "Evento", eventW - 20 * _s, 3);
    const eventLineH = eventFontSize * 1.15;
    const eventTotalH = eventLines.length * eventLineH;
    const eventStartY = y + (height - eventTotalH) / 2;

    eventLines.forEach((lineText, lineIdx) => {
        ctx.fillText(lineText, eventX + 10 * _s, eventStartY + lineIdx * eventLineH);
    });

    // Divider Line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1.5 * _s;
    ctx.beginPath();
    ctx.moveTo(eventX + eventW, y);
    ctx.lineTo(eventX + eventW, y + height);
    ctx.stroke();

    // -------------------------------------------------------------
    // 3. YELLOW LOCATION & TIME BLOCK (MULTILINE)
    // -------------------------------------------------------------
    ctx.fillStyle = "#fbbf24"; // Official Yellow
    ctx.fillRect(mainX, y, mainW, height);

    const locW = mainW * 0.62;
    const timeW = mainW - locW;

    // Location Text Multiline (Left Area)
    const locFontSize = Math.round(height * 0.21);
    ctx.font = `900 ${locFontSize}px 'Montserrat', sans-serif`;
    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const locLines = wrapText(ctx, item.location || "", locW - 14 * _s, 3);
    const locLineH = locFontSize * 1.1;
    const locTotalH = locLines.length * locLineH;
    const locStartY = y + (height - locTotalH) / 2;

    locLines.forEach((lineText, lineIdx) => {
        ctx.fillText(lineText, mainX + 10 * _s, locStartY + lineIdx * locLineH);
    });

    // Yellow Divider Line between Local and Horário
    ctx.strokeStyle = "rgba(180, 83, 9, 0.35)";
    ctx.lineWidth = 1.5 * _s;
    ctx.beginPath();
    ctx.moveTo(mainX + locW, y + 8 * _s);
    ctx.lineTo(mainX + locW, y + height - 8 * _s);
    ctx.stroke();

    // Time Text Multiline (Right Area)
    const timeFontSize = Math.round(height * 0.20);
    ctx.font = `700 ${timeFontSize}px 'Montserrat', sans-serif`;
    ctx.fillStyle = "#1e293b";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const timeLines = wrapText(ctx, item.time || "", timeW - 8 * _s, 3);
    const timeLineH = timeFontSize * 1.1;
    const timeTotalH = timeLines.length * timeLineH;
    const timeStartY = y + (height - timeTotalH) / 2;

    timeLines.forEach((lineText, lineIdx) => {
        ctx.fillText(lineText, mainX + locW + timeW / 2, timeStartY + lineIdx * timeLineH);
    });

    // -------------------------------------------------------------
    // 4. BLUE RESPONSIBLE BADGE (MULTILINE)
    // -------------------------------------------------------------
    const respGrad = ctx.createLinearGradient(respX, y, respX + respW, y + height);
    respGrad.addColorStop(0, '#1d4ed8');
    respGrad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = respGrad;

    ctx.beginPath();
    ctx.moveTo(respX, y);
    ctx.lineTo(respX + respW - radius, y);
    ctx.arcTo(respX + respW, y, respX + respW, y + radius, radius);
    ctx.lineTo(respX + respW, y + height - radius);
    ctx.arcTo(respX + respW, y + height, respX + respW - radius, y + height, radius);
    ctx.lineTo(respX, y + height);
    ctx.closePath();
    ctx.fill();

    // Label "RESPONSÁVEL:"
    const respLabelSize = Math.round(height * 0.15);
    ctx.font = `800 ${respLabelSize}px 'Montserrat', sans-serif`;
    ctx.fillStyle = "#93c5fd";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("RESPONSÁVEL:", respX + 10 * _s, y + 6 * _s);

    // Responsible Name Multiline Text
    const respNameSize = Math.round(height * 0.22);
    ctx.font = `900 ${respNameSize}px 'Montserrat', sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const respLines = wrapText(ctx, item.responsible || "", respW - 16 * _s, 2);
    const respLineH = respNameSize * 1.1;
    const respTotalH = respLines.length * respLineH;
    const respStartY = y + 6 * _s + respLabelSize + (height - 12 * _s - respLabelSize - respTotalH) / 2;

    respLines.forEach((rLine, idx) => {
        ctx.fillText(rLine, respX + 10 * _s, respStartY + idx * respLineH);
    });

    ctx.restore();
}

// Generic Canvas Multiline Text Wrapping Utility
function wrapText(ctx, text, maxWidth, maxLines = 3) {
    if (!text) return [""];
    const words = text.replace(/\n/g, " \n ").split(' ');
    let lines = [];
    let currentLine = "";

    for (let i = 0; i < words.length; i++) {
        let word = words[i];

        if (word === "\n") {
            lines.push(currentLine.trim());
            currentLine = "";
            continue;
        }

        let testLine = currentLine === "" ? word : currentLine + " " + word;
        let width = ctx.measureText(testLine).width;

        if (width <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine !== "") lines.push(currentLine.trim());
            currentLine = word;
        }
    }
    if (currentLine !== "") lines.push(currentLine.trim());

    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        let lastLine = lines[maxLines - 1];
        while (lastLine.length > 0 && ctx.measureText(lastLine + "…").width > maxWidth) {
            lastLine = lastLine.slice(0, -1);
        }
        lines[maxLines - 1] = lastLine.trim() + "…";
    }
    return lines;
}

function drawStylizedHeaderBox(ctx, x, y, w, h, title, color) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * _s;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18 * _s);
    ctx.fill();
    ctx.stroke();

    ctx.font = `900 ${Math.round(22 * _s)}px 'Montserrat', sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, x + w / 2, y + h / 2);
    ctx.restore();
}

// --- THEME SWITCHER ---
function changeBg(theme) {
    currentTheme = theme;
    saveData();
    updateThemeUI();
    drawAgendaCanvas();
}

function updateThemeUI() {
    const themes = ['oficial', 'lilas', 'rosa', 'amarelo', 'azul'];
    const names = {
        'oficial': 'Oficial (Bordô)',
        'lilas': 'Lilás',
        'rosa': 'Rosa',
        'amarelo': 'Amarelo',
        'azul': 'Azul'
    };

    themes.forEach(t => {
        const btn = document.getElementById(`theme-btn-${t}`);
        if (btn) {
            if (t === currentTheme) {
                btn.classList.remove('border-stone-800', 'hover:border-stone-600');
                btn.classList.add('border-amber-400', 'ring-2', 'ring-amber-400/30');
            } else {
                btn.classList.remove('border-amber-400', 'ring-2', 'ring-amber-400/30');
                btn.classList.add('border-stone-800', 'hover:border-stone-600');
            }
        }
    });

    document.getElementById('theme-name-display').innerText = names[currentTheme] || currentTheme;
}

// --- EDITABLE TABLE CONTROLS (TEXTAREAS FOR ALL FIELDS) ---
function renderEditorTable() {
    const tbody = document.getElementById('editor-table-body');
    tbody.innerHTML = '';

    agendaData.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-stone-800/50 transition border-b border-stone-800/40";
        tr.innerHTML = `
            <td class="p-1.5">
                <textarea rows="2" oninput="updateItem(${index}, 'date', this.value)" class="w-16 bg-stone-950 text-stone-100 px-2 py-1 text-xs rounded-lg border border-stone-800 focus:border-red-500 focus:outline-none font-bold resize-none custom-scroll">${escapeHtml(item.date || '')}</textarea>
            </td>
            <td class="p-1.5">
                <textarea rows="2" oninput="updateItem(${index}, 'eventName', this.value)" class="w-full bg-stone-950 text-stone-100 px-2 py-1 text-xs rounded-lg border border-stone-800 focus:border-red-500 focus:outline-none font-semibold resize-none custom-scroll">${escapeHtml(item.eventName || '')}</textarea>
            </td>
            <td class="p-1.5">
                <textarea rows="2" oninput="updateItem(${index}, 'location', this.value)" class="w-full bg-stone-950 text-stone-100 px-2 py-1 text-xs rounded-lg border border-stone-800 focus:border-red-500 focus:outline-none font-semibold resize-none custom-scroll">${escapeHtml(item.location || '')}</textarea>
            </td>
            <td class="p-1.5">
                <textarea rows="2" oninput="updateItem(${index}, 'time', this.value)" class="w-24 bg-stone-950 text-stone-100 px-2 py-1 text-xs rounded-lg border border-stone-800 focus:border-red-500 focus:outline-none font-semibold resize-none custom-scroll">${escapeHtml(item.time || '')}</textarea>
            </td>
            <td class="p-1.5">
                <textarea rows="2" oninput="updateItem(${index}, 'responsible', this.value)" class="w-24 bg-stone-950 text-stone-100 px-2 py-1 text-xs rounded-lg border border-stone-800 focus:border-red-500 focus:outline-none font-semibold resize-none custom-scroll">${escapeHtml(item.responsible || '')}</textarea>
            </td>
            <td class="p-1.5 text-center">
                <div class="flex items-center justify-center gap-1">
                    <button onclick="moveRow(${index}, -1)" title="Mover para cima" ${index === 0 ? 'disabled class="opacity-20 text-stone-600 p-1"' : 'class="text-stone-400 hover:text-white p-1 cursor-pointer"'}>
                        <i class="fa-solid fa-chevron-up text-xs"></i>
                    </button>
                    <button onclick="moveRow(${index}, 1)" title="Mover para baixo" ${index === agendaData.length - 1 ? 'disabled class="opacity-20 text-stone-600 p-1"' : 'class="text-stone-400 hover:text-white p-1 cursor-pointer"'}>
                        <i class="fa-solid fa-chevron-down text-xs"></i>
                    </button>
                    <button onclick="deleteRow(${index})" title="Eliminar" class="text-red-500 hover:text-red-400 p-1.5 cursor-pointer">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateItem(index, field, value) {
    agendaData[index][field] = value;
    saveData();
    drawAgendaCanvas();
}

function addNewRow() {
    agendaData.push({ date: dataAtual, eventName: "Novo evento", location: "Novo local", time: "0h", responsible: "Responsável" });
    saveData();
    renderEditorTable();
    drawAgendaCanvas();
}

function deleteRow(index) {
    agendaData.splice(index, 1);
    saveData();
    renderEditorTable();
    drawAgendaCanvas();
}

function clearAllRows() {
    agendaData = [];
    saveData();
    renderEditorTable();
    drawAgendaCanvas();
}

function moveRow(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= agendaData.length) return;
    const temp = agendaData[index];
    agendaData[index] = agendaData[newIndex];
    agendaData[newIndex] = temp;
    saveData();
    renderEditorTable();
    drawAgendaCanvas();
}

function resetData() {
    agendaData = [...defaultAgendaData];
    base64ImgLeft = null;
    base64ImgRight = null;
    currentTheme = 'oficial';
    isLeftImgLoaded = false;
    isRightImgLoaded = false;
    localStorage.removeItem('agenda_img_left_b64');
    localStorage.removeItem('agenda_img_right_b64');
    saveData();
    updateThemeUI();
    renderEditorTable();
    applyCanvasSize(DEFAULT_CANVAS_W, DEFAULT_CANVAS_H, { redraw: false });
    updatePresetUI(null);
    drawAgendaCanvas();
}

function escapeHtml(str) {
    return str ? str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : "";
}

function downloadCanvasPNG() {
    const canvas = document.getElementById('agendaCanvas');
    const btn = document.getElementById('btn-download');
    const originalText = btn.innerHTML;

    btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> A Gerar PNG...`;
    btn.disabled = true;

    setTimeout(() => {
        const link = document.createElement('a');
        link.download = `agenda-oficial-${currentTheme}-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();

        btn.innerHTML = `<i class="fa-solid fa-check"></i> Transferido com Sucesso!`;
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 2000);
    }, 100);
}
// --- FUNÇÃO PARA EXPORTAR AGENDA PARA CSV ---
function exportToCSV() {
    if (!agendaData || agendaData.length === 0) {
        alert("A lista de compromissos está vazia!");
        return;
    }

    // Cabeçalhos das colunas
    const headers = ["Data", "Nome do Evento", "Local", "Horario", "Responsavel"];
    
    // Converte os itens para linhas do CSV com escape para aspas e quebras de linha
    const rows = agendaData.map(item => [
        `"${(item.date || '').replace(/"/g, '""')}"`,
        `"${(item.eventName || '').replace(/"/g, '""')}"`,
        `"${(item.location || '').replace(/"/g, '""')}"`,
        `"${(item.time || '').replace(/"/g, '""')}"`,
        `"${(item.responsible || '').replace(/"/g, '""')}"`
    ]);

    // Junta o cabeçalho e os dados usando vírgula (ou ponto e vírgula se preferir)
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    // Adiciona o BOM (\uFEFF) para garantir suporte correto a acentuação e UTF-8 no Excel
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    // Cria o link invisível e força o download
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `agenda-compromissos-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// --- FUNÇÃO PARA IMPORTAR/LER ARQUIVO CSV ---
function importFromCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const parsedData = parseCSV(text);

        if (parsedData.length === 0) {
            alert("Nenhum dado válido encontrado no arquivo CSV.");
            return;
        }

        // Atualiza os dados globais
        agendaData = parsedData;

        // Salva e atualiza interface e canvas
        saveData();
        renderEditorTable();
        drawAgendaCanvas();

        // Limpa a seleção do input para permitir carregar o mesmo arquivo novamente se necessário
        event.target.value = '';
    };

    reader.readAsText(file, 'UTF-8');
}

// --- PARSER DE CSV (SUPORTA ASPAS E QUEBRAS DE LINHA) ---
function parseCSV(text) {
    // Remove o BOM se existir
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }

    const lines = [];
    let row = [];
    let inQuotes = false;
    let currentValue = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentValue += '"';
                i++; // Pula a aspa escapada
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === ',' || char === ';') && !inQuotes) {
            row.push(currentValue.trim());
            currentValue = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++; // Pula o \n do \r\n
            }
            row.push(currentValue.trim());
            if (row.some(val => val !== '')) {
                lines.push(row);
            }
            row = [];
            currentValue = '';
        } else {
            currentValue += char;
        }
    }

    if (currentValue !== '' || row.length > 0) {
        row.push(currentValue.trim());
        if (row.some(val => val !== '')) {
            lines.push(row);
        }
    }

    if (lines.length < 2) return []; // Precisa ter pelo menos cabeçalho + 1 linha

    // Descarta o cabeçalho (primeira linha) e converte para objetos
    const dataRows = lines.slice(1);
    
    return dataRows.map(columns => {
        return {
            date: columns[0] || "",
            eventName: columns[1] || "",
            location: columns[2] || "",
            time: columns[3] || "",
            responsible: columns[4] || ""
        };
    });
}

/**
 * DokMotion.jsx — ExtendScript backend (v0.9)
 *
 * Template layer naming convention:
 *   "navn"  → person name text layer
 *   "titel" → title text layer
 *
 * Comp naming convention:
 *   Bundter  → "BUNDT <NAVN> 0001" (auto-incremented per name)
 *   Identer  → "IDENT <TEKST>"
 *   Grafik   → "<NR> <EP> GRAFIK <NR>"
 */
var DokMotion = (function () {

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function _obj(o) { return (o && typeof o === 'object') ? o : {}; }

  function _str(s, fallback) {
    if (s === undefined || s === null) return fallback || '';
    var v = s.toString().replace(/^\s+|\s+$/g, '');
    return v || (fallback || '');
  }

  function _int(s, fallback) {
    var n = parseInt(s, 10);
    return isNaN(n) ? (fallback || 0) : n;
  }

  function pad2(n) {
    n = _int(n, 0);
    return (n < 10 ? '0' : '') + n;
  }

  function pad4(n) {
    n = _int(n, 0);
    var s = '' + n;
    while (s.length < 4) s = '0' + s;
    return s;
  }

  // ─── Project item lookups ───────────────────────────────────────────────────

  function getCompByName(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }

  /**
   * Returns a FolderItem with the given name directly under parentFolder,
   * creating it if it does not already exist.
   */
  function getOrCreateFolder(name, parentFolder) {
    var parent = parentFolder || app.project.rootFolder;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof FolderItem && it.name === name && it.parentFolder === parent) {
        return it;
      }
    }
    var folder = app.project.items.addFolder(name);
    folder.parentFolder = parent;
    return folder;
  }

  // ─── Comp listing ───────────────────────────────────────────────────────────

  function listComps() {
    var arr = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (it instanceof CompItem) arr.push(it.name);
    }
    arr.sort(function (a, b) { return a > b ? 1 : a < b ? -1 : 0; });
    return JSON.stringify(arr);
  }

  // ─── Bundt ──────────────────────────────────────────────────────────────────

  /** Returns next unused version number for a given name. */
  function nextBundtVersion(navn) {
    var prefix = 'BUNDT ' + navn + ' ';
    var maxV = 0;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (!(it instanceof CompItem) || it.name.indexOf(prefix) !== 0) continue;
      var v = parseInt(it.name.substr(prefix.length), 10);
      if (!isNaN(v)) maxV = Math.max(maxV, v);
    }
    return maxV + 1;
  }

  /** Sets a single named text layer's content (case-insensitive layer name match). */
  function setTextLayer(comp, layerName, text) {
    for (var i = 1; i <= comp.numLayers; i++) {
      var lyr = comp.layer(i);
      if (!lyr || lyr.name.toLowerCase() !== layerName.toLowerCase()) continue;
      try {
        var srcText = lyr.property('Source Text');
        if (srcText) {
          var td = srcText.value;
          td.text = text;
          srcText.setValue(td);
        }
      } catch (e) {}
      break;
    }
  }

  /** Reads the current text content of a named layer. Returns '' if not found. */
  function getTextLayer(comp, layerName) {
    for (var i = 1; i <= comp.numLayers; i++) {
      var lyr = comp.layer(i);
      if (!lyr || lyr.name.toLowerCase() !== layerName.toLowerCase()) continue;
      try {
        return lyr.property('Source Text').value.text || '';
      } catch (e) {}
    }
    return '';
  }

  /**
   * Internal bundt creator — no undo group.
   * Called by both createBundtFromTemplate (single) and batchBundtFromTemplate.
   */
  function _createBundt(templateName, navn, titel, bundtFolder) {
    var tmpl = getCompByName(templateName);
    if (!tmpl) return 'Fejl: template "' + templateName + '" ikke fundet';

    var newName = 'BUNDT ' + navn + ' ' + pad4(nextBundtVersion(navn));
    var dup = tmpl.duplicate();
    dup.name = newName;

    setTextLayer(dup, 'navn', navn);
    setTextLayer(dup, 'titel', titel);

    if (bundtFolder) dup.parentFolder = bundtFolder;

    return newName;
  }

  function createBundtFromTemplate(args) {
    args = _obj(args);
    var templateName = _str(args.template, '');
    var navn = _str(args.navn, '');
    var titel = _str(args.titel, '');

    if (!templateName) return 'Fejl: mangler template';
    if (!navn) return 'Fejl: mangler navn';

    app.beginUndoGroup('DokMotion: Opret bundt');
    try {
      var bundtFolder = getOrCreateFolder('02 BUNDTER', app.project.rootFolder);
      var result = _createBundt(templateName, navn, titel, bundtFolder);
      app.endUndoGroup();
      return result;
    } catch (e) {
      try { app.endUndoGroup(); } catch (_) {}
      return 'Fejl: ' + e.toString();
    }
  }

  /**
   * jsonString is a JSON-encoded string (double-encoded by the HTML layer
   * so it survives the evalScript string boundary safely).
   */
  function batchBundtFromTemplate(jsonString, templateName) {
    var tmplName = _str(templateName, '');
    if (!tmplName) return 'Fejl: mangler template';
    if (!getCompByName(tmplName)) return 'Fejl: template "' + tmplName + '" ikke fundet';

    var data;
    try {
      data = JSON.parse(jsonString);
      if (typeof data === 'string') data = JSON.parse(data); // handle double-encoding
    } catch (e) {
      return 'Fejl: Ugyldig JSON — ' + e.toString();
    }
    if (!data || !data.length) return 'Ingen data';

    app.beginUndoGroup('DokMotion: Batch bundter');
    var made = 0, errors = 0;
    try {
      var bundtFolder = getOrCreateFolder('02 BUNDTER', app.project.rootFolder);
      for (var i = 0; i < data.length; i++) {
        var row = _obj(data[i]);
        var navn = _str(row.navn, '');
        if (!navn) continue;
        var result = _createBundt(tmplName, navn, _str(row.titel, ''), bundtFolder);
        if (result.indexOf('Fejl:') === 0) errors++;
        else made++;
      }
      app.endUndoGroup();
      return made + ' comps oprettet' + (errors ? ', ' + errors + ' fejl' : '');
    } catch (e) {
      try { app.endUndoGroup(); } catch (_) {}
      return 'Fejl: ' + e.toString();
    }
  }

  /**
   * updateAllBundter — re-duplicates every existing BUNDT comp from the
   * (now-updated) template, preserving each comp's navn, titel, name and
   * folder location. Old comps are removed after the new ones are in place.
   */
  function updateAllBundter(args) {
    args = _obj(args);
    var templateName = _str(args.template, '');
    if (!templateName) return 'Fejl: mangler template';

    var tmpl = getCompByName(templateName);
    if (!tmpl) return 'Fejl: template "' + templateName + '" ikke fundet';

    // ── Phase 1: collect all existing BUNDT comps and their text values ──────
    var bundts = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (!(it instanceof CompItem) || it.name.indexOf('BUNDT ') !== 0) continue;
      if (it.name === templateName) continue; // skip the template itself
      bundts.push({
        comp:   it,
        name:   it.name,
        parent: it.parentFolder,
        navn:   getTextLayer(it, 'navn'),
        titel:  getTextLayer(it, 'titel')
      });
    }

    if (!bundts.length) return 'Ingen bundter fundet';

    // ── Phase 2: re-create each bundt from the updated template ─────────────
    app.beginUndoGroup('DokMotion: Opdater bundter');
    var updated = 0, errors = 0;
    try {
      for (var b = 0; b < bundts.length; b++) {
        var info = bundts[b];
        try {
          var dup = tmpl.duplicate();
          dup.name = info.name;              // keep exact same comp name
          dup.parentFolder = info.parent;    // keep same folder
          setTextLayer(dup, 'navn',  info.navn);
          setTextLayer(dup, 'titel', info.titel);
          info.comp.remove();                // remove old comp after new one is ready
          updated++;
        } catch (err) {
          errors++;
        }
      }
      app.endUndoGroup();
      return updated + ' bundter opdateret' + (errors ? ', ' + errors + ' fejl' : '');
    } catch (e) {
      try { app.endUndoGroup(); } catch (_) {}
      return 'Fejl: ' + e.toString();
    }
  }

  // ─── Projekt ────────────────────────────────────────────────────────────────

  function createFullProject(args) {
    args = _obj(args);
    var nr = _str(args.nr, '216');
    var episoder = Math.min(20, Math.max(1, _int(args.episoder, 1)));
    var grafik   = Math.min(20, Math.max(1, _int(args.grafik, 5)));

    app.beginUndoGroup('DokMotion: Opret projekt');
    try {
      var root = app.project.rootFolder;
      var f01 = getOrCreateFolder('01 COMPS',     root);
                getOrCreateFolder('02 BUNDTER',   root);
                getOrCreateFolder('03 IDENTER',   root);
                getOrCreateFolder('04 Assets',    root);
                getOrCreateFolder('05 Udvikling', root);

      for (var e = 1; e <= episoder; e++) {
        var pgmFolder = getOrCreateFolder(nr + ' PGM' + e, f01);
        for (var g = 1; g <= grafik; g++) {
          var grafName = nr + ' ' + pad2(e) + ' GRAFIK ' + pad2(g);
          if (!getCompByName(grafName)) {
            var comp = app.project.items.addComp(grafName, 1920, 1080, 1, 10, 25);
            comp.parentFolder = pgmFolder;
          }
        }
      }

      app.endUndoGroup();
      return 'Projekt ' + nr + ' oprettet (' + episoder + ' ep, ' + grafik + ' grafik)';
    } catch (e) {
      try { app.endUndoGroup(); } catch (_) {}
      return 'Fejl: ' + e.toString();
    }
  }

  // ─── Ident ──────────────────────────────────────────────────────────────────

  function createIdent(args) {
    args = _obj(args);
    var tekst = _str(args.tekst, 'Ident');

    app.beginUndoGroup('DokMotion: Opret ident');
    try {
      var identName = 'IDENT ' + tekst.toUpperCase();
      var comp = app.project.items.addComp(identName, 1920, 1080, 1, 5, 25);

      var identFolder = getOrCreateFolder('03 IDENTER', app.project.rootFolder);
      comp.parentFolder = identFolder;

      var textLayer = comp.layers.addText(tekst.toUpperCase());
      textLayer.name = 'tekst';

      app.endUndoGroup();
      return identName;
    } catch (e) {
      try { app.endUndoGroup(); } catch (_) {}
      return 'Fejl: ' + e.toString();
    }
  }

  // ─── Blur ───────────────────────────────────────────────────────────────────

  var BLUR_MATCH_NAME = 'ADBE Camera Lens Blur';
  var BLUR_RADIUS_KEY = 'ADBE CLB Iris Radius';

  /**
   * Builds the full DokBlur cinematic rig in the active comp.
   *
   * Layer stack (top → bottom):
   *   DokBlur GRAIN  — film grain (Add Grain, adjustment, 8% opacity)
   *   DokBlur VIG    — vignette (black solid, Multiply, 20% opacity)
   *   DokBlur HAL    — halation bloom (adjustment, Screen, 12% opacity)
   *   DokBlur CA     — chromatic aberration (adjustment, 22% opacity)
   *   DokBlur ADJ    — Camera Lens Blur (adjustment, Hexagon iris)
   *   [user layers]
   *   DokBlur MAP    — blur-map solid (parallelogram mask, disabled/hidden)
   *
   * All DokBlur layers are removed and recreated on each run (idempotent).
   */
  function applyBlur(args) {
    args = _obj(args);
    var radius   = Math.min(200, Math.max(1, _int(args.radius, 25)));
    var useCA    = args.ca      !== false;
    var useHAL   = args.halation !== false;
    var useVIG   = args.vignette !== false;
    var useGrain = args.grain   !== false;

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return 'Fejl: Ingen aktiv comp';

    // Diagnostic log — each step appends a token so the status bar shows
    // exactly how far execution got. v3 = version marker for cache-busting.
    var log = ['v14'];
    var blur = null;   // hoisted so MAP section can wire it

    app.beginUndoGroup('DokMotion: Anvend blur');
    try {
      var w  = comp.width;
      var h  = comp.height;
      var cx = w / 2;
      var cy = h / 2;

      // ── Cleanup ──────────────────────────────────────────────────────────────
      try {
        for (var d = comp.numLayers; d >= 1; d--) {
          try {
            var dl = comp.layer(d);
            if (dl && (dl.name === 'DokBlur MAP'  || dl.name === 'DokBlur ADJ'  ||
                       dl.name === 'DokBlur CA'   || dl.name === 'DokBlur HAL'  ||
                       dl.name === 'DokBlur VIG'  || dl.name === 'DokBlur GRAIN')) {
              dl.remove();
            }
          } catch(_e2) {}
        }
        log.push('clr');
      } catch(_e) { log.push('clrFail'); }

      // Remove any stale DokBlur MAP precomp from the project
      try {
        for (var _pi = app.project.numItems; _pi >= 1; _pi--) {
          try {
            var _pit = app.project.item(_pi);
            if (_pit instanceof CompItem && _pit.name === 'DokBlur MAP') { _pit.remove(); }
          } catch(_e2) {}
        }
      } catch(_e) {}

      // ── 1. Camera Lens Blur (ADJ) ───────────────────────────────────────────
      var adj = null;
      try { adj = comp.layers.addSolid([0,0,0], 'DokBlur ADJ', w, h, comp.pixelAspect, comp.duration); } catch(_e) { log.push('ADJfail:'+_e); }
      if (adj) {
        log.push('ADJ');
        try { adj.adjustmentLayer = true; } catch(_e) { log.push('ADJadj:'+_e); }
        try { blur = adj.Effects.addProperty(BLUR_MATCH_NAME); log.push('blr'); } catch(_e) { log.push('blrFail:'+_e); }
        if (blur) {
          // Iris Radius: try match name, display name, then property index
          try { blur.property(BLUR_RADIUS_KEY).setValue(radius); } catch(_e) {
            try { blur.property('Iris Radius').setValue(radius); } catch(_e2) {
              try { blur.property(1).setValue(radius); } catch(_e3) {}
            }
          }
          try { blur.property('ADBE CLB Iris Shape').setValue(4); } catch(_e) {}
          try { blur.property('ADBE CLB Iris Blade Curvature').setValue(50); } catch(_e) {}
          try { blur.property('ADBE CLB Diffraction Fringe').setValue(30); } catch(_e) {}
          try { blur.property('ADBE CLB Highlight Gain').setValue(2); } catch(_e) {}
          try { blur.property('ADBE CLB Highlight Threshold').setValue(210); } catch(_e) {}
        }
      }

      // ── 2. Chromatic Aberration (CA) ────────────────────────────────────────
      if (useCA) {
        var ca = null;
        try { ca = comp.layers.addSolid([0,0,0], 'DokBlur CA', w, h, comp.pixelAspect, comp.duration); } catch(_e) { log.push('CAfail:'+_e); }
        if (ca) {
          log.push('CA');
          try { ca.adjustmentLayer = true; } catch(_e) { log.push('CAadj:'+_e); }
          try { ca.property('ADBE Transform Group').property('ADBE Opacity').setValue(22); } catch(_e) {}
          var caFx = null;
          try { caFx = ca.Effects.addProperty('ADBE Channel Blur'); } catch(_e) {}
          if (caFx) {
            try { caFx.property('Red Blurriness').setValue(4); } catch(_e) {}
            try { caFx.property('Blue Blurriness').setValue(9); } catch(_e) {}
          }
        }
      } else { log.push('noCA'); }

      // ── 3. Halation (HAL) ───────────────────────────────────────────────────
      if (useHAL) {
        var hal = null;
        try { hal = comp.layers.addSolid([0,0,0], 'DokBlur HAL', w, h, comp.pixelAspect, comp.duration); } catch(_e) { log.push('HALfail:'+_e); }
        if (hal) {
          log.push('HAL');
          try { hal.adjustmentLayer = true; } catch(_e) { log.push('HALadj:'+_e); }
          try { hal.blendingMode = BlendingMode.SCREEN; } catch(_e) {}
          try { hal.property('ADBE Transform Group').property('ADBE Opacity').setValue(12); } catch(_e) {}
          var halFx = null;
          try { halFx = hal.Effects.addProperty('ADBE Gaussian Blur'); } catch(_e) {}
          if (halFx) { try { halFx.property('Blurriness').setValue(18); } catch(_e) {} }
        }
      } else { log.push('noHAL'); }

      // ── 4. Vignette (VIG) ───────────────────────────────────────────────────
      if (useVIG) {
        var vig = null;
        try { vig = comp.layers.addSolid([0,0,0], 'DokBlur VIG', w, h, comp.pixelAspect, comp.duration); } catch(_e) { log.push('VIGfail:'+_e); }
        if (vig) {
          log.push('VIG');
          try { vig.blendingMode = BlendingMode.MULTIPLY; } catch(_e) {}
          try { vig.property('ADBE Transform Group').property('ADBE Opacity').setValue(20); } catch(_e) {}
          var vigMask = null;
          try { vigMask = vig.Masks.addProperty('Mask'); } catch(_e) { log.push('vigMask:'+_e); }
          if (vigMask) {
            try {
              var vigShape = new Shape();
              vigShape.vertices    = [[cx*0.28,cy*0.28],[cx*1.72,cy*0.28],[cx*1.72,cy*1.72],[cx*0.28,cy*1.72]];
              vigShape.inTangents  = [[0,0],[0,0],[0,0],[0,0]];
              vigShape.outTangents = [[0,0],[0,0],[0,0],[0,0]];
              vigShape.closed = true;
              vigMask.property('ADBE Mask Shape').setValue(vigShape);
            } catch(_e) { log.push('vigShape:'+_e); }
            try { vigMask.property('ADBE Mask Feather').setValue([350,350]); } catch(_e) {}
            try { vigMask.maskMode = MaskMode.SUBTRACT; } catch(_e) {}
          }
        }
      } else { log.push('noVIG'); }

      // ── 5. Film Grain (GRAIN) ───────────────────────────────────────────────
      if (useGrain) {
        var grain = null;
        try { grain = comp.layers.addSolid([0,0,0], 'DokBlur GRAIN', w, h, comp.pixelAspect, comp.duration); } catch(_e) { log.push('GRAINfail:'+_e); }
        if (grain) {
          log.push('GRAIN');
          try { grain.adjustmentLayer = true; } catch(_e) { log.push('GRAINadj:'+_e); }
          // Screen-blended adjustment layer: ADBE Noise darkens only extreme highlights
          try { grain.blendingMode = BlendingMode.SCREEN; } catch(_e) {}
          try { grain.property('ADBE Transform Group').property('ADBE Opacity').setValue(22); } catch(_e) {}
          var grainFx = null;
          // Try Add Grain first; fall back to the universal ADBE Noise effect
          try { grainFx = grain.Effects.addProperty('ADBE Add Grain'); log.push('grainAG'); } catch(_ge) {
            try { grainFx = grain.Effects.addProperty('ADBE Noise'); log.push('grainNoise'); } catch(_ge2) {
              log.push('grainFail:' + _ge2.toString().substring(0,30));
            }
          }
          if (grainFx) {
            // Add Grain properties
            try { grainFx.property('Intensity').setValue(0.45); } catch(_e) {}
            try { grainFx.property('Size').setValue(1.0); }       catch(_e) {}
            try { grainFx.property('Color Amount').setValue(0); } catch(_e) {}
            // ADBE Noise fallback properties
            try { grainFx.property('Amount of Noise').setValue(6); } catch(_e) {}
            try { grainFx.property('Use Color Noise').setValue(false); } catch(_e) {}
          }
        }
      } else { log.push('noGRAIN'); }

      // ── 6. MAP precomp with Ramp gradient ────────────────────────────────────
      // KEY: Camera Lens Blur "Source" mode reads a precomp's RENDERED OUTPUT
      // (all layers + effects included), unlike a same-comp solid where effects
      // are invisible to "Source" mode. This avoids the unscriptable
      // "Effects & Masks" source-type dropdown entirely.
      // Black = no blur (sharp/focus zone), White = max blur (background).
      var mapLayer = null;
      try {
        var mapComp = app.project.items.addComp('DokBlur MAP', w, h, comp.pixelAspect, comp.duration, comp.frameRate);
        log.push('mapComp');

        // Solid inside the precomp
        var mapGrad = mapComp.layers.addSolid([0,0,0], 'Gradient', w, h, comp.pixelAspect, comp.duration);

        // Ramp: black at focus (foreground), white at background
        var rampFx = null;
        try { rampFx = mapGrad.Effects.addProperty('ADBE Ramp'); } catch(_e) {}
        if (rampFx) {
          try { rampFx.property('Start of Ramp').setValue([cx, h * 0.68]); } catch(_e) {}
          try { rampFx.property('Start Color').setValue([0, 0, 0, 1]); }   catch(_e) {}
          try { rampFx.property('End of Ramp').setValue([cx, h * 0.12]); } catch(_e) {}
          try { rampFx.property('End Color').setValue([1, 1, 1, 1]); }     catch(_e) {}
          log.push('ramp');
        }

        // Add the precomp as a layer in the main comp (top = index 1, opacity 0)
        mapLayer = comp.layers.add(mapComp);
        mapLayer.startTime = 0;
        try { mapLayer.property('ADBE Transform Group').property('ADBE Opacity').setValue(0); } catch(_e) {}
        log.push('MAP');
      } catch(_mapE) { log.push('MAPfail:'+_mapE.toString().substring(0,40)); }

      // ── 7. Wire blur map (precomp layer is the source) ───────────────────────
      if (blur && mapLayer) {
        var _mapIdx = mapLayer.index;
        log.push('mapIdx:' + _mapIdx);

        var _layerOK = false;
        if (!_layerOK) { try { blur.property('ADBE Camera Lens Blur-0010').setValue(_mapIdx); _layerOK=true; log.push('wMN'); } catch(_e) { log.push('wMN:'+_e.toString().substring(0,40)); } }
        if (!_layerOK) { try { blur.property(10).setValue(_mapIdx); _layerOK=true; log.push('wIdx'); } catch(_e) { log.push('wIdx:'+_e.toString().substring(0,40)); } }
        if (!_layerOK) { log.push('wireFail'); }
        // Source = "Source" (default) — precomp output IS the source pixels
        // Channel = Luminance (default) — black/white gradient drives blur amount
        // No Invert needed: black = no blur, white = max blur
      }

      app.endUndoGroup();
      return 'DokBlur [' + log.join('|') + '] r:' + radius;
    } catch (e) {
      try { app.endUndoGroup(); } catch (_) {}
      return 'Fejl: ' + e.toString() + ' [' + log.join('|') + ']';
    }
  }

    function applyBlurPreview(args) {
    var result = applyBlur(args);
    try { app.executeCommand(2344); } catch (e) {} // RAM preview
    return result;
  }

  // ─── Grade ──────────────────────────────────────────────────────────────────

  var GRADE_PRESET_PATH = Folder.desktop.absoluteURI + '/DokMotion Presets/DokGrade.ffx';

  function saveGrade() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return 'Fejl: Ingen aktiv comp';
    var selected = comp.selectedLayers;
    if (!selected.length) return 'Fejl: Vælg et lag';
    try {
      var folder = new Folder(Folder.desktop.absoluteURI + '/DokMotion Presets');
      if (!folder.exists) folder.create();
      var file = new File(GRADE_PRESET_PATH);
      selected[0].savePreset(file);
      return 'Grade gemt';
    } catch (e) {
      return 'Fejl: ' + e.toString();
    }
  }

  function applyGrade() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return 'Fejl: Ingen aktiv comp';
    var file = new File(GRADE_PRESET_PATH);
    if (!file.exists) return 'Fejl: Ingen gemt grade — gem et preset først';
    var selected = comp.selectedLayers;
    if (!selected.length) return 'Fejl: Vælg mindst ét lag';
    try {
      app.beginUndoGroup('DokMotion: Anvend grade');
      for (var i = 0; i < selected.length; i++) selected[i].applyPreset(file);
      app.endUndoGroup();
      return 'Grade anvendt på ' + selected.length + ' lag';
    } catch (e) {
      try { app.endUndoGroup(); } catch (_) {}
      return 'Fejl: ' + e.toString();
    }
  }

  // ─── Export ─────────────────────────────────────────────────────────────────

  var _outputPath = '';

  function browseOutputPath() {
    var folder = Folder.selectDialog('Vælg output mappe');
    if (!folder) return 'Annulleret';
    _outputPath = folder.fsName;
    return 'Mappe: ' + _outputPath;
  }

  function useProjectPath() {
    var f = app.project.file;
    if (!f) return 'Fejl: Gem projektet først';
    _outputPath = f.parent.fsName;
    return 'Mappe: ' + _outputPath;
  }

  function addToRenderQueue() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return 'Fejl: Ingen aktiv comp';
    try {
      var rqi = app.project.renderQueue.items.add(comp);
      if (_outputPath) {
        rqi.outputModule(1).file = new File(_outputPath + '/' + comp.name + '.mov');
      }
      return comp.name + ' tilføjet til render queue';
    } catch (e) {
      return 'Fejl: ' + e.toString();
    }
  }

  function renderNow() {
    var rq = app.project.renderQueue;
    if (rq.numItems === 0) {
      var msg = addToRenderQueue();
      if (msg.indexOf('Fejl:') === 0) return msg;
    }
    try {
      rq.render();
      return 'Render færdig';
    } catch (e) {
      return 'Fejl: ' + e.toString();
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    listComps:               listComps,
    createBundtFromTemplate: createBundtFromTemplate,
    batchBundtFromTemplate:  batchBundtFromTemplate,
    updateAllBundter:        updateAllBundter,
    createFullProject:       createFullProject,
    createIdent:             createIdent,
    applyBlur:               applyBlur,
    applyBlurPreview:        applyBlurPreview,
    saveGrade:               saveGrade,
    applyGrade:              applyGrade,
    browseOutputPath:        browseOutputPath,
    useProjectPath:          useProjectPath,
    addToRenderQueue:        addToRenderQueue,
    renderNow:               renderNow
  };

})();

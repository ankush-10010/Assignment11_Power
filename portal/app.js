/**
 * IDMT Feeder Protection Engineering Portal - Frontend Application
 * -----------------------------------------------------------------------------
 * Interactivity, Single-Line Diagram, Real-time Charts, and Dynamic Simulation
 * Integrates seamlessly with ProtectionEngine.
 */

(function () {
  'use strict';

  // Ensure ProtectionEngine is available
  const Engine = window.ProtectionEngine;
  if (!Engine) {
    console.error('ProtectionEngine not found! Please check protection_engine.js.');
    return;
  }

  // App State
  const state = {
    params: Object.assign({}, Engine.DEFAULT_PARAMS),
    analysis: null,
    activeTab: 'tab-tcc',
    faultLocation: 9.0, // km from Bus 1
    faultType: '3ph',   // '3ph' or '2ph'
    theme: 'dark',
    // Simulation playback state
    sim: {
      running: false,
      currentTime: 0.0,
      tf: 0.5,
      cb2Fail: false,
      speed: 1.0,
      animId: null,
      lastTimestamp: 0,
      data: null
    }
  };

  // Presets definition
  const PRESETS = {
    default: Object.assign({}, Engine.DEFAULT_PARAMS),
    weak_grid: Object.assign({}, Engine.DEFAULT_PARAMS, {
      Ssc: 100e6 // 100 MVA
    }),
    strong_grid: Object.assign({}, Engine.DEFAULT_PARAMS, {
      Ssc: 500e6 // 500 MVA
    }),
    heavy_load: Object.assign({}, Engine.DEFAULT_PARAMS, {
      S2: 5.0e6,
      S3: 6.0e6,
      CT1: 800,
      CT2: 400
    }),
    long_feeder: Object.assign({}, Engine.DEFAULT_PARAMS, {
      L1: 10.0,
      L2: 8.0
    })
  };

  // Chart instances
  const charts = {
    tcc: null,
    sweepFault: null,
    sweepTimes: null,
    simCurrents: null,
    simAcc: null,
    simTrips: null
  };

  // Canvas Fallback Renderers (active if Chart.js is not loaded or offline)
  const isChartJsAvailable = typeof window.Chart === 'function';
  const Chart = window.Chart;

  /**
   * DOM Elements Cache
   */
  let dom = {};

  function initDomElements() {
    dom = {
      // Inputs
      presetSelect: document.getElementById('preset-select'),
      btnReset: document.getElementById('btn-reset'),
      btnExportMatlab: document.getElementById('btn-export-matlab'),
      btnExportCsv: document.getElementById('btn-export-csv'),
      btnPrint: document.getElementById('btn-print'),
      btnThemeToggle: document.getElementById('btn-theme-toggle'),
      themeIcon: document.getElementById('theme-icon'),
      
      // Sliders & Number inputs
      sliderVll: document.getElementById('slider-vll'),
      numVll: document.getElementById('num-vll'),
      dispVll: document.getElementById('disp-vll'),

      sliderSsc: document.getElementById('slider-ssc'),
      numSsc: document.getElementById('num-ssc'),
      dispSsc: document.getElementById('disp-ssc'),

      sliderR: document.getElementById('slider-r'),
      numR: document.getElementById('num-r'),
      dispR: document.getElementById('disp-r'),

      sliderX: document.getElementById('slider-x'),
      numX: document.getElementById('num-x'),
      dispX: document.getElementById('disp-x'),

      sliderL1: document.getElementById('slider-l1'),
      numL1: document.getElementById('num-l1'),
      dispL1: document.getElementById('disp-l1'),

      sliderL2: document.getElementById('slider-l2'),
      numL2: document.getElementById('num-l2'),
      dispL2: document.getElementById('disp-l2'),

      sliderS2: document.getElementById('slider-s2'),
      numS2: document.getElementById('num-s2'),
      dispS2: document.getElementById('disp-s2'),

      sliderS3: document.getElementById('slider-s3'),
      numS3: document.getElementById('num-s3'),
      dispS3: document.getElementById('disp-s3'),

      sliderCt1: document.getElementById('slider-ct1'),
      numCt1: document.getElementById('num-ct1'),
      dispCt1: document.getElementById('disp-ct1'),

      sliderCt2: document.getElementById('slider-ct2'),
      numCt2: document.getElementById('num-ct2'),
      dispCt2: document.getElementById('disp-ct2'),

      sliderOlf: document.getElementById('slider-olf'),
      numOlf: document.getElementById('num-olf'),
      dispOlf: document.getElementById('disp-olf'),

      sliderTcb: document.getElementById('slider-tcb'),
      numTcb: document.getElementById('num-tcb'),
      dispTcb: document.getElementById('disp-tcb'),

      sliderCti: document.getElementById('slider-cti'),
      numCti: document.getElementById('num-cti'),
      dispCti: document.getElementById('disp-cti'),

      curveStandardSelect: document.getElementById('curve-standard-select'),
      sliderTms2: document.getElementById('slider-tms2'),
      numTms2: document.getElementById('num-tms2'),
      dispTms2: document.getElementById('disp-tms2'),

      checkAutoTms1: document.getElementById('check-auto-tms1'),
      manualTms1Container: document.getElementById('manual-tms1-container'),
      sliderTms1: document.getElementById('slider-tms1'),
      numTms1: document.getElementById('num-tms1'),
      dispTms1: document.getElementById('disp-tms1'),

      // SLD
      sldSvg: document.getElementById('sld-svg'),
      sldSourceSsc: document.getElementById('sld-source-ssc'),
      sldLine1Info: document.getElementById('sld-line1-info'),
      sldLine2Info: document.getElementById('sld-line2-info'),
      sldLoad2Val: document.getElementById('sld-load2-val'),
      sldLoad3Val: document.getElementById('sld-load3-val'),
      cb1Box: document.getElementById('cb1-box'),
      cb1Text: document.getElementById('cb1-text'),
      cb2Box: document.getElementById('cb2-box'),
      cb2Text: document.getElementById('cb2-text'),
      sldR1Status: document.getElementById('sld-r1-status'),
      sldR2Status: document.getElementById('sld-r2-status'),
      sldFaultMarker: document.getElementById('sld-fault-marker'),
      sldFaultText: document.getElementById('sld-fault-text'),
      faultDistanceSlider: document.getElementById('fault-distance-slider'),
      faultDistanceDisplay: document.getElementById('fault-distance-display'),
      faultTypeSelect: document.getElementById('fault-type-select'),

      // Scenarios
      btnScenNormal: document.getElementById('btn-scen-normal'),
      btnScenBus2: document.getElementById('btn-scen-bus2'),
      btnScenBus3_3ph: document.getElementById('btn-scen-bus3-3ph'),
      btnScenBus3_2ph: document.getElementById('btn-scen-bus3-2ph'),
      btnScenMidLine2: document.getElementById('btn-scen-midline2'),
      btnScenBackupTest: document.getElementById('btn-scen-backup-test'),

      // KPI cards
      kpiIr1: document.getElementById('kpi-ir1'),
      kpiIr2: document.getElementById('kpi-ir2'),
      kpiIl2: document.getElementById('kpi-il2'),
      kpiIf3Bus2: document.getElementById('kpi-if3-bus2'),
      kpiIf3Bus3: document.getElementById('kpi-if3-bus3'),
      kpiIf2Bus3: document.getElementById('kpi-if2-bus3'),
      kpiPs1: document.getElementById('kpi-ps1'),
      kpiPs2: document.getElementById('kpi-ps2'),
      kpiTmsSummary: document.getElementById('kpi-tms-summary'),
      kpiT2Bus3: document.getElementById('kpi-t2-bus3'),
      kpiT1Bus3: document.getElementById('kpi-t1-bus3'),
      kpiCtiBus3: document.getElementById('kpi-cti-bus3'),

      // Coordination banner
      coordinationBanner: document.getElementById('coordination-banner'),
      coordBadge: document.getElementById('coord-badge'),
      coordText: document.getElementById('coord-text'),
      criticalPointText: document.getElementById('critical-point-text'),

      // Results Table
      tbIfBus2: document.getElementById('tb-if-bus2'),
      tbT2Bus2: document.getElementById('tb-t2-bus2'),
      tbT1Bus2: document.getElementById('tb-t1-bus2'),
      tbCtiBus2: document.getElementById('tb-cti-bus2'),

      tbIfBus3_3ph: document.getElementById('tb-if-bus3-3ph'),
      tbT2Bus3_3ph: document.getElementById('tb-t2-bus3-3ph'),
      tbT1Bus3_3ph: document.getElementById('tb-t1-bus3-3ph'),
      tbCtiBus3_3ph: document.getElementById('tb-cti-bus3-3ph'),

      tbIfBus3_2ph: document.getElementById('tb-if-bus3-2ph'),
      tbT2Bus3_2ph: document.getElementById('tb-t2-bus3-2ph'),
      tbT1Bus3_2ph: document.getElementById('tb-t1-bus3-2ph'),
      tbCtiBus3_2ph: document.getElementById('tb-cti-bus3-2ph'),

      tbCustomLoc: document.getElementById('tb-custom-loc'),
      tbCustomType: document.getElementById('tb-custom-type'),
      tbCustomIf: document.getElementById('tb-custom-if'),
      tbCustomT2: document.getElementById('tb-custom-t2'),
      tbCustomT1: document.getElementById('tb-custom-t1'),
      tbCustomCti: document.getElementById('tb-custom-cti'),
      tbCustomStatus: document.getElementById('tb-custom-status'),

      // Checklist
      chkLoad: document.getElementById('chk-load'),
      chkSens: document.getElementById('chk-sens'),
      chkCoord: document.getElementById('chk-coord'),
      chkDisk: document.getElementById('chk-disk'),

      // Simulation controls
      btnSimPlay: document.getElementById('btn-sim-play'),
      btnSimPause: document.getElementById('btn-sim-pause'),
      btnSimStep: document.getElementById('btn-sim-step'),
      btnSimReset: document.getElementById('btn-sim-reset'),
      simTimeVal: document.getElementById('sim-time-val'),
      simTfSlider: document.getElementById('sim-tf-slider'),
      simTfDisp: document.getElementById('sim-tf-disp'),
      simCb2Fail: document.getElementById('sim-cb2-fail'),
      simSpeedSelect: document.getElementById('sim-speed-select'),

      // Modal
      exportModal: document.getElementById('export-modal'),
      matlabCodeArea: document.getElementById('matlab-code-area'),
      btnCloseModal: document.getElementById('btn-close-modal'),
      btnCopyMatlab: document.getElementById('btn-copy-matlab'),
      btnDownloadMFile: document.getElementById('btn-download-m-file')
    };
  }

  /**
   * Bind input listeners with bidirectional synchronization
   */
  function bindInputs() {
    function linkInput(slider, num, disp, paramKey, transform = (v) => v, unit = '') {
      function updateVal(val) {
        val = Number(val);
        state.params[paramKey] = transform(val);
        slider.value = val;
        num.value = val;
        if (disp) disp.textContent = val + (unit ? ' ' + unit : '');
        recalculateAndRender();
      }

      slider.addEventListener('input', (e) => updateVal(e.target.value));
      num.addEventListener('change', (e) => updateVal(e.target.value));
    }

    linkInput(dom.sliderVll, dom.numVll, dom.dispVll, 'V_LL', (v) => v * 1000, 'kV');
    linkInput(dom.sliderSsc, dom.numSsc, dom.dispSsc, 'Ssc', (v) => v * 1e6, 'MVA');
    linkInput(dom.sliderR, dom.numR, dom.dispR, 'z1_r', (v) => v, 'Ω/km');
    linkInput(dom.sliderX, dom.numX, dom.dispX, 'z1_x', (v) => v, 'Ω/km');
    linkInput(dom.sliderL1, dom.numL1, dom.dispL1, 'L1', (v) => {
      dom.faultDistanceSlider.max = v + state.params.L2;
      return v;
    }, 'km');
    linkInput(dom.sliderL2, dom.numL2, dom.dispL2, 'L2', (v) => {
      dom.faultDistanceSlider.max = state.params.L1 + v;
      return v;
    }, 'km');
    linkInput(dom.sliderS2, dom.numS2, dom.dispS2, 'S2', (v) => v * 1e6, 'MVA');
    linkInput(dom.sliderS3, dom.numS3, dom.dispS3, 'S3', (v) => v * 1e6, 'MVA');
    linkInput(dom.sliderCt1, dom.numCt1, dom.dispCt1, 'CT1', (v) => v, 'A');
    linkInput(dom.sliderCt2, dom.numCt2, dom.dispCt2, 'CT2', (v) => v, 'A');
    linkInput(dom.sliderOlf, dom.numOlf, dom.dispOlf, 'OLF', (v) => v, '');
    linkInput(dom.sliderTcb, dom.numTcb, dom.dispTcb, 'Tcb', (v) => v, 's');
    linkInput(dom.sliderCti, dom.numCti, dom.dispCti, 'CTI', (v) => v, 's');
    linkInput(dom.sliderTms2, dom.numTms2, dom.dispTms2, 'TMS2', (v) => v, '');
    linkInput(dom.sliderTms1, dom.numTms1, dom.dispTms1, 'TMS1_manual', (v) => v, '');

    // Curve selection
    dom.curveStandardSelect.addEventListener('change', (e) => {
      state.params.curveType = e.target.value.toUpperCase();
      recalculateAndRender();
    });

    // Auto / Manual TMS1 toggle
    dom.checkAutoTms1.addEventListener('change', (e) => {
      state.params.TMS1_auto = e.target.checked;
      dom.manualTms1Container.style.display = e.target.checked ? 'none' : 'flex';
      recalculateAndRender();
    });

    // Presets
    dom.presetSelect.addEventListener('change', (e) => {
      const preset = PRESETS[e.target.value] || PRESETS.default;
      applyPreset(preset);
    });

    dom.btnReset.addEventListener('click', () => {
      dom.presetSelect.value = 'default';
      applyPreset(PRESETS.default);
    });

    // Fault Slider & Type
    dom.faultDistanceSlider.addEventListener('input', (e) => {
      setFaultLocation(Number(e.target.value));
    });

    dom.faultTypeSelect.addEventListener('change', (e) => {
      state.faultType = e.target.value;
      recalculateAndRender();
    });

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.plot-pane').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        document.getElementById(targetId).classList.add('active');
        state.activeTab = targetId;
        renderActivePlot();
      });
    });

    // Scenarios
    dom.btnScenNormal.addEventListener('click', () => {
      setFaultLocation(state.params.L1 + state.params.L2);
      state.sim.cb2Fail = false;
      dom.simCb2Fail.checked = false;
      setBreakerVisuals('CLOSED', 'CLOSED');
    });

    dom.btnScenBus2.addEventListener('click', () => {
      state.faultType = '3ph';
      dom.faultTypeSelect.value = '3ph';
      setFaultLocation(state.params.L1);
    });

    dom.btnScenBus3_3ph.addEventListener('click', () => {
      state.faultType = '3ph';
      dom.faultTypeSelect.value = '3ph';
      setFaultLocation(state.params.L1 + state.params.L2);
    });

    dom.btnScenBus3_2ph.addEventListener('click', () => {
      state.faultType = '2ph';
      dom.faultTypeSelect.value = '2ph';
      setFaultLocation(state.params.L1 + state.params.L2);
    });

    dom.btnScenMidLine2.addEventListener('click', () => {
      setFaultLocation(state.params.L1 + state.params.L2 * 0.5);
    });

    dom.btnScenBackupTest.addEventListener('click', () => {
      setFaultLocation(state.params.L1 + state.params.L2);
      state.sim.cb2Fail = true;
      dom.simCb2Fail.checked = true;
      // Switch to simulation tab
      document.querySelector('[data-tab="tab-timedomain"]').click();
      resetSimulation();
      startSimulation();
    });

    // Interactive SLD Clicks & Dragging
    let isDraggingFault = false;

    function handleSldPointerMove(clientX, clientY) {
      const pt = dom.sldSvg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const svgP = pt.matrixTransform(dom.sldSvg.getScreenCTM().inverse());

      // Line 1 coordinate span: 195 to 520
      // Line 2 coordinate span: 595 to 880
      if (svgP.x <= 195) {
        setFaultLocation(0);
      } else if (svgP.x >= 195 && svgP.x <= 520) {
        const frac = (svgP.x - 195) / (520 - 195);
        const dist = frac * state.params.L1;
        setFaultLocation(dist);
      } else if (svgP.x > 520 && svgP.x < 595) {
        setFaultLocation(state.params.L1);
      } else if (svgP.x >= 595 && svgP.x <= 880) {
        const frac = (svgP.x - 595) / (880 - 595);
        const dist = state.params.L1 + frac * state.params.L2;
        setFaultLocation(dist);
      } else if (svgP.x > 880) {
        setFaultLocation(state.params.L1 + state.params.L2);
      }
    }

    dom.sldSvg.addEventListener('click', (e) => {
      handleSldPointerMove(e.clientX, e.clientY);
    });

    dom.sldFaultMarker.addEventListener('mousedown', (e) => {
      isDraggingFault = true;
      dom.sldFaultMarker.style.cursor = 'grabbing';
      e.stopPropagation();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingFault) return;
      handleSldPointerMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingFault) {
        isDraggingFault = false;
        dom.sldFaultMarker.style.cursor = 'grab';
      }
    });

    // Touch support for dragging
    dom.sldFaultMarker.addEventListener('touchstart', (e) => {
      isDraggingFault = true;
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!isDraggingFault || !e.touches[0]) return;
      handleSldPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDraggingFault = false;
    });

    // Time domain controls
    dom.btnSimPlay.addEventListener('click', startSimulation);
    dom.btnSimPause.addEventListener('click', pauseSimulation);
    dom.btnSimStep.addEventListener('click', stepSimulation);
    dom.btnSimReset.addEventListener('click', resetSimulation);
    dom.simTfSlider.addEventListener('input', (e) => {
      state.sim.tf = Number(e.target.value);
      dom.simTfDisp.textContent = state.sim.tf.toFixed(2) + ' s';
      resetSimulation();
    });
    dom.simCb2Fail.addEventListener('change', (e) => {
      state.sim.cb2Fail = e.target.checked;
      resetSimulation();
    });
    dom.simSpeedSelect.addEventListener('change', (e) => {
      state.sim.speed = Number(e.target.value);
    });

    // MATLAB Export Modal
    dom.btnExportMatlab.addEventListener('click', () => {
      const code = Engine.exportToMatlab(state.params);
      dom.matlabCodeArea.value = code;
      dom.exportModal.classList.add('active');
    });

    dom.btnCloseModal.addEventListener('click', () => {
      dom.exportModal.classList.remove('active');
    });

    dom.btnCopyMatlab.addEventListener('click', () => {
      navigator.clipboard.writeText(dom.matlabCodeArea.value).then(() => {
        dom.btnCopyMatlab.textContent = '✅ Copied!';
        setTimeout(() => { dom.btnCopyMatlab.textContent = '📋 Copy Code'; }, 1500);
      });
    });

    dom.btnDownloadMFile.addEventListener('click', () => {
      const blob = new Blob([dom.matlabCodeArea.value], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Assignment11_IDMT_Simulation.m';
      a.click();
      URL.revokeObjectURL(url);
    });

    // CSV Export
    dom.btnExportCsv.addEventListener('click', () => {
      if (!state.analysis) return;
      const csv = Engine.exportSweepToCSV(state.analysis.sweep);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'feeder_protection_sweep_data.csv';
      a.click();
      URL.revokeObjectURL(url);
    });

    // Print
    dom.btnPrint.addEventListener('click', () => {
      window.print();
    });

    // Theme toggle
    dom.btnThemeToggle.addEventListener('click', () => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      state.theme = newTheme;
      document.documentElement.setAttribute('data-theme', newTheme);
      dom.themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
      renderActivePlot();
    });
  }

  /**
   * Set and synchronize fault location
   */
  function setFaultLocation(km) {
    const totalLength = state.params.L1 + state.params.L2;
    km = Math.max(0, Math.min(km, totalLength));
    state.faultLocation = km;
    dom.faultDistanceSlider.value = km;

    let locLabel = km.toFixed(1) + ' km';
    if (Math.abs(km - state.params.L1) < 0.05) locLabel += ' (Bus 2)';
    else if (Math.abs(km - totalLength) < 0.05) locLabel += ' (Bus 3)';
    else if (km < state.params.L1) locLabel += ' (Line 1)';
    else locLabel += ' (Line 2)';

    dom.faultDistanceDisplay.textContent = locLabel;
    dom.sldFaultText.textContent = 'FAULT: ' + km.toFixed(1) + ' km';

    // Position SVG marker
    // Line 1: 195 to 520
    // Line 2: 595 to 880
    let svgX;
    if (km <= state.params.L1) {
      const f = km / state.params.L1;
      svgX = 195 + f * (520 - 195);
    } else {
      const f = (km - state.params.L1) / state.params.L2;
      svgX = 595 + f * (880 - 595);
    }
    dom.sldFaultMarker.setAttribute('transform', `translate(${svgX}, 120)`);

    recalculateAndRender();
  }

  /**
   * Apply a preset parameter set
   */
  function applyPreset(p) {
    state.params = Object.assign({}, p);

    // Update input values
    dom.sliderVll.value = state.params.V_LL / 1000;
    dom.numVll.value = state.params.V_LL / 1000;
    dom.dispVll.textContent = (state.params.V_LL / 1000).toFixed(1) + ' kV';

    dom.sliderSsc.value = state.params.Ssc / 1e6;
    dom.numSsc.value = state.params.Ssc / 1e6;
    dom.dispSsc.textContent = (state.params.Ssc / 1e6).toFixed(0) + ' MVA';

    dom.sliderR.value = state.params.z1_r;
    dom.numR.value = state.params.z1_r;
    dom.dispR.textContent = state.params.z1_r.toFixed(2) + ' Ω/km';

    dom.sliderX.value = state.params.z1_x;
    dom.numX.value = state.params.z1_x;
    dom.dispX.textContent = state.params.z1_x.toFixed(2) + ' Ω/km';

    dom.sliderL1.value = state.params.L1;
    dom.numL1.value = state.params.L1;
    dom.dispL1.textContent = state.params.L1.toFixed(1) + ' km';

    dom.sliderL2.value = state.params.L2;
    dom.numL2.value = state.params.L2;
    dom.dispL2.textContent = state.params.L2.toFixed(1) + ' km';

    dom.sliderS2.value = state.params.S2 / 1e6;
    dom.numS2.value = state.params.S2 / 1e6;
    dom.dispS2.textContent = (state.params.S2 / 1e6).toFixed(1) + ' MVA';

    dom.sliderS3.value = state.params.S3 / 1e6;
    dom.numS3.value = state.params.S3 / 1e6;
    dom.dispS3.textContent = (state.params.S3 / 1e6).toFixed(1) + ' MVA';

    dom.sliderCt1.value = state.params.CT1;
    dom.numCt1.value = state.params.CT1;
    dom.dispCt1.textContent = state.params.CT1 + ' A';

    dom.sliderCt2.value = state.params.CT2;
    dom.numCt2.value = state.params.CT2;
    dom.dispCt2.textContent = state.params.CT2 + ' A';

    dom.sliderOlf.value = state.params.OLF;
    dom.numOlf.value = state.params.OLF;
    dom.dispOlf.textContent = state.params.OLF.toFixed(2);

    dom.sliderTcb.value = state.params.Tcb;
    dom.numTcb.value = state.params.Tcb;
    dom.dispTcb.textContent = state.params.Tcb.toFixed(2) + ' s';

    dom.sliderCti.value = state.params.CTI;
    dom.numCti.value = state.params.CTI;
    dom.dispCti.textContent = state.params.CTI.toFixed(2) + ' s';

    dom.sliderTms2.value = state.params.TMS2;
    dom.numTms2.value = state.params.TMS2;
    dom.dispTms2.textContent = state.params.TMS2.toFixed(3);

    dom.checkAutoTms1.checked = state.params.TMS1_auto !== false;
    dom.manualTms1Container.style.display = dom.checkAutoTms1.checked ? 'none' : 'flex';

    dom.faultDistanceSlider.max = state.params.L1 + state.params.L2;
    setFaultLocation(state.params.L1 + state.params.L2);
  }

  /**
   * Recalculate protection models and update all UI elements
   */
  function recalculateAndRender() {
    state.analysis = Engine.runFullAnalysis(state.params);
    updateDashboardKPIs();
    updateSLDReadouts();
    updateVerificationTable();
    updateVerificationChecklist();
    renderActivePlot();
  }

  /**
   * Update Top Metric Cards & Coordination Status
   */
  function updateDashboardKPIs() {
    const res = state.analysis;
    const sys = res.system;
    const set = res.settings;
    const crd = res.coordination;

    dom.kpiIr1.textContent = sys.I_R1.toFixed(1);
    dom.kpiIr2.textContent = sys.I_R2.toFixed(1) + ' A';
    dom.kpiIl2.textContent = sys.IL2.toFixed(1) + ' A';

    dom.kpiIf3Bus2.textContent = Math.round(sys.If3_bus2);
    dom.kpiIf3Bus3.textContent = Math.round(sys.If3_bus3) + ' A';
    dom.kpiIf2Bus3.textContent = Math.round(sys.If2_bus3) + ' A';

    dom.kpiPs1.textContent = set.PS1.toFixed(2);
    dom.kpiPs2.textContent = `PS = ${set.PS2.toFixed(2)} (Ipu ${set.Ipu2.toFixed(0)} A)`;
    dom.kpiTmsSummary.textContent = `TMS2=${crd.TMS2.toFixed(3)}, TMS1=${crd.TMS1.toFixed(3)}`;

    dom.kpiT2Bus3.textContent = crd.t2_bus3.toFixed(3);
    dom.kpiT1Bus3.textContent = crd.t1_bus3.toFixed(3) + ' s';
    dom.kpiCtiBus3.textContent = crd.CTI_bus3.toFixed(3) + ' s';

    // Coordination Status Banner
    const isPass = crd.isCoordinated;
    dom.coordinationBanner.className = `coordination-status-banner ${isPass ? 'pass' : 'fail'}`;
    dom.coordBadge.className = `status-badge-lg ${isPass ? 'pass' : 'fail'}`;
    dom.coordBadge.textContent = isPass ? 'COORDINATION: PASS' : 'COORDINATION: FAIL';

    const minCtiVal = res.sweep.minCTI;
    if (isPass) {
      dom.coordText.innerHTML = `Minimum CTI across Line 2 = <strong>${minCtiVal.toFixed(3)} s</strong> (Required CTI = ${state.params.CTI.toFixed(3)} s). Selective tripping guaranteed for all faults!`;
    } else {
      dom.coordText.innerHTML = `Minimum CTI across Line 2 = <strong style="color:var(--accent-red);">${minCtiVal.toFixed(3)} s</strong> &lt; Required CTI (${state.params.CTI.toFixed(3)} s). Increase TMS1 to restore discrimination margin!`;
    }

    dom.criticalPointText.textContent = `Critical coordination point: Just beyond R2 (If = ${Math.round(crd.I_coord)} A) | t2 = ${crd.t2_coord.toFixed(3)}s, t1 = ${crd.t1_coord.toFixed(3)}s, Margin = ${crd.CTI_coord.toFixed(3)}s`;
  }

  /**
   * Update SLD Labels and Flow Indicators
   */
  function updateSLDReadouts() {
    const sys = state.analysis.system;
    dom.sldSourceSsc.textContent = (state.params.Ssc / 1e6).toFixed(0) + ' MVA';
    dom.sldLine1Info.textContent = `Line 1: ${state.params.L1.toFixed(1)} km`;
    dom.sldLine2Info.textContent = `Line 2: ${state.params.L2.toFixed(1)} km`;
    dom.sldLoad2Val.textContent = `${(state.params.S2 / 1e6).toFixed(1)} MVA (${sys.IL2.toFixed(0)} A)`;
    dom.sldLoad3Val.textContent = `${(state.params.S3 / 1e6).toFixed(1)} MVA (${sys.IL3.toFixed(0)} A)`;
  }

  function setBreakerVisuals(cb1State, cb2State) {
    if (cb1State === 'OPEN') {
      dom.cb1Box.setAttribute('fill', '#ef4444');
      dom.cb1Text.textContent = 'OPEN';
      dom.sldR1Status.textContent = 'TRIPPED';
      dom.sldR1Status.style.fill = '#ef4444';
    } else {
      dom.cb1Box.setAttribute('fill', '#10b981');
      dom.cb1Text.textContent = 'CB1';
      dom.sldR1Status.textContent = 'CLOSED';
      dom.sldR1Status.style.fill = '#94a3b8';
    }

    if (cb2State === 'OPEN') {
      dom.cb2Box.setAttribute('fill', '#ef4444');
      dom.cb2Text.textContent = 'OPEN';
      dom.sldR2Status.textContent = 'TRIPPED';
      dom.sldR2Status.style.fill = '#ef4444';
    } else {
      dom.cb2Box.setAttribute('fill', '#10b981');
      dom.cb2Text.textContent = 'CB2';
      dom.sldR2Status.textContent = 'CLOSED';
      dom.sldR2Status.style.fill = '#94a3b8';
    }
  }

  /**
   * Update Verification Table matching MATLAB Table
   */
  function updateVerificationTable() {
    const res = state.analysis;
    const sys = res.system;
    const crd = res.coordination;

    dom.tbIfBus2.textContent = Math.round(sys.If3_bus2) + ' A';
    dom.tbT2Bus2.textContent = crd.t2_coord.toFixed(3) + ' s';
    dom.tbT1Bus2.textContent = crd.t1_coord.toFixed(3) + ' s';
    dom.tbCtiBus2.textContent = crd.CTI_coord.toFixed(3) + ' s';

    dom.tbIfBus3_3ph.textContent = Math.round(sys.If3_bus3) + ' A';
    dom.tbT2Bus3_3ph.textContent = crd.t2_bus3.toFixed(3) + ' s';
    dom.tbT1Bus3_3ph.textContent = crd.t1_bus3.toFixed(3) + ' s';
    dom.tbCtiBus3_3ph.textContent = crd.CTI_bus3.toFixed(3) + ' s';

    dom.tbIfBus3_2ph.textContent = Math.round(sys.If2_bus3) + ' A';
    dom.tbT2Bus3_2ph.textContent = crd.t2_bus3_2ph.toFixed(3) + ' s';
    dom.tbT1Bus3_2ph.textContent = crd.t1_bus3_2ph.toFixed(3) + ' s';
    dom.tbCtiBus3_2ph.textContent = crd.CTI_bus3_2ph.toFixed(3) + ' s';

    // Active Slider Fault
    const flt = Engine.calculateFaultAtDistance(state.faultLocation, state.params);
    const IfVal = state.faultType === '2ph' ? flt.If2 : flt.If3;
    const isLine2 = flt.line === 2;

    const t2Val = isLine2 ? Engine.idmt(IfVal, res.settings.Ipu2, crd.TMS2, res.curve.k, res.curve.a) : Infinity;
    const t1Val = Engine.idmt(IfVal, res.settings.Ipu1, crd.TMS1, res.curve.k, res.curve.a);
    const ctiVal = isFinite(t2Val) && isFinite(t1Val) ? t1Val - t2Val : null;

    dom.tbCustomLoc.textContent = `Active Slider Location (${state.faultLocation.toFixed(1)} km, ${isLine2 ? 'Line 2' : 'Line 1'})`;
    dom.tbCustomType.textContent = state.faultType === '2ph' ? '2-phase (Min)' : '3-phase (Max)';
    dom.tbCustomIf.textContent = Math.round(IfVal) + ' A';
    dom.tbCustomT2.textContent = isFinite(t2Val) ? t2Val.toFixed(3) + ' s' : 'N/A (Line 1)';
    dom.tbCustomT1.textContent = isFinite(t1Val) ? t1Val.toFixed(3) + ' s' : 'Inf';
    dom.tbCustomCti.textContent = ctiVal !== null ? ctiVal.toFixed(3) + ' s' : 'N/A';

    if (!isLine2) {
      dom.tbCustomStatus.textContent = 'LINE 1 PRIMARY (R1)';
      dom.tbCustomStatus.className = 'badge badge-blue';
    } else if (ctiVal !== null && ctiVal >= state.params.CTI - 1e-9) {
      dom.tbCustomStatus.textContent = 'SELECTIVE (PASS)';
      dom.tbCustomStatus.className = 'badge badge-green';
    } else {
      dom.tbCustomStatus.textContent = 'UNSELECTIVE (FAIL)';
      dom.tbCustomStatus.className = 'badge badge-red';
    }
  }

  /**
   * Update Checklist Items
   */
  function updateVerificationChecklist() {
    const res = state.analysis;
    const set = res.settings;
    const sys = res.system;
    const crd = res.coordination;

    dom.chkLoad.textContent = `Ipu1 (${set.Ipu1.toFixed(0)} A) > 1.25×${sys.I_R1.toFixed(0)} A and Ipu2 (${set.Ipu2.toFixed(0)} A) > 1.25×${sys.I_R2.toFixed(0)} A. Relays do not trip on normal load.`;
    dom.chkSens.textContent = `Ipu1 (${set.Ipu1.toFixed(0)} A) and Ipu2 (${set.Ipu2.toFixed(0)} A) are below the weakest 2-ph fault current (${Math.round(sys.If2_bus3)} A at Bus 3).`;
    dom.chkCoord.textContent = `Checked at Bus 2 end of Line 2. Selected TMS1 = ${crd.TMS1.toFixed(3)} provides min CTI = ${res.sweep.minCTI.toFixed(3)} s (Target ${state.params.CTI.toFixed(2)} s).`;
    dom.chkDisk.textContent = `Bus 3 fault: R2 trips in ${crd.t2_bus3.toFixed(3)} s. R1 disk travel peaks at ${(res.simulation.max_acc1 * 100).toFixed(0)}% before fault is cleared.`;
  }

  /**
   * Render Active Plot
   */
  function renderActivePlot() {
    if (!state.analysis) return;

    if (state.activeTab === 'tab-tcc') {
      renderTCCPlot();
    } else if (state.activeTab === 'tab-sweep') {
      renderSweepPlots();
    } else if (state.activeTab === 'tab-timedomain') {
      renderSimulationPlots();
    }
  }

  /**
   * Render Plot 1: Time-Current Characteristics (TCC)
   */
  function renderTCCPlot() {
    const canvas = document.getElementById('chart-tcc');
    if (!canvas) return;

    const tcc = state.analysis.tcc;
    const sys = state.analysis.system;
    const crd = state.analysis.coordination;
    const textColor = state.theme === 'dark' ? '#f8fafc' : '#0f172a';
    const gridColor = state.theme === 'dark' ? '#334155' : '#cbd5e1';

    // Build dataset points for log-log scale
    const r1Data = [];
    const r2Data = [];
    for (let i = 0; i < tcc.current.length; i++) {
      if (tcc.t1[i] !== null) r1Data.push({ x: tcc.current[i], y: tcc.t1[i] });
      if (tcc.t2[i] !== null) r2Data.push({ x: tcc.current[i], y: tcc.t2[i] });
    }

    // Dynamic fault markers on TCC
    const faultMarkers = [
      { x: sys.If3_bus2, y: crd.t2_coord, label: 'Bus 2 Fault (R2)' },
      { x: sys.If3_bus2, y: crd.t1_coord, label: 'Bus 2 Fault (R1 Backup)' },
      { x: sys.If3_bus3, y: crd.t2_bus3, label: 'Bus 3 3-ph (R2)' },
      { x: sys.If3_bus3, y: crd.t1_bus3, label: 'Bus 3 3-ph (R1)' },
      { x: sys.If2_bus3, y: crd.t2_bus3_2ph, label: 'Bus 3 2-ph (R2)' },
      { x: sys.If2_bus3, y: crd.t1_bus3_2ph, label: 'Bus 3 2-ph (R1)' }
    ];

    if (isChartJsAvailable) {
      if (charts.tcc) charts.tcc.destroy();

      charts.tcc = new Chart(canvas, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'R1 (Backup)',
              data: r1Data,
              borderColor: '#3b82f6',
              backgroundColor: '#3b82f6',
              borderWidth: 2.5,
              pointRadius: 0,
              tension: 0.2
            },
            {
              label: 'R2 (Primary)',
              data: r2Data,
              borderColor: '#ef4444',
              backgroundColor: '#ef4444',
              borderWidth: 2.5,
              pointRadius: 0,
              tension: 0.2
            },
            {
              label: 'Fault Operating Points',
              data: faultMarkers,
              type: 'scatter',
              borderColor: '#f59e0b',
              backgroundColor: '#f59e0b',
              pointRadius: 6,
              pointHoverRadius: 8,
              showLine: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'logarithmic',
              title: { display: true, text: 'Current [A]', color: textColor, font: { weight: 'bold' } },
              grid: { color: gridColor },
              ticks: { color: textColor }
            },
            y: {
              type: 'logarithmic',
              title: { display: true, text: 'Operating Time [s]', color: textColor, font: { weight: 'bold' } },
              grid: { color: gridColor },
              ticks: { color: textColor },
              min: 0.1,
              max: 20
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (context) {
                  const pt = context.raw;
                  return `${context.dataset.label}: ${Math.round(pt.x)} A, ${Number(pt.y).toFixed(3)} s`;
                }
              }
            }
          }
        }
      });
    } else {
      drawCanvasFallbackLogLog(canvas, r1Data, r2Data, 'Current [A]', 'Operating Time [s]', faultMarkers);
    }
  }

  /**
   * Render Plot 2: Feeder Fault Sweep (2 Subplots)
   */
  function renderSweepPlots() {
    const c1 = document.getElementById('chart-sweep-fault');
    const c2 = document.getElementById('chart-sweep-times');
    if (!c1 || !c2) return;

    const swp = state.analysis.sweep;
    const textColor = state.theme === 'dark' ? '#f8fafc' : '#0f172a';
    const gridColor = state.theme === 'dark' ? '#334155' : '#cbd5e1';

    // Subplot A: Fault current along feeders
    const ifData = swp.feeder_distance.map((d, i) => ({ x: d, y: swp.feeder_If[i] }));

    // Subplot B: Operating times & CTI along Line 2
    const t2Data = swp.dist_from_bus1_l2.map((d, i) => ({ x: d, y: swp.t2_l2[i] }));
    const t1Data = swp.dist_from_bus1_l2.map((d, i) => ({ x: d, y: swp.t1_l2[i] }));
    const ctiData = swp.dist_from_bus1_l2.map((d, i) => ({ x: d, y: swp.cti_l2[i] }));
    const reqCtiData = swp.dist_from_bus1_l2.map((d) => ({ x: d, y: state.params.CTI }));

    if (isChartJsAvailable) {
      if (charts.sweepFault) charts.sweepFault.destroy();
      if (charts.sweepTimes) charts.sweepTimes.destroy();

      charts.sweepFault = new Chart(c1, {
        type: 'line',
        data: {
          datasets: [{
            label: '3-ph Fault Current',
            data: ifData,
            borderColor: '#38bdf8',
            borderWidth: 2.2,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'linear',
              title: { display: true, text: 'Distance from Bus 1 [km]', color: textColor },
              grid: { color: gridColor },
              ticks: { color: textColor }
            },
            y: {
              title: { display: true, text: 'Fault Current [A]', color: textColor },
              grid: { color: gridColor },
              ticks: { color: textColor }
            }
          },
          plugins: { legend: { display: false } }
        }
      });

      charts.sweepTimes = new Chart(c2, {
        type: 'line',
        data: {
          datasets: [
            { label: 'tR2', data: t2Data, borderColor: '#ef4444', borderWidth: 2, pointRadius: 0 },
            { label: 'tR1', data: t1Data, borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0 },
            { label: 'Actual CTI', data: ctiData, borderColor: '#10b981', borderDash: [4, 4], borderWidth: 2, pointRadius: 0 },
            { label: 'Required CTI', data: reqCtiData, borderColor: '#64748b', borderDash: [2, 2], borderWidth: 1.5, pointRadius: 0 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'linear',
              title: { display: true, text: 'Fault Location on Line 2 [km from Bus 1]', color: textColor },
              grid: { color: gridColor },
              ticks: { color: textColor }
            },
            y: {
              title: { display: true, text: 'Time [s]', color: textColor },
              grid: { color: gridColor },
              ticks: { color: textColor },
              min: 0
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    } else {
      drawCanvasFallbackLinear(c1, [{ data: ifData, color: '#38bdf8' }], 'Distance [km]', 'Fault Current [A]');
      drawCanvasFallbackLinear(c2, [
        { data: t2Data, color: '#ef4444' },
        { data: t1Data, color: '#3b82f6' },
        { data: ctiData, color: '#10b981' }
      ], 'Distance [km]', 'Time [s]');
    }
  }

  /**
   * Render Plot 3: Time-Domain Dynamic Simulation
   */
  function renderSimulationPlots() {
    const c1 = document.getElementById('chart-sim-currents');
    const c2 = document.getElementById('chart-sim-acc');
    const c3 = document.getElementById('chart-sim-trips');
    if (!c1 || !c2 || !c3) return;

    // Run fresh simulation matching current sim parameters
    const simRes = Engine.runTimeDomainSimulation(
      state.params,
      state.analysis.system,
      state.analysis.settings,
      state.analysis.coordination,
      state.analysis.curve,
      {
        faultDistance: state.faultLocation,
        faultType: state.faultType.toUpperCase(),
        tf: state.sim.tf,
        T: 2.5,
        dt: 0.001,
        breakerFailure: state.sim.cb2Fail
      }
    );
    state.sim.data = simRes;

    const ts = simRes.timeSeries;
    const textColor = state.theme === 'dark' ? '#f8fafc' : '#0f172a';
    const gridColor = state.theme === 'dark' ? '#334155' : '#cbd5e1';

    const i1Data = ts.t.map((t, i) => ({ x: t, y: ts.I1[i] }));
    const i2Data = ts.t.map((t, i) => ({ x: t, y: ts.I2[i] }));

    const acc1Data = ts.t.map((t, i) => ({ x: t, y: ts.acc1[i] }));
    const acc2Data = ts.t.map((t, i) => ({ x: t, y: ts.acc2[i] }));
    const threshData = ts.t.map((t) => ({ x: t, y: 1.0 }));

    const trip2Data = ts.t.map((t, i) => ({ x: t, y: ts.trip2[i] }));
    const trip1Data = ts.t.map((t, i) => ({ x: t, y: ts.trip1[i] }));

    if (isChartJsAvailable) {
      if (charts.simCurrents) charts.simCurrents.destroy();
      if (charts.simAcc) charts.simAcc.destroy();
      if (charts.simTrips) charts.simTrips.destroy();

      charts.simCurrents = new Chart(c1, {
        type: 'line',
        data: {
          datasets: [
            { label: 'I_R1', data: i1Data, borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0 },
            { label: 'I_R2', data: i2Data, borderColor: '#ef4444', borderWidth: 2, pointRadius: 0 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { type: 'linear', grid: { color: gridColor }, ticks: { color: textColor }, max: 2.5 },
            y: { title: { display: true, text: 'RMS Current [A]', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor } }
          },
          plugins: { legend: { display: false } }
        }
      });

      charts.simAcc = new Chart(c2, {
        type: 'line',
        data: {
          datasets: [
            { label: 'acc1 (R1)', data: acc1Data, borderColor: '#3b82f6', borderWidth: 2, pointRadius: 0 },
            { label: 'acc2 (R2)', data: acc2Data, borderColor: '#ef4444', borderWidth: 2, pointRadius: 0 },
            { label: 'Trip Threshold', data: threshData, borderColor: '#64748b', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { type: 'linear', grid: { color: gridColor }, ticks: { color: textColor }, max: 2.5 },
            y: { title: { display: true, text: 'Disk Travel [0-1]', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor }, min: 0, max: 1.15 }
          },
          plugins: { legend: { display: false } }
        }
      });

      charts.simTrips = new Chart(c3, {
        type: 'line',
        data: {
          datasets: [
            { label: 'Trip CB2', data: trip2Data, borderColor: '#ef4444', borderWidth: 2.2, stepped: true, pointRadius: 0 },
            { label: 'Trip CB1', data: trip1Data, borderColor: '#3b82f6', borderWidth: 2.2, stepped: true, pointRadius: 0 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { type: 'linear', title: { display: true, text: 'Time [s]', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor }, max: 2.5 },
            y: { title: { display: true, text: 'Trip Signal', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor }, min: -0.1, max: 1.1 }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }

  /**
   * Simulation Playback Logic
   */
  function startSimulation() {
    if (state.sim.running) return;
    state.sim.running = true;
    dom.btnSimPlay.style.display = 'none';
    dom.btnSimPause.style.display = 'inline-flex';
    state.sim.lastTimestamp = performance.now();
    state.sim.animId = requestAnimationFrame(simStepLoop);
  }

  function pauseSimulation() {
    state.sim.running = false;
    dom.btnSimPlay.style.display = 'inline-flex';
    dom.btnSimPause.style.display = 'none';
    if (state.sim.animId) cancelAnimationFrame(state.sim.animId);
  }

  function stepSimulation() {
    pauseSimulation();
    state.sim.currentTime += 0.05;
    if (state.sim.currentTime > 2.5) state.sim.currentTime = 2.5;
    updateSimFrame();
  }

  function resetSimulation() {
    pauseSimulation();
    state.sim.currentTime = 0.0;
    updateSimFrame();
    setBreakerVisuals('CLOSED', 'CLOSED');
  }

  function simStepLoop(timestamp) {
    if (!state.sim.running) return;
    const deltaMs = timestamp - state.sim.lastTimestamp;
    state.sim.lastTimestamp = timestamp;

    const dtSeconds = (deltaMs / 1000) * state.sim.speed;
    state.sim.currentTime += dtSeconds;

    if (state.sim.currentTime >= 2.5) {
      state.sim.currentTime = 2.5;
      updateSimFrame();
      pauseSimulation();
      return;
    }

    updateSimFrame();
    state.sim.animId = requestAnimationFrame(simStepLoop);
  }

  function updateSimFrame() {
    dom.simTimeVal.textContent = state.sim.currentTime.toFixed(3);
    const simData = state.sim.data;
    if (!simData) return;

    // Check breaker visual status based on sim progress
    const t = state.sim.currentTime;
    let cb2Open = false;
    let cb1Open = false;

    if (simData.clr2 !== null && t >= simData.clr2 && !state.sim.cb2Fail) {
      cb2Open = true;
    }
    if (simData.clr1 !== null && t >= simData.clr1) {
      cb1Open = true;
    }

    setBreakerVisuals(cb1Open ? 'OPEN' : 'CLOSED', cb2Open ? 'OPEN' : 'CLOSED');
  }

  /**
   * High-contrast Pure HTML5 Canvas Fallbacks
   * (Used if CDN or internet access is offline)
   */
  function drawCanvasFallbackLinear(canvas, seriesList, xLabel, yLabel) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth || 600;
    const h = canvas.height = canvas.parentElement.clientHeight || 250;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = state.theme === 'dark' ? '#1e293b' : '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const padL = 60, padR = 20, padT = 20, padB = 40;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    seriesList.forEach(s => {
      s.data.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
    });

    if (minY > 0) minY = 0;
    if (!isFinite(minX)) { minX = 0; maxX = 10; minY = 0; maxY = 5000; }

    // Grid & Axes
    ctx.strokeStyle = state.theme === 'dark' ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // Curves
    seriesList.forEach(s => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let first = true;
      s.data.forEach(pt => {
        const px = padL + ((pt.x - minX) / (maxX - minX)) * plotW;
        const py = padT + plotH - ((pt.y - minY) / (maxY - minY)) * plotH;
        if (first) { ctx.moveTo(px, py); first = false; }
        else { ctx.lineTo(px, py); }
      });
      ctx.stroke();
    });

    // Labels
    ctx.fillStyle = state.theme === 'dark' ? '#94a3b8' : '#475569';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, padL + plotW / 2, h - 10);
    ctx.save();
    ctx.translate(15, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }

  function drawCanvasFallbackLogLog(canvas, r1Data, r2Data, xLabel, yLabel, faultMarkers = []) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth || 800;
    const h = canvas.height = canvas.parentElement.clientHeight || 350;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = state.theme === 'dark' ? '#1e293b' : '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const padL = 70, padR = 30, padT = 30, padB = 50;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const logMinX = Math.log10(200);
    const logMaxX = Math.log10(15000);
    const logMinY = Math.log10(0.1);
    const logMaxY = Math.log10(20.0);

    // Box
    ctx.strokeStyle = state.theme === 'dark' ? '#334155' : '#cbd5e1';
    ctx.strokeRect(padL, padT, plotW, plotH);

    function mapLog(x, y) {
      const px = padL + ((Math.log10(x) - logMinX) / (logMaxX - logMinX)) * plotW;
      const py = padT + plotH - ((Math.log10(y) - logMinY) / (logMaxY - logMinY)) * plotH;
      return { x: px, y: py };
    }

    // Draw R1
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let first = true;
    r1Data.forEach(pt => {
      if (pt.y >= 0.1 && pt.y <= 20) {
        const p = mapLog(pt.x, pt.y);
        if (first) { ctx.moveTo(p.x, p.y); first = false; }
        else ctx.lineTo(p.x, p.y);
      }
    });
    ctx.stroke();

    // Draw R2
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    first = true;
    r2Data.forEach(pt => {
      if (pt.y >= 0.1 && pt.y <= 20) {
        const p = mapLog(pt.x, pt.y);
        if (first) { ctx.moveTo(p.x, p.y); first = false; }
        else ctx.lineTo(p.x, p.y);
      }
    });
    ctx.stroke();

    // Draw Fault Markers
    if (faultMarkers && faultMarkers.length) {
      ctx.fillStyle = '#f59e0b';
      faultMarkers.forEach(m => {
        if (m.x >= 200 && m.x <= 15000 && m.y >= 0.1 && m.y <= 20) {
          const p = mapLog(m.x, m.y);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4.5, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    }

    // Labels
    ctx.fillStyle = state.theme === 'dark' ? '#f8fafc' : '#0f172a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, padL + plotW / 2, h - 15);
    ctx.save();
    ctx.translate(20, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }

  // Initialize
  window.addEventListener('DOMContentLoaded', () => {
    initDomElements();
    bindInputs();
    setFaultLocation(9.0);
    recalculateAndRender();
  });

})();

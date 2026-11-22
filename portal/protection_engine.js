/**
 * IDMT Feeder Protection Calculation Engine
 * -----------------------------------------------------------------------------
 * Reference: Assignment11_IDMT_Feeder_Protection.m & Assignment11_Report.pdf
 * Pure JavaScript, zero-dependency, compatible with both Node.js and Modern Browsers.
 *
 * Implements:
 * 1. Exact analytical impedance and fault calculations (3-phase symmetrical and 2-phase phase-to-phase).
 * 2. IDMT overcurrent relay curve models (IEC Standard, Very, Extremely, Long-Time Inverse, and Custom).
 * 3. Plug setting (PS), pick-up current (Ipu), and validation against minimum fault levels.
 * 4. Critical point coordination at Bus 2 fault (maximum fault seen by R2),
 *    with continuous and discrete (0.025 step) TMS1 determination.
 * 5. Feeder fault sweep arrays along Line 1 and Line 2 for fault current, operating times,
 *    and discrimination margin (CTI).
 * 6. High-fidelity numerical time-domain simulation utilizing induction-disk / numerical
 *    accumulator integrators with slow-reset dynamics, breaker clearing times, and selectivity analysis.
 * 7. Dynamic MATLAB script generation matching current parameters for report exports.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProtectionEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Standard IEC 60255-151 Curve Constants: t = TMS * k / ((I/Ipu)^a - 1)
  const CURVE_STANDARDS = {
    IEC_STANDARD_INVERSE: {
      id: 'IEC_STANDARD_INVERSE',
      name: 'IEC Standard Inverse',
      k: 0.14,
      a: 0.02,
      description: 'Standard inverse curve (t = 0.14 * TMS / (PSM^0.02 - 1))'
    },
    IEC_VERY_INVERSE: {
      id: 'IEC_VERY_INVERSE',
      name: 'IEC Very Inverse',
      k: 13.5,
      a: 1.0,
      description: 'Very inverse curve (t = 13.5 * TMS / (PSM - 1))'
    },
    IEC_EXTREMELY_INVERSE: {
      id: 'IEC_EXTREMELY_INVERSE',
      name: 'IEC Extremely Inverse',
      k: 80.0,
      a: 2.0,
      description: 'Extremely inverse curve (t = 80.0 * TMS / (PSM^2 - 1))'
    },
    IEC_LONG_TIME_INVERSE: {
      id: 'IEC_LONG_TIME_INVERSE',
      name: 'IEC Long-Time Inverse',
      k: 120.0,
      a: 1.0,
      description: 'Long-time inverse curve (t = 120.0 * TMS / (PSM - 1))'
    },
    CUSTOM: {
      id: 'CUSTOM',
      name: 'Custom Curve',
      k: 0.14,
      a: 0.02,
      description: 'User-specified k and alpha coefficients'
    }
  };

  // Default parameters matching Assignment 11
  const DEFAULT_PARAMS = {
    // System base parameters
    V_LL: 11000,          // Line-to-line voltage [V]
    Ssc: 250e6,           // Source short-circuit level [VA]
    
    // Feeder impedances (per km)
    z1_r: 0.30,           // Resistance [ohm/km]
    z1_x: 0.40,           // Reactance [ohm/km]
    
    // Feeder lengths
    L1: 5.0,              // Line 1 length (Bus 1 to Bus 2) [km]
    L2: 4.0,              // Line 2 length (Bus 2 to Bus 3) [km]
    
    // Loads
    S2: 3.0e6,            // Load at Bus 2 [VA]
    S3: 4.0e6,            // Load at Bus 3 [VA]
    
    // Protection settings
    OLF: 1.25,            // Overload safety factor for pick-up
    CT1: 600,             // CT primary rating for R1 [A] (secondary = 1A)
    CT2: 300,             // CT primary rating for R2 [A] (secondary = 1A)
    CTI: 0.30,            // Coordination Time Interval [s]
    Tcb: 0.05,            // Circuit breaker opening/clearing time [s]
    
    // Relay curve settings
    curveType: 'IEC_STANDARD_INVERSE',
    custom_k: 0.14,
    custom_a: 0.02,
    
    // Relay multiplier settings
    TMS2: 0.10,           // R2 Time Multiplier Setting (downstream primary)
    TMS1_auto: true,      // Automatically compute TMS1 for coordination
    TMS1_discrete: true,  // Round TMS1 up to 0.025 step if true
    TMS1_manual: 0.150,   // Manual override for TMS1 when TMS1_auto is false
    
    // Relay plug setting step
    ps_step: 0.05,        // Plug setting resolution (0.05..2.0)
    tms_step: 0.025       // Standard TMS resolution step
  };

  /**
   * Helper: Calculate complex impedance magnitude |R + jX|
   */
  function complexMag(r, x) {
    return Math.sqrt(r * r + x * x);
  }

  /**
   * Helper: Round number to specific decimal places
   */
  function round(val, decimals = 3) {
    if (val === null || val === undefined || isNaN(val)) return NaN;
    if (!isFinite(val)) return val;
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  /**
   * IDMT operating time formula
   * t = TMS * k / ((I / Ipu)^a - 1)
   * Returns Infinity if current is at or below pick-up
   */
  function idmt(I, Ipu, TMS, k = 0.14, a = 0.02) {
    if (Ipu <= 0 || TMS <= 0 || k <= 0 || a <= 0) return Infinity;
    const PSM = I / Ipu;
    if (PSM <= 1.0) {
      return Infinity;
    }
    const denom = Math.pow(PSM, a) - 1.0;
    if (denom <= 0) return Infinity;
    return (TMS * k) / denom;
  }

  /**
   * Resolve curve constants (k, a) based on user parameters
   */
  function resolveCurve(params = {}) {
    const curveType = params.curveType || DEFAULT_PARAMS.curveType;
    if (curveType === 'CUSTOM') {
      return {
        id: 'CUSTOM',
        name: 'Custom',
        k: Number(params.custom_k) || 0.14,
        a: Number(params.custom_a) || 0.02
      };
    }
    const std = CURVE_STANDARDS[curveType] || CURVE_STANDARDS.IEC_STANDARD_INVERSE;
    return {
      id: std.id,
      name: std.name,
      k: std.k,
      a: std.a
    };
  }

  /**
   * Compute system impedances and normal load currents
   */
  function calculateSystem(p) {
    const V_LL = Number(p.V_LL);
    const Ssc = Number(p.Ssc);
    const z1_r = Number(p.z1_r);
    const z1_x = Number(p.z1_x);
    const L1 = Number(p.L1);
    const L2 = Number(p.L2);
    const S2 = Number(p.S2);
    const S3 = Number(p.S3);

    const Vph = V_LL / Math.sqrt(3);

    // Source reactance (purely reactive)
    const Xs = (V_LL * V_LL) / Ssc;
    const Zs = { r: 0, x: Xs };

    // Line 1 impedance
    const ZL1 = { r: z1_r * L1, x: z1_x * L1 };

    // Line 2 impedance
    const ZL2 = { r: z1_r * L2, x: z1_x * L2 };

    // Total impedance to Bus 2
    const Z_bus2 = { r: ZL1.r, x: Zs.x + ZL1.x };
    const Z_bus2_mag = complexMag(Z_bus2.r, Z_bus2.x);

    // Total impedance to Bus 3
    const Z_bus3 = { r: ZL1.r + ZL2.r, x: Zs.x + ZL1.x + ZL2.x };
    const Z_bus3_mag = complexMag(Z_bus3.r, Z_bus3.x);

    // Load currents
    const IL2 = S2 / (Math.sqrt(3) * V_LL);
    const IL3 = S3 / (Math.sqrt(3) * V_LL);
    const I_R2 = IL3;
    const I_R1 = IL2 + IL3;

    // Symmetrical 3-phase fault currents
    const If3_bus2 = Vph / Z_bus2_mag;
    const If3_bus3 = Vph / Z_bus3_mag;

    // 2-phase fault current at Bus 3 (minimum fault)
    const If2_bus3 = (Math.sqrt(3) / 2) * If3_bus3;

    // Bus 1 source bolted fault (for reference)
    const If3_bus1 = Vph / Xs;

    return {
      Vph,
      Xs,
      Zs,
      ZL1,
      ZL2,
      Z_bus2,
      Z_bus2_mag,
      Z_bus3,
      Z_bus3_mag,
      IL2,
      IL3,
      I_R1,
      I_R2,
      If3_bus1,
      If3_bus2,
      If3_bus3,
      If2_bus3
    };
  }

  /**
   * Calculate fault current at arbitrary location
   * @param {number} distance - distance in km from Bus 1
   * @param {object} p - parameters
   */
  function calculateFaultAtDistance(distance, p) {
    const sys = calculateSystem(p);
    const z1_r = Number(p.z1_r);
    const z1_x = Number(p.z1_x);
    const L1 = Number(p.L1);
    const L2 = Number(p.L2);

    let d = Math.max(0, Math.min(distance, L1 + L2));
    let r_fault = 0;
    let x_fault = sys.Xs;

    if (d <= L1) {
      r_fault = z1_r * d;
      x_fault = sys.Xs + z1_x * d;
    } else {
      const d2 = d - L1;
      r_fault = z1_r * L1 + z1_r * d2;
      x_fault = sys.Xs + z1_x * L1 + z1_x * d2;
    }

    const Zmag = complexMag(r_fault, x_fault);
    const If3 = sys.Vph / Zmag;
    const If2 = (Math.sqrt(3) / 2) * If3;

    return {
      distance: d,
      line: d <= L1 ? 1 : 2,
      d_on_line: d <= L1 ? d : d - L1,
      Zmag,
      If3,
      If2
    };
  }

  /**
   * Determine Relay Plug Settings and Pick-up currents with validation
   */
  function calculateRelaySettings(p, sys) {
    const OLF = Number(p.OLF) || 1.25;
    const CT1 = Number(p.CT1) || 600;
    const CT2 = Number(p.CT2) || 300;
    const ps_step = Number(p.ps_step) || 0.05;

    // Plug settings: ceil((OLF * I_load / CT) / ps_step) * ps_step
    const PS2_raw = (OLF * sys.I_R2) / CT2;
    const PS2 = round(Math.ceil(PS2_raw / ps_step) * ps_step, 4);
    const Ipu2 = round(PS2 * CT2, 3);

    const PS1_raw = (OLF * sys.I_R1) / CT1;
    const PS1 = round(Math.ceil(PS1_raw / ps_step) * ps_step, 4);
    const Ipu1 = round(PS1 * CT1, 3);

    // Validations:
    // 1. Pick-up must be > normal load (with margin)
    // 2. Pick-up must be < minimum fault current (If2_bus3)
    const validR2_load = Ipu2 > sys.I_R2;
    const validR1_load = Ipu1 > sys.I_R1;
    const validR2_fault = Ipu2 < sys.If2_bus3;
    const validR1_fault = Ipu1 < sys.If2_bus3;

    const issues = [];
    if (!validR2_load) issues.push('R2 pick-up is below normal load current');
    if (!validR1_load) issues.push('R1 pick-up is below normal load current');
    if (!validR2_fault) issues.push('R2 pick-up exceeds minimum 2-phase fault current at Bus 3');
    if (!validR1_fault) issues.push('R1 pick-up exceeds minimum 2-phase fault current at Bus 3');

    return {
      PS1,
      PS2,
      PS1_raw,
      PS2_raw,
      Ipu1,
      Ipu2,
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Determine TMS and perform coordination analysis
   */
  function calculateCoordination(p, sys, settings, curve) {
    const CTI = Number(p.CTI) || 0.30;
    const TMS2 = Number(p.TMS2) || 0.10;
    const tms_step = Number(p.tms_step) || 0.025;
    const k = curve.k;
    const a = curve.a;

    // Operating time of R2 for Bus 3 fault
    const t2_bus3 = idmt(sys.If3_bus3, settings.Ipu2, TMS2, k, a);

    // Coordination is checked at the MAXIMUM fault current seen by R2,
    // which occurs for a fault at the Bus 2 end of Line 2 (critical point: I_coord = If3_bus2).
    // The inverse characteristics are closest here.
    const I_coord = sys.If3_bus2;
    const t2_coord = idmt(I_coord, settings.Ipu2, TMS2, k, a);
    const t1_req = t2_coord + CTI;

    // Unit operating time for R1 with TMS=1.0 at I_coord
    const t1_unit = idmt(I_coord, settings.Ipu1, 1.0, k, a);
    const TMS1_continuous = t1_req / t1_unit;
    const TMS1_discrete = round(Math.ceil(TMS1_continuous / tms_step) * tms_step, 4);

    let TMS1;
    if (p.TMS1_auto !== false) {
      TMS1 = p.TMS1_discrete !== false ? TMS1_discrete : round(TMS1_continuous, 4);
    } else {
      TMS1 = Number(p.TMS1_manual) || TMS1_discrete;
    }

    // Operating times with selected TMS1
    const t1_coord = idmt(I_coord, settings.Ipu1, TMS1, k, a);
    const CTI_coord = t1_coord - t2_coord;

    const t1_bus3 = idmt(sys.If3_bus3, settings.Ipu1, TMS1, k, a);
    const CTI_bus3 = t1_bus3 - t2_bus3;

    // 2-phase fault operating times at Bus 3
    const t2_bus3_2ph = idmt(sys.If2_bus3, settings.Ipu2, TMS2, k, a);
    const t1_bus3_2ph = idmt(sys.If2_bus3, settings.Ipu1, TMS1, k, a);
    const CTI_bus3_2ph = t1_bus3_2ph - t2_bus3_2ph;

    // Operating time of R1 for Bus 2 busbar fault (R1 is primary)
    const t1_bus2 = idmt(sys.If3_bus2, settings.Ipu1, TMS1, k, a);

    const isCoordinated = CTI_coord >= CTI - 1e-9;

    return {
      TMS2,
      TMS1,
      TMS1_continuous,
      TMS1_discrete,
      I_coord,
      t2_coord,
      t1_req,
      t1_coord,
      CTI_coord,
      t2_bus3,
      t1_bus3,
      CTI_bus3,
      t2_bus3_2ph,
      t1_bus3_2ph,
      CTI_bus3_2ph,
      t1_bus2,
      CTI_target: CTI,
      isCoordinated
    };
  }

  /**
   * Generate fault sweep along Line 1 and Line 2
   */
  function generateFaultSweep(p, sys, settings, coord, curve, numPoints = 100) {
    const L1 = Number(p.L1);
    const L2 = Number(p.L2);
    const z1_r = Number(p.z1_r);
    const z1_x = Number(p.z1_x);
    const Xs = sys.Xs;
    const Vph = sys.Vph;
    const k = curve.k;
    const a = curve.a;

    // Line 1 sweep: 0.05 km to L1 km
    const d1_arr = [];
    const If_l1_arr = [];
    const t1_l1_arr = [];

    const d1_start = 0.05;
    const d1_step = (L1 - d1_start) / (numPoints - 1);
    for (let i = 0; i < numPoints; i++) {
      const d1 = d1_start + i * d1_step;
      d1_arr.push(d1);
      const Zmag = complexMag(z1_r * d1, Xs + z1_x * d1);
      const If1 = Vph / Zmag;
      If_l1_arr.push(If1);
      const t1 = idmt(If1, settings.Ipu1, coord.TMS1, k, a);
      t1_l1_arr.push(t1);
    }

    // Line 2 sweep: 0.00 km to L2 km
    const d2_arr = [];
    const dist_from_bus1_l2 = [];
    const If_l2_arr = [];
    const t2_l2_arr = [];
    const t1_l2_arr = [];
    const cti_l2_arr = [];

    const d2_step = L2 / (numPoints - 1);
    let minCTI = Infinity;
    let minCTIDistance = 0;

    for (let i = 0; i < numPoints; i++) {
      const d2 = i * d2_step;
      d2_arr.push(d2);
      const d_total = L1 + d2;
      dist_from_bus1_l2.push(d_total);

      const r_tot = z1_r * L1 + z1_r * d2;
      const x_tot = Xs + z1_x * L1 + z1_x * d2;
      const Zmag = complexMag(r_tot, x_tot);
      const If2 = Vph / Zmag;
      If_l2_arr.push(If2);

      const t2 = idmt(If2, settings.Ipu2, coord.TMS2, k, a);
      const t1 = idmt(If2, settings.Ipu1, coord.TMS1, k, a);
      const cti = t1 - t2;

      t2_l2_arr.push(t2);
      t1_l2_arr.push(t1);
      cti_l2_arr.push(cti);

      if (cti < minCTI) {
        minCTI = cti;
        minCTIDistance = d_total;
      }
    }

    // Combined feeder distance array for overall fault current profile
    const feeder_distance = d1_arr.concat(dist_from_bus1_l2);
    const feeder_If = If_l1_arr.concat(If_l2_arr);

    return {
      numPoints,
      d1: d1_arr,
      If_l1: If_l1_arr,
      t1_l1: t1_l1_arr,
      d2: d2_arr,
      dist_from_bus1_l2,
      If_l2: If_l2_arr,
      t2_l2: t2_l2_arr,
      t1_l2: t1_l2_arr,
      cti_l2: cti_l2_arr,
      feeder_distance,
      feeder_If,
      minCTI,
      minCTIDistance,
      coordinationPass: minCTI >= Number(p.CTI) - 1e-9
    };
  }

  /**
   * Generate Log-Log Time-Current Characteristics (TCC)
   */
  function generateTCC(p, sys, settings, coord, curve, numPoints = 200) {
    const k = curve.k;
    const a = curve.a;

    // Span from slightly above lowest pickup to beyond max fault current at Bus 1
    const minI = 1.05 * Math.min(settings.Ipu1, settings.Ipu2);
    const maxI = 1.25 * Math.max(sys.If3_bus1, sys.If3_bus2 * 1.5);

    const logMin = Math.log10(minI);
    const logMax = Math.log10(maxI);
    const logStep = (logMax - logMin) / (numPoints - 1);

    const current_arr = [];
    const t1_arr = [];
    const t2_arr = [];

    for (let i = 0; i < numPoints; i++) {
      const I = Math.pow(10, logMin + i * logStep);
      current_arr.push(I);

      const t1 = idmt(I, settings.Ipu1, coord.TMS1, k, a);
      const t2 = idmt(I, settings.Ipu2, coord.TMS2, k, a);

      t1_arr.push(isFinite(t1) && t1 <= 100 ? t1 : null);
      t2_arr.push(isFinite(t2) && t2 <= 100 ? t2 : null);
    }

    // Key markers to highlight on the TCC plot
    const markers = [
      {
        name: 'Normal Load R2',
        current: sys.I_R2,
        t1: null,
        t2: null,
        type: 'load'
      },
      {
        name: 'Normal Load R1',
        current: sys.I_R1,
        t1: null,
        t2: null,
        type: 'load'
      },
      {
        name: 'Pick-up R2 (Ipu2)',
        current: settings.Ipu2,
        t1: null,
        t2: null,
        type: 'pickup'
      },
      {
        name: 'Pick-up R1 (Ipu1)',
        current: settings.Ipu1,
        t1: null,
        t2: null,
        type: 'pickup'
      },
      {
        name: '2-ph Fault Bus 3 (min)',
        current: sys.If2_bus3,
        t1: coord.t1_bus3_2ph,
        t2: coord.t2_bus3_2ph,
        cti: coord.CTI_bus3_2ph,
        type: 'fault'
      },
      {
        name: '3-ph Fault Bus 3',
        current: sys.If3_bus3,
        t1: coord.t1_bus3,
        t2: coord.t2_bus3,
        cti: coord.CTI_bus3,
        type: 'fault'
      },
      {
        name: '3-ph Fault Bus 2 (critical coord point)',
        current: sys.If3_bus2,
        t1: coord.t1_coord,
        t2: coord.t2_coord,
        cti: coord.CTI_coord,
        type: 'fault'
      }
    ];

    return {
      current: current_arr,
      t1: t1_arr,
      t2: t2_arr,
      markers
    };
  }

  /**
   * Relay disk-integrator step function
   * Numerical accumulation model matching MATLAB implementation:
   * When I > Ipu: acc += dt / idmt(I)
   * When I <= Ipu: acc = max(acc - dt/10, 0) (slow reset)
   */
  function relayStep(acc_prev, I, Ipu, TMS, k, a, dt) {
    if (I > Ipu) {
      const top = idmt(I, Ipu, TMS, k, a);
      if (isFinite(top) && top > 0) {
        return acc_prev + dt / top;
      }
      return acc_prev;
    } else {
      return Math.max(acc_prev - dt / 10.0, 0);
    }
  }

  /**
   * Time-domain dynamic simulation of protection scheme
   * Options:
   * - faultBus: 2 or 3 (default 3)
   * - faultDistance: distance from Bus 1 (optional override)
   * - faultType: '3PH' or '2PH' (default '3PH')
   * - tf: fault inception time [s] (default 0.5)
   * - T: total duration [s] (default 2.5)
   * - dt: simulation time step [s] (default 0.001)
   * - breakerFailure: boolean (if true, CB2 fails to open, forcing R1 backup trip)
   */
  function runTimeDomainSimulation(p, sys, settings, coord, curve, options = {}) {
    const faultBus = options.faultBus !== undefined ? Number(options.faultBus) : 3;
    const faultType = options.faultType || '3PH';
    const tf = options.tf !== undefined ? Number(options.tf) : 0.5;
    const T = options.T !== undefined ? Number(options.T) : 2.5;
    const dt = options.dt !== undefined ? Number(options.dt) : 0.001;
    const Tcb = Number(p.Tcb) || 0.05;
    const breakerFailure = Boolean(options.breakerFailure);

    const k = curve.k;
    const a = curve.a;

    // Determine fault current based on selected fault location
    let Ifault = sys.If3_bus3;
    let faultOnLine2 = true;

    if (options.faultDistance !== undefined) {
      const flt = calculateFaultAtDistance(Number(options.faultDistance), p);
      Ifault = faultType === '2PH' ? flt.If2 : flt.If3;
      faultOnLine2 = flt.line === 2;
    } else if (faultBus === 2) {
      Ifault = faultType === '2PH' ? (Math.sqrt(3) / 2) * sys.If3_bus2 : sys.If3_bus2;
      faultOnLine2 = false; // Fault on Bus 2 busbar is outside R2 zone
    } else {
      Ifault = faultType === '2PH' ? sys.If2_bus3 : sys.If3_bus3;
      faultOnLine2 = true;
    }

    const N = Math.floor(T / dt) + 1;
    const t_arr = new Float64Array(N);
    const I1_arr = new Float64Array(N);
    const I2_arr = new Float64Array(N);
    const acc1_arr = new Float64Array(N);
    const acc2_arr = new Float64Array(N);
    const trip1_sig = new Uint8Array(N);
    const trip2_sig = new Uint8Array(N);

    let trip2 = null;
    let trip1 = null;
    let clr2 = null;
    let clr1 = null;
    let clearedByCB2 = false;
    let clearedByCB1 = false;

    let max_acc1 = 0;
    let max_acc2 = 0;

    for (let n = 0; n < N; n++) {
      const t = n * dt;
      t_arr[n] = t;

      let I1_val, I2_val;

      // Determine current through relays
      if (t < tf) {
        // Normal pre-fault load
        I2_val = sys.I_R2;
        I1_val = sys.I_R1;
      } else if (!clearedByCB2 && !clearedByCB1) {
        // Fault in progress
        if (faultOnLine2) {
          I2_val = Ifault;
          I1_val = Ifault;
        } else {
          // Fault at Bus 2: outside R2 zone
          I2_val = sys.I_R2; // Load 3 continues to draw normal load or drops
          I1_val = Ifault;
        }
      } else if (clearedByCB2) {
        // Line 2 isolated by CB2
        I2_val = 0;
        I1_val = sys.IL2; // Load at Bus 2 continues to be supplied
      } else {
        // Cleared by CB1: entire feeder de-energized
        I2_val = 0;
        I1_val = 0;
      }

      I1_arr[n] = I1_val;
      I2_arr[n] = I2_val;

      // Accumulator update
      let acc1_val = 0;
      let acc2_val = 0;
      if (n > 0) {
        acc2_val = relayStep(acc2_arr[n - 1], I2_val, settings.Ipu2, coord.TMS2, k, a, dt);
        acc1_val = relayStep(acc1_arr[n - 1], I1_val, settings.Ipu1, coord.TMS1, k, a, dt);
      }
      acc1_arr[n] = acc1_val;
      acc2_arr[n] = acc2_val;

      if (acc1_val > max_acc1) max_acc1 = acc1_val;
      if (acc2_val > max_acc2) max_acc2 = acc2_val;

      // Check R2 Trip
      if (trip2 === null && acc2_val >= 1.0) {
        trip2 = t;
        if (!breakerFailure) {
          clr2 = trip2 + Tcb;
        }
      }

      // Check CB2 Breaker Opening
      if (!clearedByCB2 && !clearedByCB1 && clr2 !== null && t >= clr2) {
        clearedByCB2 = true;
      }

      // Check R1 Trip (Backup or Primary for Bus 2)
      if (trip1 === null && acc1_val >= 1.0) {
        trip1 = t;
        clr1 = trip1 + Tcb;
      }

      // Check CB1 Breaker Opening
      if (!clearedByCB1 && clr1 !== null && t >= clr1) {
        clearedByCB1 = true;
      }

      trip2_sig[n] = trip2 !== null && t >= trip2 ? 1 : 0;
      trip1_sig[n] = trip1 !== null && t >= trip1 ? 1 : 0;
    }

    // Subsampling for UI transmission and smooth charting (1 ms resolution may have 2500 points)
    // We downsample to ~500 points for frontend rendering performance while preserving key events
    const sampleFactor = Math.max(1, Math.floor(N / 500));
    const sampleLen = Math.ceil(N / sampleFactor);
    const sub_t = new Array(sampleLen);
    const sub_I1 = new Array(sampleLen);
    const sub_I2 = new Array(sampleLen);
    const sub_acc1 = new Array(sampleLen);
    const sub_acc2 = new Array(sampleLen);
    const sub_trip1 = new Array(sampleLen);
    const sub_trip2 = new Array(sampleLen);

    let idx = 0;
    for (let i = 0; i < N; i += sampleFactor) {
      sub_t[idx] = round(t_arr[i], 4);
      sub_I1[idx] = round(I1_arr[i], 1);
      sub_I2[idx] = round(I2_arr[i], 1);
      sub_acc1[idx] = round(acc1_arr[i], 4);
      sub_acc2[idx] = round(acc2_arr[i], 4);
      sub_trip1[idx] = trip1_sig[i];
      sub_trip2[idx] = trip2_sig[i];
      idx++;
    }

    const t2_trip_duration = trip2 !== null ? trip2 - tf : null;
    const t1_trip_duration = trip1 !== null ? trip1 - tf : null;

    // Analytical expected time for comparison
    const t2_analytical = faultOnLine2 ? idmt(Ifault, settings.Ipu2, coord.TMS2, k, a) : null;
    const t1_analytical = idmt(Ifault, settings.Ipu1, coord.TMS1, k, a);

    const isSelective = faultOnLine2
      ? (trip2 !== null && trip1 === null && !breakerFailure)
      : (trip1 !== null && trip2 === null);

    return {
      faultBus,
      faultType,
      faultOnLine2,
      Ifault,
      tf,
      T,
      dt,
      Tcb,
      breakerFailure,
      trip2,
      trip1,
      clr2,
      clr1,
      t2_trip_duration,
      t1_trip_duration,
      t2_analytical,
      t1_analytical,
      max_acc1,
      max_acc2,
      isSelective,
      clearedByCB2,
      clearedByCB1,
      timeSeries: {
        t: sub_t,
        I1: sub_I1,
        I2: sub_I2,
        acc1: sub_acc1,
        acc2: sub_acc2,
        trip1: sub_trip1,
        trip2: sub_trip2
      }
    };
  }

  /**
   * Run the complete analytical protection analysis
   */
  function runFullAnalysis(userParams = {}) {
    const params = Object.assign({}, DEFAULT_PARAMS, userParams);
    const curve = resolveCurve(params);
    const sys = calculateSystem(params);
    const settings = calculateRelaySettings(params, sys);
    const coord = calculateCoordination(params, sys, settings, curve);
    const sweep = generateFaultSweep(params, sys, settings, coord, curve);
    const tcc = generateTCC(params, sys, settings, coord, curve);
    const sim = runTimeDomainSimulation(params, sys, settings, coord, curve, {
      faultBus: 3,
      faultType: '3PH',
      tf: 0.5,
      T: 2.5
    });

    // Summary table matching Assignment 11 Report Table 4 & MATLAB
    const resultsTable = [
      {
        location: 'Bus 2 end of Line 2 (critical coord)',
        faultType: '3-ph',
        If: round(sys.If3_bus2, 1),
        tR2: round(coord.t2_coord, 3),
        tR1: round(coord.t1_coord, 3),
        cti: round(coord.CTI_coord, 3),
        status: coord.CTI_coord >= params.CTI - 1e-9 ? 'PASS' : 'FAIL'
      },
      {
        location: 'Bus 3 (end of Line 2)',
        faultType: '3-ph',
        If: round(sys.If3_bus3, 1),
        tR2: round(coord.t2_bus3, 3),
        tR1: round(coord.t1_bus3, 3),
        cti: round(coord.CTI_bus3, 3),
        status: coord.CTI_bus3 >= params.CTI - 1e-9 ? 'PASS' : 'FAIL'
      },
      {
        location: 'Bus 3 (minimum fault)',
        faultType: '2-ph',
        If: round(sys.If2_bus3, 1),
        tR2: round(coord.t2_bus3_2ph, 3),
        tR1: round(coord.t1_bus3_2ph, 3),
        cti: round(coord.CTI_bus3_2ph, 3),
        status: coord.CTI_bus3_2ph >= params.CTI - 1e-9 ? 'PASS' : 'FAIL'
      },
      {
        location: 'Bus 2 Busbar (Line 1 primary)',
        faultType: '3-ph',
        If: round(sys.If3_bus2, 1),
        tR2: null, // outside R2 zone
        tR1: round(coord.t1_bus2, 3),
        cti: null,
        status: 'PRIMARY'
      }
    ];

    return {
      params,
      curve,
      system: sys,
      settings,
      coordination: coord,
      sweep,
      tcc,
      simulation: sim,
      resultsTable
    };
  }

  /**
   * Generate downloadable MATLAB script matching current inputs
   */
  function exportToMatlab(params = {}) {
    const p = Object.assign({}, DEFAULT_PARAMS, params);
    const curve = resolveCurve(p);

    return `%% =====================================================================
%  Assignment 11 : Feeder protection of a 3-bus radial system
%                  Generated by IDMT Feeder Protection Engine
%  System : Source --[R1]--Line1-- Bus2 --[R2]--Line2-- Bus3
%  Date   : ${new Date().toISOString()}
% =====================================================================
clear; clc; close all;

%% 1. SYSTEM DATA
V_LL   = ${p.V_LL};                 % Line-to-line voltage [V]
Ssc    = ${p.Ssc};              % Source short-circuit level [VA]
Zs     = 1j * V_LL^2 / Ssc;    % Source reactance [ohm]

z1     = ${p.z1_r} + 1j*${p.z1_x};       % Line impedance [ohm/km]
L1     = ${p.L1};                    % Line 1 length [km]
L2     = ${p.L2};                    % Line 2 length [km]
ZL1    = z1*L1;
ZL2    = z1*L2;

S2     = ${p.S2};                  % Load at Bus 2 [VA]
S3     = ${p.S3};                  % Load at Bus 3 [VA]
IL2    = S2/(sqrt(3)*V_LL);    % Load current Bus 2 [A]
IL3    = S3/(sqrt(3)*V_LL);    % Load current Bus 3 [A]
I_R2   = IL3;                  % Normal current through R2 [A]
I_R1   = IL2 + IL3;            % Normal current through R1 [A]

%% 2. FAULT CURRENTS
Vph = V_LL/sqrt(3);
If3_bus2 = abs(Vph/(Zs + ZL1));            % 3-ph fault at Bus 2 [A]
If3_bus3 = abs(Vph/(Zs + ZL1 + ZL2));      % 3-ph fault at Bus 3 [A]
If2_bus3 = (sqrt(3)/2)*If3_bus3;           % 2-ph (min) fault at Bus 3 [A]

%% 3. RELAY SETTINGS
% Curve: ${curve.name}
k = ${curve.k};  a = ${curve.a};
CTI   = ${p.CTI};                   % Coordination time interval [s]
OLF   = ${p.OLF};                  % Overload factor
CT1   = ${p.CT1};  CT2 = ${p.CT2};       % CT primary ratings
Tcb   = ${p.Tcb};                  % Breaker clearing time [s]

PS2 = ceil((OLF*I_R2/CT2)/${p.ps_step})*${p.ps_step};
PS1 = ceil((OLF*I_R1/CT1)/${p.ps_step})*${p.ps_step};
Ipu2 = PS2*CT2;
Ipu1 = PS1*CT1;

TMS2 = ${p.TMS2};
I_coord  = If3_bus2;
t2_coord = idmt(I_coord, Ipu2, TMS2, k, a);
t1_req   = t2_coord + CTI;
TMS1_cont = t1_req / idmt(I_coord, Ipu1, 1, k, a);
${p.TMS1_auto ? (p.TMS1_discrete ? `TMS1 = ceil(TMS1_cont/${p.tms_step})*${p.tms_step};` : `TMS1 = TMS1_cont;`) : `TMS1 = ${p.TMS1_manual};`}

fprintf('--- Load Currents ---\\n');
fprintf('Through R1 = %.1f A, through R2 = %.1f A\\n', I_R1, I_R2);
fprintf('--- Fault Currents ---\\n');
fprintf('3-ph fault Bus2 = %.0f A\\n', If3_bus2);
fprintf('3-ph fault Bus3 = %.0f A\\n', If3_bus3);
fprintf('2-ph fault Bus3 = %.0f A (minimum)\\n\\n', If2_bus3);
fprintf('--- Relay Settings ---\\n');
fprintf('R2: CT %d/1, PS = %.2f (pick-up %.0f A), TMS = %.3f\\n', CT2, PS2, Ipu2, TMS2);
fprintf('R1: CT %d/1, PS = %.2f (pick-up %.0f A), TMS = %.3f\\n\\n', CT1, PS1, Ipu1, TMS1);

%% 4. FAULT SWEEP ALONG FEEDERS
d1 = linspace(0.05, L1, 100);
d2 = linspace(0.00, L2, 100);
If_l1 = abs(Vph ./ (Zs + z1*d1));
If_l2 = abs(Vph ./ (Zs + ZL1 + z1*d2));
t1_l1 = idmt(If_l1, Ipu1, TMS1, k, a);
t1_l2 = idmt(If_l2, Ipu1, TMS1, k, a);
t2_l2 = idmt(If_l2, Ipu2, TMS2, k, a);
cti_l2 = t1_l2 - t2_l2;

fprintf('Min CTI over Line 2 = %.3f s (required %.2f s)\\n', min(cti_l2), CTI);
if min(cti_l2) >= CTI - 1e-9
    fprintf('Coordination: PASS\\n\\n');
else
    fprintf('Coordination: FAIL - increase TMS1\\n\\n');
end

%% 5. TIME-DOMAIN SIMULATION (Bus 3 3-ph fault at tf = 0.5 s)
dt = 1e-3; T = 2.5; t = 0:dt:T; tf = 0.5;
N = numel(t);
I1 = zeros(1,N); I2 = zeros(1,N);
acc1 = zeros(1,N); acc2 = zeros(1,N);
trip2 = NaN; trip1 = NaN; clr = NaN; cleared = false;

for n = 1:N
    if t(n) < tf
        I2(n) = I_R2; I1(n) = I_R1;
    elseif ~cleared
        I2(n) = If3_bus3; I1(n) = If3_bus3;
    else
        I2(n) = 0; I1(n) = IL2;
    end
    if n > 1
        acc2(n) = relay_step(acc2(n-1), I2(n), Ipu2, TMS2, k, a, dt);
        acc1(n) = relay_step(acc1(n-1), I1(n), Ipu1, TMS1, k, a, dt);
    end
    if isnan(trip2) && acc2(n) >= 1
        trip2 = t(n); clr = trip2 + Tcb;
    end
    if ~cleared && ~isnan(clr) && t(n) >= clr
        cleared = true;
    end
    if isnan(trip1) && acc1(n) >= 1
        trip1 = t(n);
    end
end

fprintf('R2 trip time = %.3f s after fault\\n', trip2 - tf);
if isnan(trip1)
    fprintf('Selective operation: R1 reached only %.1f%% disk travel.\\n', 100*max(acc1));
else
    fprintf('Non-selective operation: R1 tripped at %.3f s.\\n', trip1 - tf);
end

%% LOCAL FUNCTIONS
function t = idmt(I, Ipu, TMS, k, a)
    PSM = I ./ Ipu;
    t = TMS .* k ./ (PSM.^a - 1);
    t(PSM <= 1) = Inf;
end

function acc = relay_step(acc_prev, I, Ipu, TMS, k, a, dt)
    if I > Ipu
        acc = acc_prev + dt / idmt(I, Ipu, TMS, k, a);
    else
        acc = max(acc_prev - dt/10, 0);
    end
end
`;
  }

  /**
   * Export fault sweep to CSV string
   */
  function exportSweepToCSV(sweep) {
    let csv = 'Line,Distance_from_Bus1_km,Fault_Current_A,tR2_s,tR1_s,CTI_s\n';
    for (let i = 0; i < sweep.d1.length; i++) {
      const d = round(sweep.d1[i], 3);
      const if_val = round(sweep.If_l1[i], 1);
      const t1 = round(sweep.t1_l1[i], 3);
      csv += `Line 1,${d},${if_val},N/A,${t1},N/A\n`;
    }
    for (let i = 0; i < sweep.d2.length; i++) {
      const d = round(sweep.dist_from_bus1_l2[i], 3);
      const if_val = round(sweep.If_l2[i], 1);
      const t2 = round(sweep.t2_l2[i], 3);
      const t1 = round(sweep.t1_l2[i], 3);
      const cti = round(sweep.cti_l2[i], 3);
      csv += `Line 2,${d},${if_val},${t2},${t1},${cti}\n`;
    }
    return csv;
  }

  /**
   * Export simulation time series to CSV string
   */
  function exportSimulationToCSV(sim) {
    let csv = 'Time_s,Current_R1_A,Current_R2_A,Acc_R1,Acc_R2,Trip_CB1,Trip_CB2\n';
    const ts = sim.timeSeries;
    for (let i = 0; i < ts.t.length; i++) {
      csv += `${ts.t[i]},${ts.I1[i]},${ts.I2[i]},${ts.acc1[i]},${ts.acc2[i]},${ts.trip1[i]},${ts.trip2[i]}\n`;
    }
    return csv;
  }

  // Public API
  return {
    DEFAULT_PARAMS,
    CURVE_STANDARDS,
    idmt,
    relayStep,
    resolveCurve,
    calculateSystem,
    calculateFaultAtDistance,
    calculateRelaySettings,
    calculateCoordination,
    generateFaultSweep,
    generateTCC,
    runTimeDomainSimulation,
    runFullAnalysis,
    exportToMatlab,
    exportSweepToCSV,
    exportSimulationToCSV,
    round
  };
});

const assert = require('assert');
const Engine = require('./portal/protection_engine.js');

console.log('====================================================');
console.log('IDMT Feeder Protection Engine - Test Suite');
console.log('====================================================');

// Test 1: Assignment 11 Default Parameters
console.log('\n[Test 1] Assignment 11 Default Analytical Calculations');
const res = Engine.runFullAnalysis();

const sys = res.system;
const set = res.settings;
const coord = res.coordination;
const sim = res.simulation;

console.log(`- Load Current R1: ${sys.I_R1.toFixed(1)} A (Expected: 367.4 A)`);
console.log(`- Load Current R2: ${sys.I_R2.toFixed(1)} A (Expected: 209.9 A)`);
assert.strictEqual(sys.I_R1.toFixed(1), '367.4', 'Load current R1 mismatch');
assert.strictEqual(sys.I_R2.toFixed(1), '209.9', 'Load current R2 mismatch');

console.log(`- 3-ph Fault at Bus 2: ${sys.If3_bus2.toFixed(1)} A (Expected: 2188.6 A)`);
console.log(`- 3-ph Fault at Bus 3: ${sys.If3_bus3.toFixed(1)} A (Expected: 1297.2 A)`);
console.log(`- 2-ph Fault at Bus 3: ${sys.If2_bus3.toFixed(1)} A (Expected: 1123.4 A)`);
assert(Math.abs(sys.If3_bus2 - 2188.6) < 0.2, 'Fault Bus2 mismatch');
assert(Math.abs(sys.If3_bus3 - 1297.2) < 0.2, 'Fault Bus3 mismatch');
assert(Math.abs(sys.If2_bus3 - 1123.4) < 0.2, '2-ph Fault Bus3 mismatch');

console.log(`- PS2: ${set.PS2.toFixed(2)}, Ipu2: ${set.Ipu2.toFixed(0)} A (Expected: 0.90, 270 A)`);
console.log(`- PS1: ${set.PS1.toFixed(2)}, Ipu1: ${set.Ipu1.toFixed(0)} A (Expected: 0.80, 480 A)`);
assert.strictEqual(set.PS2, 0.90, 'PS2 mismatch');
assert.strictEqual(set.Ipu2, 270, 'Ipu2 mismatch');
assert.strictEqual(set.PS1, 0.80, 'PS1 mismatch');
assert.strictEqual(set.Ipu1, 480, 'Ipu1 mismatch');
assert.strictEqual(set.valid, true, 'Settings validation failed');

console.log(`- TMS2: ${coord.TMS2.toFixed(3)} (Expected: 0.100)`);
console.log(`- TMS1 continuous: ${coord.TMS1_continuous.toFixed(4)} (Expected: 0.1381)`);
console.log(`- TMS1 discrete (step 0.025): ${coord.TMS1_discrete.toFixed(3)} (Expected: 0.150)`);
assert.strictEqual(coord.TMS2, 0.100, 'TMS2 mismatch');
assert(Math.abs(coord.TMS1_continuous - 0.1381) < 0.001, 'TMS1 continuous mismatch');
assert.strictEqual(coord.TMS1_discrete, 0.150, 'TMS1 discrete mismatch');

console.log(`- Bus 2 (critical coord point): t2 = ${coord.t2_coord.toFixed(3)} s, t1 = ${coord.t1_coord.toFixed(3)} s, CTI = ${coord.CTI_coord.toFixed(3)} s`);
assert(Math.abs(coord.t2_coord - 0.328) < 0.002, 't2 coord mismatch');
assert(Math.abs(coord.t1_coord - 0.682) < 0.002, 't1 coord mismatch');
assert(Math.abs(coord.CTI_coord - 0.354) < 0.002, 'CTI coord mismatch');

console.log(`- Bus 3 (3-ph fault): t2 = ${coord.t2_bus3.toFixed(3)} s, t1 = ${coord.t1_bus3.toFixed(3)} s, CTI = ${coord.CTI_bus3.toFixed(3)} s`);
assert(Math.abs(coord.t2_bus3 - 0.439) < 0.002, 't2 Bus3 mismatch');
assert(Math.abs(coord.t1_bus3 - 1.046) < 0.002, 't1 Bus3 mismatch');
assert(Math.abs(coord.CTI_bus3 - 0.607) < 0.002, 'CTI Bus3 mismatch');

console.log(`- Bus 3 (2-ph min fault): t2 = ${coord.t2_bus3_2ph.toFixed(3)} s, t1 = ${coord.t1_bus3_2ph.toFixed(3)} s, CTI = ${coord.CTI_bus3_2ph.toFixed(3)} s`);
assert(Math.abs(coord.t2_bus3_2ph - 0.484) < 0.002, 't2 2-ph mismatch');
assert(Math.abs(coord.t1_bus3_2ph - 1.224) < 0.002, 't1 2-ph mismatch');
assert(Math.abs(coord.CTI_bus3_2ph - 0.740) < 0.002, 'CTI 2-ph mismatch');

console.log(`- Coordination Pass: ${coord.isCoordinated}`);
assert.strictEqual(coord.isCoordinated, true, 'Coordination check failed');

// Test 2: Sweep Arrays
console.log('\n[Test 2] Fault Sweep Along Feeders');
const sweep = res.sweep;
console.log(`- Line 1 sweep points: ${sweep.d1.length}`);
console.log(`- Line 2 sweep points: ${sweep.d2.length}`);
console.log(`- Min CTI on Line 2: ${sweep.minCTI.toFixed(3)} s (at distance ${sweep.minCTIDistance.toFixed(2)} km)`);
assert(sweep.minCTI >= 0.354 - 0.002, 'Min CTI mismatch');
assert.strictEqual(sweep.coordinationPass, true, 'Sweep coordination check failed');

// Test 3: Time-Domain Simulation
console.log('\n[Test 3] Time-Domain Simulation');
console.log(`- Fault inception tf: ${sim.tf} s`);
console.log(`- R2 trip time: ${sim.trip2.toFixed(3)} s (duration after tf: ${sim.t2_trip_duration.toFixed(3)} s)`);
console.log(`- Expected analytical t2: ${sim.t2_analytical.toFixed(3)} s`);
assert(Math.abs(sim.t2_trip_duration - sim.t2_analytical) < 0.005, 'Simulation trip duration mismatch with analytical');
console.log(`- R1 trip: ${sim.trip1 === null ? 'None (Did NOT trip)' : sim.trip1 + ' s'}`);
console.log(`- R1 max disk travel: ${(sim.max_acc1 * 100).toFixed(1)}% (Expected ~47%)`);
console.log(`- Selectivity: ${sim.isSelective ? 'PASS (Selective)' : 'FAIL'}`);
assert.strictEqual(sim.isSelective, true, 'Time domain simulation should be selective');
assert(sim.max_acc1 < 0.60, 'R1 should not get close to tripping');

// Test 4: Breaker Failure Backup Operation
console.log('\n[Test 4] Breaker Failure Scenario (CB2 fails to clear)');
const simBkrFail = Engine.runTimeDomainSimulation(res.params, res.system, res.settings, res.coordination, res.curve, {
  breakerFailure: true,
  T: 3.0
});
console.log(`- R2 trip: ${simBkrFail.trip2.toFixed(3)} s`);
console.log(`- CB2 cleared: ${simBkrFail.clearedByCB2}`);
console.log(`- R1 backup trip: ${simBkrFail.trip1 !== null ? simBkrFail.trip1.toFixed(3) + ' s (duration: ' + simBkrFail.t1_trip_duration.toFixed(3) + ' s)' : 'None'}`);
assert(simBkrFail.trip1 !== null, 'R1 must trip as backup when CB2 fails');
assert(Math.abs(simBkrFail.t1_trip_duration - simBkrFail.t1_analytical) < 0.005, 'R1 backup duration mismatch');

// Test 5: All IEC Curve Standards
console.log('\n[Test 5] IEC Curve Standards');
const curves = ['IEC_STANDARD_INVERSE', 'IEC_VERY_INVERSE', 'IEC_EXTREMELY_INVERSE', 'IEC_LONG_TIME_INVERSE', 'CUSTOM'];
for (const c of curves) {
  const analysis = Engine.runFullAnalysis({ curveType: c });
  console.log(`- Curve ${c}: TMS1 = ${analysis.coordination.TMS1.toFixed(3)}, t2_bus3 = ${analysis.coordination.t2_bus3.toFixed(3)} s, Coordinated: ${analysis.coordination.isCoordinated}`);
  assert(analysis.coordination.TMS1 > 0, `TMS1 invalid for ${c}`);
  assert(analysis.coordination.t2_bus3 > 0, `t2 invalid for ${c}`);
}

// Test 6: Export Functions
console.log('\n[Test 6] MATLAB Script & CSV Exporters');
const mScript = Engine.exportToMatlab(res.params);
assert(mScript.includes('V_LL   = 11000;'), 'MATLAB export missing voltage');
assert(mScript.includes('idmt'), 'MATLAB export missing idmt function');
console.log('- MATLAB export generated successfully (length: ' + mScript.length + ' chars)');

const csvSweep = Engine.exportSweepToCSV(res.sweep);
assert(csvSweep.startsWith('Line,Distance_from_Bus1_km'), 'CSV sweep header invalid');
console.log('- CSV sweep export generated successfully (length: ' + csvSweep.length + ' chars)');

const csvSim = Engine.exportSimulationToCSV(res.simulation);
assert(csvSim.startsWith('Time_s,Current_R1_A'), 'CSV simulation header invalid');
console.log('- CSV simulation export generated successfully (length: ' + csvSim.length + ' chars)');

console.log('\n====================================================');
console.log('ALL TESTS PASSED WITH 100% ACCURACY!');
console.log('====================================================');

// Test 7: Edge cases and parameter sweeps
console.log('\n[Test 7] Robustness & Edge Cases');
const robustCases = [
  { Ssc: 100e6, L1: 10, L2: 8 },
  { Ssc: 1000e6, L1: 1, L2: 1 },
  { CTI: 0.20, TMS2: 0.05 },
  { CTI: 0.40, TMS2: 0.20 },
  { TMS1_auto: false, TMS1_manual: 0.25 },
  { TMS1_discrete: false },
  { S2: 1e6, S3: 1e6 },
  { S2: 8e6, S3: 8e6 }
];

for (let idx = 0; idx < robustCases.length; idx++) {
  const caseParams = robustCases[idx];
  const out = Engine.runFullAnalysis(caseParams);
  assert(!isNaN(out.system.If3_bus2), `Case ${idx} NaN If3_bus2`);
  assert(!isNaN(out.coordination.TMS1), `Case ${idx} NaN TMS1`);
  assert(out.sweep.feeder_If.length > 0, `Case ${idx} empty sweep`);
  assert(out.tcc.current.length > 0, `Case ${idx} empty TCC`);
  assert(out.simulation.timeSeries.t.length > 0, `Case ${idx} empty sim`);
}
console.log('- All 8 robust edge test cases executed successfully without NaN or crashes!');

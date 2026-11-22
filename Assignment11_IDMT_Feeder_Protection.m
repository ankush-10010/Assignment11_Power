%% =====================================================================
%  Assignment 11 : Feeder protection of a 3-bus radial system
%                  using IDMT (IEC Standard Inverse) overcurrent relays
%
%  System :   Source --[R1]--Line1-- Bus2 --[R2]--Line2-- Bus3
%             (Bus1)                  |                    |
%                                   Load2                Load3
%
%  R2 : primary protection for Line 2, backup is R1
%  R1 : primary protection for Line 1, backup for Line 2
%
%  Steps:
%   1. System data & load currents
%   2. Fault-current calculation (3-ph max, 2-ph min)
%   3. Relay settings (CT, plug setting, TMS) with CTI coordination
%   4. Verification: fault sweep along both lines
%   5. Time-domain simulation (disk-integrator relay model)
%   6. Plots (TCC, operating times, CTI, time-domain)
%  Works in MATLAB R2016b or newer (local functions at end of file).
%  Change the DATA section to suit your own roll-number-specific data.
% =====================================================================
clear; clc; close all;

%% 1. SYSTEM DATA ------------------------------------------------------
V_LL   = 11e3;                 % line-to-line voltage [V]
Ssc    = 250e6;                % source short-circuit level [VA]
Zs     = 1j * V_LL^2 / Ssc;    % source reactance [ohm]

z1     = 0.30 + 1j*0.40;       % line impedance [ohm/km]
L1     = 5;                    % Line 1 length (Bus1-Bus2) [km]
L2     = 4;                    % Line 2 length (Bus2-Bus3) [km]
ZL1    = z1*L1;
ZL2    = z1*L2;

S2     = 3e6;                  % load at Bus 2 [VA]
S3     = 4e6;                  % load at Bus 3 [VA]
IL2    = S2/(sqrt(3)*V_LL);    % load current Bus2 [A]
IL3    = S3/(sqrt(3)*V_LL);    % load current Bus3 [A]
I_R2   = IL3;                  % normal current through R2
I_R1   = IL2 + IL3;            % normal current through R1

%% 2. FAULT CURRENTS ---------------------------------------------------
Vph = V_LL/sqrt(3);
If3_bus2 = abs(Vph/(Zs + ZL1));            % 3-ph fault at Bus 2
If3_bus3 = abs(Vph/(Zs + ZL1 + ZL2));      % 3-ph fault at Bus 3
If2_bus3 = (sqrt(3)/2)*If3_bus3;           % 2-ph (min) fault at Bus 3

fprintf('--- Load currents ---\n');
fprintf('Through R1 = %.1f A,  through R2 = %.1f A\n', I_R1, I_R2);
fprintf('--- Fault currents ---\n');
fprintf('3-ph fault Bus2 = %.0f A\n', If3_bus2);
fprintf('3-ph fault Bus3 = %.0f A\n', If3_bus3);
fprintf('2-ph fault Bus3 = %.0f A (minimum)\n\n', If2_bus3);

%% 3. RELAY SETTINGS ---------------------------------------------------
% IEC Standard Inverse: t = TMS * k / ((I/Ipu)^a - 1)
k = 0.14;  a = 0.02;
CTI   = 0.3;                   % coordination time interval [s]
OLF   = 1.25;                  % overload factor for pick-up
CT1   = 600;  CT2 = 300;       % CT primary ratings (secondary = 1 A)
Tcb   = 0.05;                  % breaker opening time [s]

% Plug setting (PS) : 0.05..2.0 in steps of 0.05, must give pick-up
% above OLF*load and below minimum fault current
PS2 = ceil((OLF*I_R2/CT2)/0.05)*0.05;
PS1 = ceil((OLF*I_R1/CT1)/0.05)*0.05;
Ipu2 = PS2*CT2;   Ipu1 = PS1*CT1;
assert(Ipu2 < If2_bus3, 'R2 pick-up exceeds minimum fault current');
assert(Ipu1 < If2_bus3, 'R1 pick-up exceeds minimum fault current');

% R2 (most downstream) : lowest practical TMS
TMS2 = 0.10;
t2_max = idmt(If3_bus3, Ipu2, TMS2, k, a);      % R2 time for Bus3 fault

% R1 : coordination is checked at the MAXIMUM fault current seen by R2,
% i.e. a fault just beyond R2 (Bus 2 end of Line 2). Here the inverse
% curves are closest together, so this is the critical point.
I_coord  = If3_bus2;
t2_coord = idmt(I_coord, Ipu2, TMS2, k, a);
t1_req   = t2_coord + CTI;
TMS1 = t1_req / idmt(I_coord, Ipu1, 1, k, a);
TMS1 = ceil(TMS1/0.025)*0.025;                  % round up to 0.025 step

fprintf('--- Relay settings ---\n');
fprintf('R2: CT %d/1, PS = %.2f (pick-up %.0f A), TMS = %.3f\n', CT2, PS2, Ipu2, TMS2);
fprintf('R1: CT %d/1, PS = %.2f (pick-up %.0f A), TMS = %.3f\n\n', CT1, PS1, Ipu1, TMS1);

%% 4. VERIFICATION : FAULT SWEEP ALONG THE FEEDERS ---------------------
% Line 1 : fault from Bus1 (0 km) to Bus2 (L1 km)
% Line 2 : fault from Bus2 to Bus3
d1 = linspace(0.05, L1, 100);
d2 = linspace(0.00, L2, 100);
If_l1 = abs(Vph ./ (Zs + z1*d1));
If_l2 = abs(Vph ./ (Zs + ZL1 + z1*d2));

t1_l1 = idmt(If_l1, Ipu1, TMS1, k, a);      % R1 time, fault on Line 1
t1_l2 = idmt(If_l2, Ipu1, TMS1, k, a);      % R1 as backup, fault on Line 2
t2_l2 = idmt(If_l2, Ipu2, TMS2, k, a);      % R2 time, fault on Line 2
cti_l2 = t1_l2 - t2_l2;

fprintf('--- Verification ---\n');
fprintf('Min CTI over Line 2 faults      = %.3f s (required %.2f s)\n', min(cti_l2), CTI);
fprintf('R2 time for Bus3 fault          = %.3f s\n', t2_max);
fprintf('R1 backup time for Bus3 fault   = %.3f s\n', idmt(If3_bus3,Ipu1,TMS1,k,a));
fprintf('R1 time for Bus2 fault          = %.3f s\n', idmt(If3_bus2,Ipu1,TMS1,k,a));
if min(cti_l2) >= CTI - 1e-9
    fprintf('Coordination: PASS\n\n');
else
    fprintf('Coordination: FAIL - increase TMS1\n\n');
end

%% 5. TIME-DOMAIN SIMULATION ------------------------------------------
% 3-ph fault at Bus3 at t = tf. Relays modelled as disk integrators:
%   acc += dt / t_op(I)  while I > pick-up ; trips when acc >= 1
dt = 1e-3;  T = 3;  t = 0:dt:T;  tf = 0.5;
N = numel(t);
I1 = zeros(1,N); I2 = zeros(1,N);
acc1 = zeros(1,N); acc2 = zeros(1,N);
trip2 = NaN; trip1 = NaN; clr = NaN; cleared = false;

for n = 1:N
    if t(n) < tf                     % normal operation
        I2(n) = I_R2;  I1(n) = I_R1;
    elseif ~cleared                  % fault on Line 2 (Bus3)
        I2(n) = If3_bus3;  I1(n) = If3_bus3;
    else                             % Line 2 isolated by CB2
        I2(n) = 0;  I1(n) = IL2;
    end
    if n > 1
        acc2(n) = relay_step(acc2(n-1), I2(n), Ipu2, TMS2, k, a, dt);
        acc1(n) = relay_step(acc1(n-1), I1(n), Ipu1, TMS1, k, a, dt);
    end
    if isnan(trip2) && acc2(n) >= 1
        trip2 = t(n);  clr = trip2 + Tcb;
    end
    if ~cleared && ~isnan(clr) && t(n) >= clr
        cleared = true;
    end
    if isnan(trip1) && acc1(n) >= 1
        trip1 = t(n);
    end
end
fprintf('--- Time-domain simulation (3-ph fault at Bus3, t = %.2f s) ---\n', tf);
fprintf('R2 trip time = %.3f s after fault (analytical %.3f s)\n', trip2-tf, t2_max);
if isnan(trip1)
    fprintf('R1 did NOT trip -> selective operation (R1 only reached %.0f%% of its disk travel)\n', 100*max(acc1));
else
    fprintf('R1 tripped at %.3f s -> loss of selectivity\n', trip1-tf);
end

%% 6. PLOTS ------------------------------------------------------------
Iplot = logspace(log10(1.05*max(Ipu1,Ipu2)), log10(1.2*If3_bus2), 300);

figure('Name','TCC','Color','w');
loglog(Iplot, idmt(Iplot,Ipu1,TMS1,k,a), 'b','LineWidth',1.8); hold on;
loglog(Iplot, idmt(Iplot,Ipu2,TMS2,k,a), 'r','LineWidth',1.8);
xline(If3_bus3,'k--','Fault Bus3'); xline(If3_bus2,'k-.','Fault Bus2');
grid on; xlabel('Current [A]'); ylabel('Operating time [s]');
legend('R1 (backup)','R2 (primary)','Location','northeast');
title('Time-current characteristics of R1 and R2');

figure('Name','Fault sweep','Color','w');
subplot(2,1,1);
plot([d1, L1+d2], [If_l1, If_l2], 'LineWidth',1.6); grid on;
xlabel('Distance from Bus1 [km]'); ylabel('3-ph fault current [A]');
title('Fault current along the feeders');
subplot(2,1,2);
plot(L1+d2, t2_l2,'r','LineWidth',1.6); hold on;
plot(L1+d2, t1_l2,'b','LineWidth',1.6);
plot(L1+d2, cti_l2,'g--','LineWidth',1.4);
yline(CTI,'k:','CTI = 0.3 s'); grid on;
xlabel('Fault position on Line 2 [km from Bus1]'); ylabel('Time [s]');
legend('R2','R1 (backup)','CTI','Location','northeast');
title('Operating times for faults on Line 2');

figure('Name','Time domain','Color','w');
subplot(3,1,1);
plot(t,I1,'b',t,I2,'r','LineWidth',1.4); grid on;
ylabel('RMS current [A]'); legend('I_{R1}','I_{R2}');
title(sprintf('Time-domain simulation: 3-ph fault at Bus3, t = %.1f s', tf));
subplot(3,1,2);
plot(t,acc1,'b',t,acc2,'r','LineWidth',1.4); hold on; yline(1,'k--','Trip');
grid on; ylabel('Disk integrator'); legend('R1','R2');
subplot(3,1,3);
stairs(t, double(t>=trip2),'r','LineWidth',1.6); hold on;
if isnan(trip1), stairs(t, zeros(1,N),'b','LineWidth',1.6);
else, stairs(t, double(t>=trip1),'b','LineWidth',1.6); end
ylim([-0.1 1.2]); grid on; xlabel('Time [s]'); ylabel('Trip signal');
legend('R2 (CB2)','R1 (CB1)');

%% Export figures for the report (white background)
figs = {'TCC','Fault sweep','Time domain'};
names = {'fig_tcc.png','fig_sweep.png','fig_timedomain.png'};
for i = 1:3
    f = findobj('Type','figure','Name',figs{i});
    try, theme(f,'light'); catch, end
    try, exportgraphics(f, names{i}, 'Resolution',200, 'BackgroundColor','white');
    catch, saveas(f, names{i}); end
end

%% Results table ------------------------------------------------------
Fault   = {'Bus2 (3-ph)';'Bus3 (3-ph)';'Bus3 (2-ph)'};
If_     = [If3_bus2; If3_bus3; If2_bus3];
R1_time = idmt(If_, Ipu1, TMS1, k, a);
R2_time = idmt(If_, Ipu2, TMS2, k, a);
R2_time(1) = NaN;     % Bus2 fault is outside R2's zone
disp(table(Fault, round(If_), R1_time, R2_time, ...
     'VariableNames', {'Fault','If_A','R1_s','R2_s'}));

%% ===================== LOCAL FUNCTIONS ==============================
function t = idmt(I, Ipu, TMS, k, a)
% IEC IDMT operating time; Inf if current below pick-up
    PSM = I ./ Ipu;
    t = TMS .* k ./ (PSM.^a - 1);
    t(PSM <= 1) = Inf;
end

function acc = relay_step(acc_prev, I, Ipu, TMS, k, a, dt)
% Disk-integrator update: forward while above pick-up, slow reset below
    if I > Ipu
        acc = acc_prev + dt / idmt(I, Ipu, TMS, k, a);
    else
        acc = max(acc_prev - dt/10, 0);
    end
end

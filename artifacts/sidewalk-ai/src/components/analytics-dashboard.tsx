import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
  Legend,
} from 'recharts';
import {
  BarChart3,
  PieChart as PieIcon,
  GitFork,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ShieldAlert,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import type { AnalysisResult } from '@workspace/api-client-react';

interface AnalyticsDashboardProps {
  result: AnalysisResult;
  isVideo?: boolean;
}

const PALETTE = [
  '#2b5044', // Dark Emerald
  '#d97736', // Terracotta
  '#4c7964', // Sage Green
  '#b87a49', // Copper / Bronze
  '#3b82f6', // Cobalt Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#eab308', // Amber
];

export function AnalyticsDashboard({ result, isVideo }: AnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'bar' | 'pie' | 'flow'>('all');
  const [pieMode, setPieMode] = useState<'clearance' | 'categories'>('clearance');

  const detections = result.detections || [];
  const score = result.accessibility_score ?? 90;
  const walkable = result.walkable_percentage ?? 95;
  const blocked = Math.max(0, Math.round((100 - walkable) * 10) / 10);

  // Group detections by label for bar and pie charts
  const { barData, categoryPieData, totalDetections } = useMemo(() => {
    const counts: Record<string, { count: number; totalConf: number }> = {};
    for (const d of detections) {
      const label = String(d.label || 'obstacle').toLowerCase();
      const conf = typeof d.confidence === 'number' ? d.confidence : 0;
      if (!counts[label]) {
        counts[label] = { count: 0, totalConf: 0 };
      }
      counts[label].count += 1;
      counts[label].totalConf += conf;
    }

    const bData = Object.entries(counts).map(([label, info]) => ({
      name: label.charAt(0).toUpperCase() + label.slice(1),
      count: info.count,
      avgConfidence: Math.round((info.totalConf / info.count) * 100),
    }));

    // Sort descending by count
    bData.sort((a, b) => b.count - a.count);

    const cData = bData.map((item, idx) => ({
      name: item.name,
      value: item.count,
      color: PALETTE[idx % PALETTE.length],
    }));

    return {
      barData: bData,
      categoryPieData: cData,
      totalDetections: detections.length,
    };
  }, [detections]);

  // Data for Walkable vs Blocked Space Pie Chart
  const clearancePieData = useMemo(() => [
    { name: 'Walkable Space', value: walkable, color: '#3d7a64' },
    { name: 'Blocked / Obstacles', value: blocked, color: '#d97736' },
  ], [walkable, blocked]);

  // Flowchart Decision Status
  const isSafe = score >= 75;
  const isModerate = score >= 50 && score < 75;
  const decisionBadge = isSafe
    ? { label: 'Low Obstruction / Accessible', color: '#2e7d32', bg: '#e8f5e9', icon: CheckCircle2 }
    : isModerate
    ? { label: 'Moderate Obstruction / Caution', color: '#ed6c02', bg: '#fff4e5', icon: AlertTriangle }
    : { label: 'High Obstruction / Impeded', color: '#d32f2f', bg: '#ffebee', icon: XCircle };

  const DecisionIcon = decisionBadge.icon;

  return (
    <section className="analytics-section" aria-label="Visual Analytics & Diagnostics" style={{ marginTop: 24 }}>
      <div className="section-heading" style={{ marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, color: '#273e37', font: '700 20px var(--app-font-display)', letterSpacing: '-0.03em' }}>
            Diagnostic Analytics & Visual Breakdown
          </h2>
          <p style={{ margin: '4px 0 0', color: '#748078', fontSize: 12 }}>
            Interactive charts and decision flow derived from YOLOv8-nano inference and spatial clearance models.
          </p>
        </div>
        <div className="analytics-tabs" style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all', label: 'All Analytics', icon: Layers },
            { id: 'bar', label: 'Bar Chart', icon: BarChart3 },
            { id: 'pie', label: 'Pie Chart', icon: PieIcon },
            { id: 'flow', label: 'Flow Chart', icon: GitFork },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 11px',
                  borderRadius: 6,
                  border: active ? '1px solid #2b5044' : '1px solid #dedbd1',
                  background: active ? '#2b5044' : '#fcfbf8',
                  color: active ? '#f8f5ec' : '#57675f',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {/* BAR CHART & PIE CHART GRID */}
        {(activeTab === 'all' || activeTab === 'bar' || activeTab === 'pie') && (
          <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'all' ? '1fr 1fr' : '1fr', gap: 16 }}>
            {/* 01. BAR CHART */}
            {(activeTab === 'all' || activeTab === 'bar') && (
              <div className="panel" style={{ padding: 18, minHeight: 310, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #e9e6dd', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '700 13px var(--app-font-display)', color: '#273e37' }}>
                    <BarChart3 size={16} color="#2b5044" />
                    <span>Obstacle Category Frequency</span>
                  </div>
                  <span style={{ font: '10px var(--app-font-mono)', color: '#88948d', textTransform: 'uppercase' }}>
                    {totalDetections} Event(s)
                  </span>
                </div>

                {barData.length > 0 ? (
                  <div style={{ width: '100%', height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <XAxis
                          dataKey="name"
                          tick={{ fill: '#64748b', fontSize: 11 }}
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                        />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div style={{ background: '#263d36', color: '#f8fafc', padding: '8px 11px', borderRadius: 6, fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.name}</div>
                                  <div style={{ color: '#d6e5d3' }}>Count: <strong>{d.count}</strong></div>
                                  <div style={{ color: '#e5c18b' }}>Avg Confidence: <strong>{d.avgConfidence}%</strong></div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                          {barData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#7a867f', textAlign: 'center', padding: 24 }}>
                    <CheckCircle2 size={32} color="#4c7964" style={{ marginBottom: 8 }} />
                    <strong style={{ color: '#273e37', fontSize: 13 }}>Pathway Completely Unobstructed</strong>
                    <span style={{ fontSize: 11, marginTop: 4 }}>No physical obstacles or hazards detected in this route segment.</span>
                  </div>
                )}
              </div>
            )}

            {/* 02. PIE CHART */}
            {(activeTab === 'all' || activeTab === 'pie') && (
              <div className="panel" style={{ padding: 18, minHeight: 310, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #e9e6dd', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '700 13px var(--app-font-display)', color: '#273e37' }}>
                    <PieIcon size={16} color="#d97736" />
                    <span>Ground Clearance & Footprint</span>
                  </div>
                  {totalDetections > 0 && (
                    <div style={{ display: 'flex', gap: 4, background: '#eee', padding: 2, borderRadius: 5 }}>
                      <button
                        type="button"
                        onClick={() => setPieMode('clearance')}
                        style={{
                          border: 0,
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 700,
                          background: pieMode === 'clearance' ? '#fff' : 'transparent',
                          color: pieMode === 'clearance' ? '#263d36' : '#777',
                          cursor: 'pointer',
                        }}
                      >
                        Clearance %
                      </button>
                      <button
                        type="button"
                        onClick={() => setPieMode('categories')}
                        style={{
                          border: 0,
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 700,
                          background: pieMode === 'categories' ? '#fff' : 'transparent',
                          color: pieMode === 'categories' ? '#263d36' : '#777',
                          cursor: 'pointer',
                        }}
                      >
                        Categories
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ width: '100%', height: 240, position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={pieMode === 'clearance' ? clearancePieData : categoryPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {(pieMode === 'clearance' ? clearancePieData : categoryPieData).map((entry, index) => (
                          <Cell key={`pie-cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0];
                            return (
                              <div style={{ background: '#263d36', color: '#fff', padding: '6px 10px', borderRadius: 6, fontSize: 11 }}>
                                <strong>{d.name}: </strong>
                                <span>{d.value} {pieMode === 'clearance' ? '%' : 'item(s)'}</span>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => <span style={{ color: '#475569', fontSize: 11, fontWeight: 600 }}>{value}</span>}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  {pieMode === 'clearance' && (
                    <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                      <div style={{ font: '800 16px var(--app-font-display)', color: '#273e37' }}>{walkable}%</div>
                      <div style={{ font: '9px var(--app-font-mono)', color: '#64748b', textTransform: 'uppercase' }}>Walkable</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 03. FLOW CHART (Diagnostic Decision Pipeline) */}
        {(activeTab === 'all' || activeTab === 'flow') && (
          <div className="panel" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid #e9e6dd', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '700 13px var(--app-font-display)', color: '#273e37' }}>
                <GitFork size={16} color="#b87a49" />
                <span>Diagnostic Assessment Pipeline & Decision Flow</span>
              </div>
              <span style={{ font: '10px var(--app-font-mono)', color: '#88948d', textTransform: 'uppercase' }}>
                5 Evaluation Stages
              </span>
            </div>

            <div className="flowchart-container" style={{ display: 'flex', alignItems: 'stretch', gap: 8, overflowX: 'auto', padding: '6px 2px 12px' }}>
              {/* STAGE 1 */}
              <div className="flow-step" style={{ flex: '1 1 0', minWidth: 170, background: '#f8f7f2', border: '1px solid #e2ded5', borderRadius: 8, padding: '12px 14px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ font: '10px var(--app-font-mono)', color: '#94a3b8', textTransform: 'uppercase' }}>01 / Intake</span>
                  <span style={{ background: '#e2e8f0', color: '#475569', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>
                    {isVideo ? 'VIDEO' : 'IMAGE'}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#273e37', marginBottom: 4 }}>Media Verification</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {result.image.width} &times; {result.image.height} px
                  <div style={{ fontSize: 10, marginTop: 2 }}>{(result.image.size_bytes / 1024).toFixed(1)} KB decoded</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', color: '#a0ab9f' }}><ArrowRight size={16} /></div>

              {/* STAGE 2 */}
              <div className="flow-step" style={{ flex: '1 1 0', minWidth: 170, background: '#f8f7f2', border: '1px solid #e2ded5', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ font: '10px var(--app-font-mono)', color: '#94a3b8', textTransform: 'uppercase' }}>02 / Vision AI</span>
                  <span style={{ background: '#dcfce7', color: '#166534', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>
                    ACTIVE
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#273e37', marginBottom: 4 }}>YOLOv8-nano</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  <strong>{totalDetections}</strong> hazard(s) located
                  <div style={{ fontSize: 10, marginTop: 2 }}>{result.processing_ms} ms runtime</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', color: '#a0ab9f' }}><ArrowRight size={16} /></div>

              {/* STAGE 3 */}
              <div className="flow-step" style={{ flex: '1 1 0', minWidth: 170, background: '#f8f7f2', border: '1px solid #e2ded5', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ font: '10px var(--app-font-mono)', color: '#94a3b8', textTransform: 'uppercase' }}>03 / Clearance</span>
                  <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>
                    ESTIMATED
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#273e37', marginBottom: 4 }}>Ground Coverage</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  <strong>{walkable}%</strong> clear path
                  <div style={{ fontSize: 10, marginTop: 2 }}>{blocked}% blocked space</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', color: '#a0ab9f' }}><ArrowRight size={16} /></div>

              {/* STAGE 4 */}
              <div className="flow-step" style={{ flex: '1 1 0', minWidth: 170, background: '#f8f7f2', border: '1px solid #e2ded5', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ font: '10px var(--app-font-mono)', color: '#94a3b8', textTransform: 'uppercase' }}>04 / Scoring</span>
                  <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>
                    INDEX
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#273e37', marginBottom: 4 }}>Accessibility Score</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  <strong>{score} / 100</strong> rating
                  <div style={{ fontSize: 10, marginTop: 2 }}>Penalty: -{(totalDetections * 3.2).toFixed(1)} pts</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', color: '#a0ab9f' }}><ArrowRight size={16} /></div>

              {/* STAGE 5 (FINAL OUTCOME) */}
              <div className="flow-step" style={{ flex: '1.2 1 0', minWidth: 190, background: decisionBadge.bg, border: `1px solid ${decisionBadge.color}50`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ font: '10px var(--app-font-mono)', color: decisionBadge.color, textTransform: 'uppercase', fontWeight: 700 }}>05 / Verdict</span>
                  <DecisionIcon size={14} color={decisionBadge.color} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 12, color: decisionBadge.color, marginBottom: 4 }}>
                  {decisionBadge.label}
                </div>
                <div style={{ fontSize: 10.5, color: '#334155', lineHeight: 1.4 }}>
                  {isSafe
                    ? 'Sidewalk corridor largely free of physical obstructions.'
                    : isModerate
                    ? 'Path contains noticeable obstacles; transit caution advised.'
                    : 'Major physical barriers present; significant accessibility risk.'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

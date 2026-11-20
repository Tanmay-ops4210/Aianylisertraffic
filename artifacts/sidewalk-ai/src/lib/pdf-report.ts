import type { AnalysisResult } from '@workspace/api-client-react';

export function openPdfReport(result: AnalysisResult, isVideo?: boolean) {
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    alert('Please allow popups to open and download the PDF report.');
    return;
  }

  const score = result.accessibility_score ?? 90;
  const walkable = result.walkable_percentage ?? 95;
  const detCount = result.detections.length;
  const isSafe = score >= 75;
  const isModerate = score >= 50 && score < 75;

  const statusLabel = isSafe ? 'Low Obstruction / Accessible' : isModerate ? 'Moderate Obstruction / Caution' : 'High Obstruction / Impeded';
  const statusColor = isSafe ? '#2e7d32' : isModerate ? '#ed6c02' : '#d32f2f';
  const statusBg = isSafe ? '#e8f5e9' : isModerate ? '#fff4e5' : '#ffebee';

  const previewSrc = result.processed_preview_base64
    ? (isVideo
        ? `data:image/gif;base64,${result.processed_preview_base64}`
        : `data:image/jpeg;base64,${result.processed_preview_base64}`)
    : null;

  const detectionsRows = result.detections.map((d, i) => {
    const label = String(d.label || 'Obstacle');
    const conf = typeof d.confidence === 'number' ? Math.round(d.confidence * 100) : 0;
    const box = Array.isArray(d.box) ? (d.box as number[]).map(v => Math.round(v)).join(', ') : 'N/A';
    const ts = typeof d.timestamp_sec === 'number' ? `${d.timestamp_sec}s` : '—';
    return `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-family: monospace;">#${i + 1}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-weight: 600; text-transform: capitalize;">${label}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0;">
          <span style="background: #eef2f6; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600;">${conf}%</span>
        </td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-family: monospace; font-size: 11px;">[${box}]</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-size: 11px;">${ts}</td>
      </tr>
    `;
  }).join('');

  const reportId = `SWA-${Date.now().toString(36).toUpperCase()}`;
  const generationDate = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>SidewalkAI_Audit_Report_${reportId}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm;
        }
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #2c3e35;
          margin: 0;
          padding: 24px;
          background: #fff;
          font-size: 12px;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #2b5044;
          padding-bottom: 14px;
          margin-bottom: 18px;
        }
        .brand {
          font-size: 20px;
          font-weight: 800;
          color: #24463c;
          letter-spacing: -0.5px;
        }
        .brand span { color: #b87a49; }
        .meta-table { font-size: 11px; color: #555; }
        .meta-table td { padding: 1px 0; }
        .meta-table strong { color: #222; }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 18px;
        }
        .card {
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 10px 12px;
          background: #f8fafc;
        }
        .card-label {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .card-value {
          font-size: 18px;
          font-weight: 800;
          color: #1e293b;
        }

        .verdict-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-radius: 6px;
          background: ${statusBg};
          border: 1px solid ${statusColor}40;
          margin-bottom: 18px;
        }
        .verdict-title {
          font-weight: 700;
          font-size: 13px;
          color: ${statusColor};
        }

        .section-title {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 4px;
          margin: 18px 0 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .preview-box {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 10px;
          text-align: center;
          background: #f1f5f9;
          margin-bottom: 16px;
          page-break-inside: avoid;
        }
        .preview-box img {
          max-width: 100%;
          max-height: 290px;
          border-radius: 4px;
          display: inline-block;
        }

        table.detections-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin-bottom: 18px;
          page-break-inside: auto;
        }
        table.detections-table th {
          background: #f1f5f9;
          text-align: left;
          padding: 8px 10px;
          font-weight: 700;
          color: #475569;
          border-bottom: 2px solid #cbd5e1;
          text-transform: uppercase;
          font-size: 9px;
          letter-spacing: 0.05em;
        }
        table.detections-table tr {
          page-break-inside: avoid;
        }

        .limits-list {
          padding-left: 18px;
          margin: 6px 0;
          font-size: 10.5px;
          color: #475569;
        }
        .limits-list li { margin-bottom: 3px; }

        .disclaimer-box {
          border-left: 3px solid #b87a49;
          background: #fdfaf6;
          padding: 8px 12px;
          font-size: 10px;
          color: #78716c;
          margin-top: 14px;
          page-break-inside: avoid;
        }

        .no-print-bar {
          background: #2b5044;
          color: #fff;
          padding: 10px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: -24px -24px 20px -24px;
          font-size: 12px;
        }
        .print-btn {
          background: #e5c18b;
          color: #1e3d33;
          border: none;
          padding: 7px 14px;
          border-radius: 4px;
          font-weight: 700;
          cursor: pointer;
          font-size: 12px;
        }
        .print-btn:hover { background: #dcb375; }

        @media print {
          .no-print-bar { display: none; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="no-print-bar">
        <span><strong>SidewalkAI Report Preview</strong> &middot; Click Print to save as PDF or print this document.</span>
        <button class="print-btn" onclick="window.print()">Save as PDF / Print</button>
      </div>

      <div class="header">
        <div>
          <div class="brand">Sidewalk<span>AI</span> Research Desk</div>
          <div style="font-size: 12px; font-weight: 700; color: #475569; margin-top: 2px;">
            Sidewalk Obstacle Inspection & Accessibility Audit
          </div>
        </div>
        <table class="meta-table">
          <tr><td>Report ID:</td><td style="text-align: right;"><strong>${reportId}</strong></td></tr>
          <tr><td>Generated:</td><td style="text-align: right;"><strong>${generationDate}</strong></td></tr>
          <tr><td>Engine:</td><td style="text-align: right;"><strong>YOLOv8-nano ONNX</strong></td></tr>
        </table>
      </div>

      <div class="summary-grid">
        <div class="card">
          <div class="card-label">Accessibility Score</div>
          <div class="card-value" style="color: ${statusColor};">${score} / 100</div>
        </div>
        <div class="card">
          <div class="card-label">Walkable Ground Space</div>
          <div class="card-value">${walkable}%</div>
        </div>
        <div class="card">
          <div class="card-label">Obstacles Identified</div>
          <div class="card-value">${detCount}</div>
        </div>
        <div class="card">
          <div class="card-label">Inference Runtime</div>
          <div class="card-value">${result.processing_ms} ms</div>
        </div>
      </div>

      <div class="verdict-banner">
        <div>
          <div class="verdict-title">Diagnostic Finding: ${statusLabel}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">
            Target: <strong>${result.image.filename}</strong> (${result.image.width} &times; ${result.image.height} px, ${(result.image.size_bytes / 1024).toFixed(1)} KB)
          </div>
        </div>
        <div style="font-size: 11px; font-weight: 700; color: ${statusColor}; text-transform: uppercase;">
          ${detCount === 0 ? 'Clear Pathway' : `${detCount} Hazard(s)`}
        </div>
      </div>

      ${previewSrc ? `
        <div class="section-title">Visual Evidence & Detection Overlay</div>
        <div class="preview-box">
          <img src="${previewSrc}" alt="Processed detection output" />
          <div style="font-size: 10px; color: #64748b; margin-top: 6px;">
            ${isVideo ? 'Sampled video keyframe detections overlay' : 'YOLOv8-nano object detection bounding boxes & confidence ratings'}
          </div>
        </div>
      ` : ''}

      <div class="section-title">Obstacle Inventory Table (${detCount} entries)</div>
      ${detCount > 0 ? `
        <table class="detections-table">
          <thead>
            <tr>
              <th>Index</th>
              <th>Obstacle Classification</th>
              <th>Confidence</th>
              <th>Bounding Coordinates [X1, Y1, X2, Y2]</th>
              <th>Timeline</th>
            </tr>
          </thead>
          <tbody>
            ${detectionsRows}
          </tbody>
        </table>
      ` : `
        <div style="padding: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; text-align: center; color: #64748b; margin-bottom: 16px;">
          No physical obstacles detected in the evaluated path corridor.
        </div>
      `}

      <div class="section-title">Audit Limitations & Verification Parameters</div>
      <ul class="limits-list">
        ${result.limitations.map(l => `<li>${l}</li>`).join('')}
      </ul>

      <div class="disclaimer-box">
        <strong>Research Notice:</strong> This report is produced by SidewalkAI for preliminary visual diagnostics only. It does not constitute ADA/regulatory certification, engineering approval, or a definitive guarantee of wheelchair or pedestrian safety.
      </div>

      <script>
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            window.print();
          }, 400);
        });
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

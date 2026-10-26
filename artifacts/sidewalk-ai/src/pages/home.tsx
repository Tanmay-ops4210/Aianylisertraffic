import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  CircleHelp,
  FileImage,
  Image as ImageIcon,
  Info,
  Map,
  MousePointer2,
  ScanLine,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { getSidewalkHealthQueryKey, useAnalyzeSidewalkImage, useSidewalkHealth } from '@workspace/api-client-react';
import type { AnalysisResult } from '@workspace/api-client-react';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'The image could not be analyzed. Please try again.';
}

function StatusSkeleton() {
  return (
    <div className="service-card" aria-label="Loading service status">
      <div className="service-overline">Service status</div>
      <div className="skeleton" style={{ height: 23, width: 180, marginTop: 27 }} />
      <div className="skeleton" style={{ height: 35, width: '85%', marginTop: 17 }} />
      <div className="skeleton" style={{ height: 38, width: '100%', marginTop: 24 }} />
      <div className="skeleton" style={{ height: 38, width: '100%', marginTop: 10 }} />
    </div>
  );
}

function ResultImage({
  previewUrl,
  processedPreviewUrl,
  result,
}: {
  previewUrl: string | null;
  processedPreviewUrl: string | null;
  result: AnalysisResult | null;
}) {
  return (
    <div className="result-grid" aria-label="Image availability comparison">
      <section className="panel image-card" aria-label="Original image">
        <div className="image-head">
          <span className="image-label">01 / Original image</span>
          <span className="image-state">{previewUrl ? 'Source available' : 'Awaiting upload'}</span>
        </div>
        <div className="image-stage">
          {previewUrl ? (
            <img src={previewUrl} alt="Original uploaded sidewalk scene" data-testid="img-original-preview" />
          ) : (
            <div className="image-empty">
              <span className="unavailable-mark"><ImageIcon size={19} strokeWidth={1.5} /></span>
              <span>Original image appears here</span>
            </div>
          )}
        </div>
      </section>
      <section className="panel image-card" aria-label="Processed image availability">
        <div className="image-head">
          <span className="image-label">02 / Processed result</span>
          <span className="image-state">{result?.processed_image_available ? 'Available' : 'Not available'}</span>
        </div>
        <div className="image-stage">
          {processedPreviewUrl ? (
            <figure className="processed-figure">
              <img src={processedPreviewUrl} alt="Grayscale gradient edge preview; not an obstacle detection or sidewalk segmentation" data-testid="img-processed-preview" />
              <figcaption>Grayscale edge preview · not a segmentation mask</figcaption>
            </figure>
          ) : (
            <div className="image-empty">
              <span className="unavailable-mark"><ScanLine size={19} strokeWidth={1.5} /></span>
              <span>{result?.processed_image_available ? 'Processed preview is unavailable in this response.' : 'Run inspection to create a baseline edge preview'}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ResultDetails({ result }: { result: AnalysisResult | null }) {
  const modelConfigured = result?.model_configured === true;
  const metrics = [
    { label: 'Detections', value: result?.detections_available ? String(result.detections.length) : 'Unavailable' },
    { label: 'Walkable space', value: !modelConfigured || result?.walkable_percentage == null ? 'Unavailable' : `${result.walkable_percentage}%` },
    { label: 'Accessibility score', value: !modelConfigured || result?.accessibility_score == null ? 'Unavailable' : String(result.accessibility_score) },
  ];

  return (
    <div className="result-columns">
      <section className="panel metrics-panel">
        <div className="subheading"><Map size={15} /> Findings & availability</div>
        <div className="metric-list" data-testid="results-metrics">
          {metrics.map((metric) => {
            const unavailable = metric.value === 'Unavailable';
            return (
              <div className="metric" key={metric.label}>
                <div className="metric-name">{metric.label}</div>
                <div className={`metric-value${unavailable ? ' na' : ''}`} data-testid={`metric-${metric.label.toLowerCase().replaceAll(' ', '-')}`}>
                  {metric.value}
                </div>
              </div>
            );
          })}
        </div>
        <div className="file-row" style={{ marginTop: 12 }}>
          <div className="file-tile"><Info size={16} /></div>
          <div className="file-detail">
            <div className="file-name">Mask outputs</div>
            <div className="file-size">Sidewalk: {result?.sidewalk_mask_available ? 'available' : 'unavailable'} · Obstacles: {result?.obstacle_masks_available ? 'available' : 'unavailable'}</div>
          </div>
          {result?.sidewalk_mask_available || result?.obstacle_masks_available
            ? <Check size={16} color="#4c7964" aria-label="Some masks available" />
            : <X size={16} color="#a28e76" aria-label="Masks unavailable" />}
        </div>
      </section>
      <section className="panel limits-panel">
        <div className="subheading"><ShieldAlert size={15} /> Limits of this result</div>
        <p className="limits-intro">Read these constraints alongside any output. Missing evidence is not a positive finding.</p>
        <ul className="limit-list" data-testid="limitations-list">
          {!modelConfigured && <li><AlertCircle size={13} />No trained model is configured for this analysis.</li>}
          {!modelConfigured && <li><AlertCircle size={13} />Detections, walkable space, and accessibility score are unavailable.</li>}
          {result?.limitations.map((limitation, index) => (
            <li key={`${index}-${limitation}`}><AlertCircle size={13} />{limitation}</li>
          ))}
          <li><AlertCircle size={13} />No certification or safety claim is made.</li>
        </ul>
        <p className="limits-intro" style={{ marginBottom: 0, marginTop: 11 }}>
          {result ? `Processed in ${result.processing_ms} ms. Image dimensions and file details are recorded in the report.` : 'Run an image inspection to record the returned image details and processing status.'}
        </p>
      </section>
    </div>
  );
}

export default function Home() {
  const healthQuery = useSidewalkHealth({
    query: { queryKey: getSidewalkHealthQueryKey(), retry: 1 },
  });
  const analyzeMutation = useAnalyzeSidewalkImage();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [validationError, setValidationError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = (candidate?: File) => {
    setValidationError('');
    if (!candidate) return;
    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      setValidationError('Choose a JPG, PNG, or WebP image. Other formats are not supported.');
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setValidationError('This image is larger than 15 MB. Choose a smaller file.');
      return;
    }
    if (candidate.size === 0) {
      setValidationError('This file is empty. Choose a valid image.');
      return;
    }
    setFile(candidate);
    setResult(null);
    analyzeMutation.reset();
  };

  const downloadReport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${result.image.filename.replace(/\.[^.]+$/, '')}-sidewalk-report.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const serviceUnavailable = healthQuery.isError;
  const isConfigured = healthQuery.data?.model_configured === true;
  const doAnalyze = () => {
    if (!file || analyzeMutation.isPending) return;
    setResult(null);
    analyzeMutation.mutate({ data: { image: file } }, {
      onSuccess: (analysis) => setResult(analysis),
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="SidewalkAI research desk">
          <span className="brand-mark"><Map size={17} strokeWidth={2} /></span>
          <span>Sidewalk<span style={{ color: '#b87a49' }}>AI</span></span>
        </div>
        <div className="topbar-meta" data-testid="status-service">
          <span className="service-dot" style={{ background: healthQuery.isLoading ? '#c6a66c' : isConfigured ? '#6c9c75' : '#c38250' }} />
          {healthQuery.isLoading ? 'Checking service' : serviceUnavailable ? 'Service status unknown' : isConfigured ? 'Model configured' : 'Model not configured'}
        </div>
      </header>

      <main className="page-wrap">
        <div className="eyebrow">Field research / visual audit desk</div>
        <div className="intro">
          <div>
            <h1>Inspect the evidence.<br />Name the limits.</h1>
            <p>A practical workspace for reviewing sidewalk imagery. Upload a scene to inspect what the service returns—and what it cannot yet support.</p>
          </div>
          <div className="intro-note">Built for careful observation, not automated certification. Every unavailable signal stays visible.</div>
        </div>

        <section className="desk-grid" aria-label="Image analysis workspace">
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Image intake</h2>
              <span className="step-tag">Step 01 / Provide source</span>
            </div>
            <div className="upload-body">
              <div
                className={`dropzone${isDragging ? ' is-dragging' : ''}`}
                role="button"
                tabIndex={0}
                aria-label="Choose a sidewalk image or drop it here"
                data-testid="dropzone-image"
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  acceptFile(event.dataTransfer.files[0]);
                }}
              >
                <div className="upload-icon"><Upload size={20} strokeWidth={1.7} /></div>
                <div className="drop-title">Drop a sidewalk image to begin</div>
                <div className="drop-sub">Or browse your device for a source image</div>
                <button className="choose-button" type="button" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }} data-testid="button-browse-image">
                  Choose image
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Choose image file"
                  data-testid="input-image-file"
                  hidden
                  onChange={(event) => {
                    acceptFile(event.currentTarget.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </div>

              {file && (
                <div className="file-row" data-testid="file-selected">
                  <div className="file-tile"><FileImage size={17} /></div>
                  <div className="file-detail">
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{formatBytes(file.size)} · {file.type.replace('image/', '').toUpperCase()}</div>
                  </div>
                  <button className="icon-button" type="button" aria-label="Remove selected image" data-testid="button-remove-image" onClick={() => { setFile(null); setResult(null); analyzeMutation.reset(); }}>
                    <X size={17} />
                  </button>
                </div>
              )}
              <div className="file-limits"><span>JPG · PNG · WEBP</span><span>Maximum file size 8 MB</span></div>
              {validationError && <div className="message message-error" role="alert" data-testid="error-validation">{validationError}</div>}
              {analyzeMutation.isError && <div className="message message-error" role="alert" data-testid="error-analysis">{formatError(analyzeMutation.error)}</div>}
              {healthQuery.isError && <div className="message message-error" role="status" data-testid="error-health">
                Could not read service status. <button type="button" className="icon-button" style={{ display: 'inline-grid', width: 'auto', height: 'auto', padding: '0 3px', textDecoration: 'underline' }} onClick={() => healthQuery.refetch()}>Retry</button>
              </div>}
              <button className="primary-button" type="button" disabled={!file || analyzeMutation.isPending} onClick={doAnalyze} data-testid="button-analyze">
                {analyzeMutation.isPending ? <><span className="spinner" aria-hidden="true" /> Inspecting source…</> : <><MousePointer2 size={15} /> Inspect image</>}
              </button>
            </div>
          </div>

          {healthQuery.isLoading ? <StatusSkeleton /> : (
            <aside className="service-card" aria-label="Model and service status" data-testid="card-service-status">
              <div className="service-overline">Service status / live check</div>
              <div className="service-state"><span className="state-indicator" style={{ background: isConfigured ? '#8ab88d' : '#daa36d' }} />{isConfigured ? 'Model available' : 'No trained model'}</div>
              <p>{isConfigured ? 'The service reports a configured model. Review returned output and limitations before drawing conclusions.' : 'The service is reachable, but no trained model is configured. Image diagnostics may be returned; model-based findings are not.'}</p>
              <div className="model-line"><span>Service</span><strong>{healthQuery.data?.status ?? 'Unknown'}</strong></div>
              <div className="model-line"><span>Model name</span><strong className="model-pill">{healthQuery.data?.model_name ?? 'Not configured'}</strong></div>
              <div className="service-foot">{healthQuery.isError ? 'Status query failed. Availability is unverified.' : isConfigured ? 'Configuration is not a guarantee of validated performance.' : 'Detections and walkable-space/score are unavailable.'}</div>
            </aside>
          )}
        </section>

        <section className="results" aria-labelledby="results-heading">
          <div className="section-heading">
            <div>
              <h2 id="results-heading">Evidence review</h2>
              <p>Compare source availability with the outputs actually returned.</p>
            </div>
            <div className="results-status" data-testid="status-result">
              <span className="service-dot" style={{ background: result ? '#6c9c75' : analyzeMutation.isPending ? '#c6a66c' : '#bd8d5b' }} />
              {result ? 'Response received' : analyzeMutation.isPending ? 'Analysis in progress' : 'No result yet'}
            </div>
          </div>

          {analyzeMutation.isPending ? (
            <div className="result-grid" aria-label="Loading analysis result" aria-live="polite">
              {[0, 1].map((item) => <div className="panel image-card" key={item}>
                <div className="image-head"><div className="skeleton" style={{ width: 126, height: 11 }} /><div className="skeleton" style={{ width: 85, height: 9 }} /></div>
                <div className="image-stage"><div className="skeleton" style={{ width: '72%', height: 126 }} /></div>
              </div>)}
            </div>
          ) : (
            <ResultImage
              previewUrl={previewUrl}
              processedPreviewUrl={result?.processed_preview_base64
                ? `data:image/png;base64,${result.processed_preview_base64}`
                : null}
              result={result}
            />
          )}

          <ResultDetails result={result} />
          <div className="report-bar">
            <div className="report-copy"><strong>Research record</strong>{result ? 'Export the exact JSON response returned by the analysis service.' : 'A report becomes available after a successful image inspection.'}</div>
            <button className="secondary-button" type="button" disabled={!result} onClick={downloadReport} data-testid="button-export-json">
              <ArrowDownToLine size={14} /> Export JSON
            </button>
          </div>
        </section>

        <section className="explainer" aria-labelledby="evaluation-heading">
          <div>
            <div className="eyebrow">Evaluation notes</div>
            <h2 id="evaluation-heading">A result is not<br />a verdict.</h2>
            <p className="explainer-intro">Use the desk to structure visual review—not to substitute for field expertise or community knowledge.</p>
          </div>
          <div className="explainer-steps">
            <article className="explainer-step">
              <div className="step-number">01 / Observe</div>
              <h3>Keep the source in view</h3>
              <p>Review the original image and its capture details. Do not infer hidden context from a single frame.</p>
            </article>
            <article className="explainer-step">
              <div className="step-number">02 / Qualify</div>
              <h3>Separate output from absence</h3>
              <p>Unavailable detections or masks are not evidence that a path is clear or accessible.</p>
            </article>
            <article className="explainer-step">
              <div className="step-number">03 / Formula</div>
              <h3>Score only with valid masks</h3>
              <p>Walkable % = 100 × clear sidewalk pixels / valid sidewalk pixels. Clear pixels exclude obstacle masks within the sidewalk mask. The preliminary 0–100 indicator uses that same percentage; without both masks it stays unavailable and is never certification.</p>
            </article>
          </div>
        </section>

        <footer className="footnote">
          <span>SidewalkAI / Research interface</span>
          <span><CircleHelp size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />For research use · Not an accessibility certification</span>
        </footer>
      </main>
    </div>
  );
}

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PORT = process.env.PORT || 3142;
const DATA_DIR = join(ROOT_DIR, '.data');
const IMAGES_DIR = join(DATA_DIR, 'images');
const DIST_DIR = join(ROOT_DIR, 'dist');

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(IMAGES_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'projects.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    nodes_json TEXT NOT NULL,
    edges_json TEXT NOT NULL,
    viewport_json TEXT NOT NULL,
    history_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
`);

const API_KEYS = new Map();

function persistImage(base64OrDataUrl) {
  const isDataUrl = base64OrDataUrl.startsWith('data:');
  let base64 = base64OrDataUrl;
  let ext = 'png';

  if (isDataUrl) {
    const match = base64OrDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      ext = match[1].split('/')[1] || 'png';
      base64 = match[2];
    } else {
      base64 = base64OrDataUrl.split(',')[1] || base64OrDataUrl;
    }
  }

  const buffer = Buffer.from(base64, 'base64');
  const hash = uuidv4().replace(/-/g, '');
  const filename = `${hash}.${ext}`;
  const filepath = join(IMAGES_DIR, filename);
  writeFileSync(filepath, buffer);
  return filepath;
}

async function createPreview(filepath, maxDimension = 512) {
  try {
    const metadata = await sharp(filepath).metadata();
    const longest = Math.max(metadata.width || 0, metadata.height || 0);
    if (longest <= maxDimension) return filepath;

    const previewPath = filepath.replace(/\.(\w+)$/, '_preview.$1');
    await sharp(filepath)
      .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
      .toFile(previewPath);
    return previewPath;
  } catch {
    return filepath;
  }
}

function imageToBase64DataUrl(filepath) {
  const buffer = readFileSync(filepath);
  const ext = filepath.split('.').pop()?.toLowerCase() || 'png';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buffer.toString('base64')}`;
}

function nowMs() {
  return Date.now();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

function handleCommand(command, handler) {
  app.post(`/api/${command}`, async (req, res) => {
    try {
      const result = await handler(req.body);
      res.json(result);
    } catch (error) {
      console.error(`[${command}] Error:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });
}

// Project commands
handleCommand('list_project_summaries', () => {
  const rows = db.prepare(`
    SELECT id, name, created_at as createdAt, updated_at as updatedAt, node_count as nodeCount
    FROM projects ORDER BY updated_at DESC
  `).all();
  return rows;
});

handleCommand('get_project_record', ({ projectId }) => {
  const row = db.prepare(`
    SELECT id, name, created_at as createdAt, updated_at as updatedAt, node_count as nodeCount,
           nodes_json as nodesJson, edges_json as edgesJson, viewport_json as viewportJson, history_json as historyJson
    FROM projects WHERE id = ?
  `).get(projectId);
  return row || null;
});

handleCommand('upsert_project_record', ({ record }) => {
  const { id, name, createdAt, updatedAt, nodeCount, nodesJson, edgesJson, viewportJson, historyJson } = record;
  db.prepare(`
    INSERT INTO projects (id, name, created_at, updated_at, node_count, nodes_json, edges_json, viewport_json, history_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, created_at = excluded.created_at, updated_at = excluded.updated_at,
      node_count = excluded.node_count, nodes_json = excluded.nodes_json,
      edges_json = excluded.edges_json, viewport_json = excluded.viewport_json, history_json = excluded.history_json
  `).run(id, name, createdAt, updatedAt, nodeCount, nodesJson, edgesJson, viewportJson, historyJson);
  return null;
});

handleCommand('update_project_viewport_record', ({ projectId, viewportJson }) => {
  db.prepare('UPDATE projects SET viewport_json = ? WHERE id = ?').run(viewportJson, projectId);
  return null;
});

handleCommand('rename_project_record', ({ projectId, name, updatedAt }) => {
  db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(name, updatedAt, projectId);
  return null;
});

handleCommand('delete_project_record', ({ projectId }) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  return null;
});

// Image commands
handleCommand('split_image', async ({ imageBase64, rows, cols, lineThickness }) => {
  const lineThick = lineThickness || 0;
  const buffer = Buffer.from(imageBase64, 'base64');
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const { width, height } = metadata;
  const safeRows = Math.max(1, rows || 1);
  const safeCols = Math.max(1, cols || 1);

  const usableWidth = width - (safeCols - 1) * lineThick;
  const usableHeight = height - (safeRows - 1) * lineThick;
  if (usableWidth < safeCols || usableHeight < safeRows) {
    throw new Error('分割线过粗，无法完成切割');
  }

  const cellWidth = Math.floor(usableWidth / safeCols);
  const cellHeight = Math.floor(usableHeight / safeRows);
  const results = [];

  for (let row = 0; row < safeRows; row++) {
    for (let col = 0; col < safeCols; col++) {
      const x = col * (cellWidth + lineThick);
      const y = row * (cellHeight + lineThick);
      const cellBuffer = await sharp(buffer)
        .extract({ left: x, top: y, width: cellWidth, height: cellHeight })
        .png()
        .toBuffer();
      results.push(`data:image/png;base64,${cellBuffer.toString('base64')}`);
    }
  }
  return results;
});

handleCommand('crop_image_source', async ({ source, aspectRatio, cropX, cropY, cropWidth, cropHeight }) => {
  let input;
  if (source.startsWith('data:')) {
    const b64 = source.split(',')[1] || source;
    input = Buffer.from(b64, 'base64');
  } else if (source.startsWith('http')) {
    const resp = await fetch(source);
    input = Buffer.from(await resp.arrayBuffer());
  } else if (existsSync(source)) {
    input = source;
  } else {
    input = Buffer.from(source, 'base64');
  }

  const cropped = sharp(input).extract({
    left: Math.round(cropX || 0),
    top: Math.round(cropY || 0),
    width: Math.round(cropWidth || 100),
    height: Math.round(cropHeight || 100),
  });

  const buffer = await cropped.png().toBuffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
});

handleCommand('prepare_node_image_source', async ({ source, maxPreviewDimension }) => {
  const maxDim = maxPreviewDimension || 512;
  let filepath;
  if (source.startsWith('data:')) {
    filepath = persistImage(source);
  } else if (existsSync(source)) {
    filepath = source;
  } else {
    filepath = persistImage(source);
  }

  const previewPath = await createPreview(filepath, maxDim);
  const metadata = await sharp(filepath).metadata();
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(metadata.width, metadata.height);

  return {
    imagePath: filepath,
    previewImagePath: previewPath,
    aspectRatio: `${metadata.width / divisor}:${metadata.height / divisor}`,
  };
});

handleCommand('prepare_node_image_binary', async ({ bytes, extension, maxPreviewDimension }) => {
  const maxDim = maxPreviewDimension || 512;
  const ext = extension || 'png';
  const hash = uuidv4().replace(/-/g, '');
  const filename = `${hash}.${ext}`;
  const filepath = join(IMAGES_DIR, filename);
  writeFileSync(filepath, Buffer.from(bytes));

  const previewPath = await createPreview(filepath, maxDim);
  const metadata = await sharp(filepath).metadata();
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(metadata.width, metadata.height);

  return {
    imagePath: filepath,
    previewImagePath: previewPath,
    aspectRatio: `${metadata.width / divisor}:${metadata.height / divisor}`,
  };
});

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

handleCommand('persist_image_source', async ({ source }) => {
  if (existsSync(source)) return source;
  return persistImage(source);
});

handleCommand('persist_image_binary', async ({ bytes, extension }) => {
  const ext = extension || 'png';
  const hash = uuidv4().replace(/-/g, '');
  const filename = `${hash}.${ext}`;
  const filepath = join(IMAGES_DIR, filename);
  writeFileSync(filepath, Buffer.from(bytes));
  return filepath;
});

handleCommand('load_image', async ({ filePath }) => {
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  return imageToBase64DataUrl(filePath);
});

handleCommand('merge_storyboard_images', async ({ payload }) => {
  const {
    frameSources, rows, cols, cellGap, outerPadding, noteHeight,
    fontSize, backgroundColor, maxDimension, showFrameIndex, showFrameNote,
    notePlacement, imageFit, frameIndexPrefix, textColor, frameNotes,
  } = payload;

  const safeRows = Math.max(1, rows || 1);
  const safeCols = Math.max(1, cols || 1);
  const gap = Math.max(0, cellGap || 0);
  const pad = Math.max(0, outerPadding || 0);
  const noteH = Math.max(0, noteHeight || 0);
  const fontSz = Math.max(8, fontSize || 16);
  const bgColor = backgroundColor || '#0f1115';
  const maxDim = Math.min(maxDimension || 4096, 4096);

  // Load all frame images
  const frameImages = [];
  for (const src of frameSources || []) {
    try {
      if (src.startsWith('data:')) {
        const b64 = src.split(',')[1] || src;
        frameImages.push(sharp(Buffer.from(b64, 'base64')));
      } else if (src.startsWith('http')) {
        const resp = await fetch(src);
        frameImages.push(sharp(Buffer.from(await resp.arrayBuffer())));
      } else if (src && existsSync(src)) {
        frameImages.push(sharp(src));
      } else if (src) {
        frameImages.push(sharp(Buffer.from(src, 'base64')));
      } else {
        frameImages.push(null);
      }
    } catch {
      frameImages.push(null);
    }
  }

  // Determine cell size from first valid image
  let cellW = 512;
  let cellH = 512;
  for (const img of frameImages) {
    if (img) {
      const meta = await img.metadata();
      cellW = meta.width || 512;
      cellH = meta.height || 512;
      break;
    }
  }

  const canvasW = Math.min(pad * 2 + safeCols * cellW + (safeCols - 1) * gap, maxDim);
  const scale = canvasW / (pad * 2 + safeCols * cellW + (safeCols - 1) * gap);
  cellW = Math.round(cellW * scale);
  cellH = Math.round(cellH * scale);

  const totalH = pad * 2 + safeRows * (cellH + (noteH > 0 && notePlacement === 'bottom' ? noteH : 0)) + (safeRows - 1) * gap;
  const canvasH = Math.min(totalH, maxDim);

  const textOverlayApplied = showFrameIndex || (showFrameNote && notePlacement === 'bottom');

  // Create composite
  const composites = [];
  for (let row = 0; row < safeRows; row++) {
    for (let col = 0; col < safeCols; col++) {
      const idx = row * safeCols + col;
      const img = frameImages[idx];
      if (!img) continue;

      const x = pad + col * (cellW + gap);
      const y = pad + row * (cellH + (noteH > 0 && notePlacement === 'bottom' ? noteH : 0) + gap);
      const resized = await img
        .resize(cellW, cellH, { fit: imageFit === 'contain' ? 'inside' : 'cover', position: 'center' })
        .toBuffer();

      composites.push({ input: resized, top: y, left: x });
    }
  }

  const bgSvg = `<svg width="${canvasW}" height="${canvasH}">
    <rect width="100%" height="100%" fill="${bgColor}"/>
  </svg>`;

  const merged = await sharp(Buffer.from(bgSvg))
    .composite(composites)
    .png()
    .toBuffer();

  const hash = uuidv4().replace(/-/g, '');
  const filepath = join(IMAGES_DIR, `merged_${hash}.png`);
  writeFileSync(filepath, merged);

  return {
    imagePath: filepath,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    cellWidth: cellW,
    cellHeight: cellH,
    gap,
    padding: pad,
    noteHeight: noteH,
    fontSize: fontSz,
    textOverlayApplied,
  };
});

// AI commands
handleCommand('set_api_key', ({ provider, apiKey }) => {
  API_KEYS.set(provider, apiKey);
  return null;
});

handleCommand('generate_image', async ({ request }) => {
  const { prompt, model, size, aspect_ratio, reference_images, extra_params } = request || {};

  // Forward to provider API based on model
  const provider = model.includes('kie') ? 'kie' : model.includes('ppio') ? 'ppio' : model.includes('fal') ? 'fal' : model.includes('grsai') ? 'grsai' : null;
  if (!provider) throw new Error(`Unknown model provider: ${model}`);

  const apiKey = API_KEYS.get(provider);
  if (!apiKey) throw new Error(`API key not set for ${provider}`);

  // Simple fetch to provider - specific implementations vary by provider
  // This is a placeholder that works for common APIs
  const response = await fetch(getProviderEndpoint(provider), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      aspect_ratio,
      image: reference_images?.[0] || undefined,
      ...extra_params,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Provider error: ${errorText}`);
  }

  const result = await response.json();
  const imageUrl = extractImageUrl(result, provider);
  if (!imageUrl) throw new Error('No image in response');

  // Download and return as data URL
  const imgResp = await fetch(imageUrl);
  const imgBuffer = await imgResp.arrayBuffer();
  const base64 = Buffer.from(imgBuffer).toString('base64');
  return `data:image/png;base64,${base64}`;
});

function getProviderEndpoint(provider) {
  const endpoints = {
    kie: 'https://api.kie.ai/v1/images/generations',
    ppio: 'https://api.ppio.com/v1/images/generations',
    fal: 'https://fal.run/fal-ai',
    grsai: 'https://api.grsai.com/v1/images/generations',
  };
  return endpoints[provider] || '';
}

function extractImageUrl(result, provider) {
  if (result.data?.[0]?.url) return result.data[0].url;
  if (result.data?.[0]?.b64_json) return `data:image/png;base64,${result.data[0].b64_json}`;
  if (result.url) return result.url;
  if (result.images?.[0]?.url) return result.images[0].url;
  if (result.output?.image?.url) return result.output.image.url;
  return null;
}

handleCommand('submit_generate_image_job', async ({ request }) => {
  // For simplicity, execute synchronously and return "succeeded" immediately
  const imageResult = await generateImageDirect(request);
  const jobId = uuidv4();

  db.prepare(`
    INSERT INTO ai_generation_jobs (job_id, provider_id, status, result, created_at, updated_at)
    VALUES (?, ?, 'succeeded', ?, ?, ?)
  `).run(jobId, 'unknown', imageResult, nowMs(), nowMs());

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_generation_jobs (
      job_id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  return jobId;
});

handleCommand('get_generate_image_job', ({ jobId }) => {
  const job = db.prepare('SELECT * FROM ai_generation_jobs WHERE job_id = ?').get(jobId);
  if (!job) {
    return { job_id: jobId, status: 'not_found', result: null, error: 'job not found' };
  }
  return {
    job_id: job.job_id,
    status: job.status,
    result: job.result || null,
    error: job.error || null,
  };
});

async function generateImageDirect(request) {
  const { prompt, model, size, aspect_ratio, reference_images, extra_params } = request || {};
  const provider = model.includes('kie') ? 'kie' : model.includes('ppio') ? 'ppio' : model.includes('fal') ? 'fal' : model.includes('grsai') ? 'grsai' : null;
  if (!provider) throw new Error(`Unknown model provider: ${model}`);

  const apiKey = API_KEYS.get(provider);
  if (!apiKey) throw new Error(`API key not set for ${provider}`);

  const response = await fetch(getProviderEndpoint(provider), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      aspect_ratio,
      image: reference_images?.[0] || undefined,
      ...extra_params,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Provider error: ${errorText}`);
  }

  const result = await response.json();
  const imageUrl = extractImageUrl(result, provider);
  if (!imageUrl) throw new Error('No image in response');

  const imgResp = await fetch(imageUrl);
  const imgBuffer = await imgResp.arrayBuffer();
  const base64 = Buffer.from(imgBuffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}

handleCommand('list_models', () => {
  return [
    'grsai/nano-banana-pro-v2', 'grsai/nano-banana-pro',
    'kie/keling-v1.5', 'kie/keling-v2',
    'ppio/seedream-4', 'ppio/seedream-4-turbo',
    'fal/flux-pro-v1.1', 'fal/flux-dev',
  ];
});

// System commands
handleCommand('get_runtime_system_info', () => {
  return {
    osName: process.platform,
    osVersion: process.version,
    osBuild: 'web-server',
  };
});

handleCommand('check_latest_release_tag', async () => {
  try {
    const resp = await fetch('https://api.github.com/repos/henjicc/Storyboard-Copilot/releases/latest');
    if (!resp.ok) return null;
    const release = await resp.json();
    return release.tag_name || null;
  } catch {
    return null;
  }
});

// Serve uploaded images statically
app.use('/images', express.static(IMAGES_DIR));

// Serve frontend static files in production
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/images/')) return next();
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
  console.log(`Serving frontend from ${DIST_DIR}`);
}

app.listen(PORT, () => {
  console.log(`Storyboard Copilot Web Backend listening on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});

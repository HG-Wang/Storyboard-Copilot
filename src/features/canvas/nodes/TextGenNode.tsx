import { memo, useCallback, useState, useEffect } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Sparkles, Loader2, RotateCcw, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_TYPES, type TextGenNodeData } from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { useCanvasStore } from '@/stores/canvasStore';
import { useServerModelStore } from '@/features/canvas/models/serverModelStore';
import { canvasAiGateway } from '@/features/canvas/application/canvasServices';

type TextGenNodeProps = NodeProps & {
  id: string;
  data: TextGenNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 320;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 180;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 1200;

export const TextGenNode = memo(({
  id, data, selected, width, height,
}: TextGenNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((s) => s.setSelectedNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const textModels = useServerModelStore((s) => s.textModels);

  const [showConfig, setShowConfig] = useState(false);

  const prompt = typeof data.prompt === 'string' ? data.prompt : '';
  const systemPrompt = typeof data.systemPrompt === 'string' ? data.systemPrompt : '';
  const model = typeof data.model === 'string' ? data.model : 'openai/gpt-4o-mini';
  const generatedContent = typeof data.generatedContent === 'string' ? data.generatedContent : '';
  const isGenerating = Boolean(data.isGenerating);

  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.textGen, data);
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT));

  const currentModel = textModels.find((m) => m.id === model);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;
    updateNodeData(id, { isGenerating: true, generationStartedAt: Date.now(), generatedContent: '' });
    try {
      const result = await canvasAiGateway.generateText({
        prompt: prompt.trim(),
        model,
        systemPrompt: systemPrompt.trim() || undefined,
      });
      updateNodeData(id, { generatedContent: result, isGenerating: false });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Generation failed';
      updateNodeData(id, { generatedContent: `Error: ${errorMsg}`, isGenerating: false });
    }
  }, [id, prompt, model, systemPrompt, isGenerating, updateNodeData]);

  useEffect(() => {
    if (!selected && showConfig) setShowConfig(false);
  }, [selected, showConfig]);

  return (
    <div
      className={`group relative h-full w-full overflow-visible rounded-[var(--node-radius)] border bg-surface-dark/85 p-1.5 transition-colors duration-150
        ${selected
          ? 'border-accent shadow-[0_0_0_1px_rgba(59,130,246,0.32)]'
          : 'border-[rgba(15,23,42,0.22)] hover:border-[rgba(15,23,42,0.34)] dark:border-[rgba(255,255,255,0.22)] dark:hover:border-[rgba(255,255,255,0.34)]'}
      `}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Sparkles className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />
      <NodeResizeHandle
        minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT}
        maxWidth={MAX_WIDTH} maxHeight={MAX_HEIGHT}
      />

      <div className="flex flex-col h-full pt-8 gap-2">
        <div className="shrink-0 flex items-center gap-2 px-1">
          <select
            value={model}
            onChange={(e) => updateNodeData(id, { model: e.target.value })}
            className="nodrag h-7 flex-1 rounded border border-border-dark bg-bg-dark px-2 text-xs text-text-dark outline-none focus:border-accent truncate"
          >
            {textModels.length > 0 ? (
              textModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.creditsPerRequest} {t('admin.creditsPerImage')})
                </option>
              ))
            ) : (
              <option value={model}>{model}</option>
            )}
          </select>
          <button
            onClick={(e) => { e.stopPropagation(); setShowConfig(!showConfig); }}
            className={`nodrag h-7 w-7 flex items-center justify-center rounded border text-text-muted hover:text-text-dark transition-colors ${showConfig ? 'border-accent bg-accent/10' : 'border-border-dark'}`}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showConfig ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showConfig && (
          <div className="shrink-0 px-1 space-y-1.5 nodrag">
            <textarea
              value={systemPrompt}
              onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
              placeholder={t('node.textGen.systemPromptPlaceholder')}
              rows={2}
              className="nowheel w-full rounded border border-border-dark bg-bg-dark px-2 py-1.5 text-xs text-text-dark outline-none focus:border-accent resize-none"
            />
          </div>
        )}

        <div className="shrink-0 px-1">
          <textarea
            value={prompt}
            onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleGenerate();
              }
            }}
            placeholder={t('node.textGen.promptPlaceholder')}
            rows={2}
            className="nodrag nowheel w-full rounded border border-border-dark bg-bg-dark px-2 py-1.5 text-xs text-text-dark outline-none focus:border-accent resize-none"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-text-muted">
              {currentModel ? `${currentModel.creditsPerRequest} ${t('admin.creditsPerImage')}` : ''}
            </span>
            <div className="flex items-center gap-1.5">
              {generatedContent && !isGenerating && (
                <button
                  onClick={(e) => { e.stopPropagation(); void handleGenerate(); }}
                  className="nodrag h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-dark hover:bg-bg-dark"
                  title={t('node.textGen.regenerate')}
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); void handleGenerate(); }}
                disabled={isGenerating || !prompt.trim()}
                className="nodrag h-6 px-3 rounded bg-accent text-white text-xs hover:bg-accent/80 disabled:opacity-40 flex items-center gap-1"
              >
                {isGenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {isGenerating ? t('node.textGen.generating') : t('node.textGen.generate')}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-1">
          {isGenerating && !generatedContent && (
            <div className="flex items-center justify-center h-full text-text-muted text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              {t('node.textGen.generating')}
            </div>
          )}
          {generatedContent ? (
            <div className="markdown-body prose prose-invert prose-xs max-w-none text-xs leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {generatedContent}
              </ReactMarkdown>
            </div>
          ) : !isGenerating ? (
            <div className="flex items-center justify-center h-full text-text-muted/50 text-xs">
              {t('node.textGen.emptyHint')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

TextGenNode.displayName = 'TextGenNode';

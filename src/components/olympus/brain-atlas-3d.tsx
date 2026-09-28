/**
 * License: AGPL-3.0-or-later (original OLYMPUS code).
 */

'use client';

/**
 * Olympus Brain Atlas 3D — real brain-atlas WebGL2 renderer.
 *
 * This component uses the ACTUAL brain-atlas renderer from
 * https://github.com/colorpulse6/brain-atlas (MIT, © Nichalas Barnes):
 *
 *   - brain-atlas/src/gl/brain-gl-renderer.ts  — WebGL2 renderer
 *     (background gradient, lobe haze, point cloud, edge ribbons,
 *      node halos + cores, signal particles).
 *   - brain-atlas/src/renderer.ts              — Canvas2D fallback.
 *   - brain-atlas/src/render-core.ts           — camera, drag, zoom,
 *     auto-rotate, hit-testing, signal spawning.
 *   - brain-atlas/src/gl/shaders.ts            — GLSL ES 3.00 shaders.
 *   - brain-atlas/src/gl/{projection,color,programs,buffers}.ts — helpers.
 *   - brain-atlas/src/{shape,cloud,palette,lobe-visibility,
 *     overlay-labels,node-display,settings}.ts — geometry + palette + overlay.
 *
 * It is NOT a re-implementation. We wire the real renderer to Olympus's
 * Zustand store (graphData, selectedNode, contextMenu, activeGod) and
 * register an OLYMPUS pastel palette entry (see brain-atlas-palette.ts).
 *
 * Interactions preserved from the brain-atlas plugin:
 *   - Drag empty space to rotate the brain.
 *   - Drag a node to pin it (onPinNode).
 *   - Scroll to zoom.
 *   - Right-click empty space to reset the camera (built into RenderCore).
 *   - Right-click a node to open the Olympus context menu.
 *   - Click a node to open the Olympus node-detail panel.
 *   - Lobe toggles (FRO, PAR, TEM, OCC, CER, STM).
 *   - Labels toggle.
 *   - Slow auto-rotate (1 rev / ~120s) that stops on first interaction.
 *   - Performance presets: Smooth / Balanced / Battery saver / Mobile.
 *
 * Stability patches preserved:
 *   - The global RAF patch in page.tsx wraps window.requestAnimationFrame
 *     and swallows stale-tick errors. The brain-atlas renderer uses
 *     window.requestAnimationFrame internally, so the patch covers it
 *     too. We do NOT remove or weaken that patch.
 *   - ChunkErrorBoundary in page.tsx still wraps this component.
 *   - DarkReader opt-out in layout.tsx is untouched.
 *   - suppressHydrationWarning on the container is kept.
 *
 * Brain-atlas-specific cleanup:
 *   - On unmount we call renderer.stop() which:
 *       1. Cancels the RAF (this.raf).
 *       2. Clears any pending frame timeout.
 *       3. Disconnects the ResizeObserver.
 *       4. Removes all pointer/wheel/contextmenu listeners from the canvas.
 *       5. Calls releaseSurface() which:
 *            - removes webglcontextlost/restored listeners,
 *            - deletes all GL programs/buffers/VAOs,
 *            - removes the overlay canvas from the DOM,
 *            - nulls out gl/overlay/overlayCtx.
 *   - We also null our own refs to prevent stale access.
 *
 * Source: https://github.com/colorpulse6/brain-atlas (MIT, © Nichalas Barnes)
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  LOBE_CENTERS,
  type LobeName,
  type LobeVisibility,
  allLobesEnabled,
  setLobeEnabled,
  setAllLobes,
} from '@/lib/olympus-brain-adapter';
import { OLYMPUS_PALETTE, LOBE_TINTS, hexA } from '@/lib/brain-atlas-palette';
import { useOlympus } from '@/lib/olympus-store';
import type { GraphNode, GraphLink } from '@/lib/olympus';
import {
  Eye, EyeOff, X, Gauge,
} from 'lucide-react';
import DocumentViewerModal from './document-viewer-modal';

// Real brain-atlas renderers — imported directly from the cloned repo.
// These pull in the full brain-atlas dependency chain (shaders, buffers,
// projection, color, shape, cloud, palette, overlay-labels, etc.).
import { BrainGLRenderer } from '../../../brain-atlas/src/gl/brain-gl-renderer.ts';
import { BrainRenderer } from '../../../brain-atlas/src/renderer.ts';
import type { RenderCore } from '../../../brain-atlas/src/render-core.ts';
import type { BrainGraph, BrainNode } from '../../../brain-atlas/src/types.ts';
import type { BrainRendererOptions } from '../../../brain-atlas/src/render-core.ts';
import type { PerformancePreset } from '../../../brain-atlas/src/settings.ts';
import { buildOlympusBrainGraph, emptyOlympusBrainGraph } from '@/lib/olympus-brain-adapter';

/* ------------------------------------------------------------------ */
/* Constants.                                                          */
/* ------------------------------------------------------------------ */
const GOD_NAMES: Record<string, string> = {
  apollo: 'Apollo', hephaestus: 'Hephaestus', athena: 'Athena', hermes: 'Hermes',
  artemis: 'Artemis', dionysus: 'Dionysus', persephone: 'Persephone', prometheus: 'Prometheus',
  // Callimachus (9th god, background vault curator) added.
  callimachus: 'Callimachus',
};

const LOBE_SHORT: Record<LobeName, string> = {
  frontal: 'FRO', parietal: 'PAR', temporal: 'TEM',
  occipital: 'OCC', cerebellum: 'CER', stem: 'STM',
};

/* Lobe descriptions for the Olympus-styled hover tooltip — shows what
 * each lobe contains (gods, skills, instincts, etc.). */
const LOBE_DESC: Record<LobeName, { full: string; role: string }> = {
  // Brain view: only Gods / Instincts / Knowledge. Skill + Evolved
  // categories are hidden (the lobes exist in adapter positioning but
  // no node of those types reaches the renderer — see nodeVisible).
  frontal:    { full: 'Frontal',    role: 'Apollo god + active project hub' },
  parietal:   { full: 'Parietal',   role: 'Hephaestus + Athena gods' },
  temporal:   { full: 'Temporal',   role: 'Hermes + Prometheus gods' },
  occipital:  { full: 'Occipital',  role: 'Artemis + Persephone gods + all knowledge' },
  cerebellum: { full: 'Cerebellum', role: 'Dionysus god + all instincts (auto-learning)' },
  stem:       { full: 'Brain Stem', role: 'Callimachus + subagents + system index' },
};

const PERFORMANCE_PRESETS: { id: PerformancePreset; label: string }[] = [
  { id: 'smooth',      label: 'Smooth' },
  { id: 'balanced',    label: 'Balanced' },
  { id: 'batterySaver',label: 'Battery saver' },
  { id: 'mobile',      label: 'Mobile' },
];

/* ------------------------------------------------------------------ */
/* Main component.                                                     */
/* ------------------------------------------------------------------ */
export default function BrainAtlas3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RenderCore | null>(null);
  const graphRef = useRef<BrainGraph>(emptyOlympusBrainGraph());
  const startedRef = useRef(false);

  // UI state
  const [hoverNode, setHoverNode] = useState<BrainNode | null>(null);
  const [focusNode, setFocusNode] = useState<BrainNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showLobeLabels, setShowLobeLabels] = useState(true);
  const [enabledLobes, setEnabledLobes] = useState<LobeVisibility>(allLobesEnabled());
  const [highlightLobe, setHighlightLobe] = useState<LobeName | null>(null);
  const [hoveredLobe, setHoveredLobe] = useState<LobeName | null>(null);
  const [perfPreset, setPerfPreset] = useState<PerformancePreset>('smooth');
  const [showPerfMenu, setShowPerfMenu] = useState(false);
  const [lobeStats, setLobeStats] = useState<Record<LobeName, number>>({
    frontal: 0, parietal: 0, temporal: 0, occipital: 0, cerebellum: 0, stem: 0,
  });
  const [rendererKind, setRendererKind] = useState<'webgl2' | 'canvas2d' | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  // When set, opens the DocumentViewerModal showing the full markdown
  // document for a clicked skill/instinct/knowledge node. Set by the
  // canvas click handler (onCanvasClickRef). Cleared by the modal's
  // onClose. Null for god/project/subagent nodes (use NodeDetailPanel).
  const [viewingDocNode, setViewingDocNode] = useState<GraphNode | null>(null);

  // Store
  const graphData = useOlympus(s => s.graphData);
  const filters = useOlympus(s => s.filters);
  const activeGod = useOlympus(s => s.activeGod);
  const setSelectedNode = useOlympus(s => s.setSelectedNode);
  // setContextMenu removed. The brain self-evolves; no right-click
  // context menu is wired anymore. The capture-phase preventDefault in
  // attachCanvasListeners (below) suppresses both the Olympus context menu
  // AND the brain-atlas renderer's own contextmenu → camera-reset handler.

  /* ---------------------------------------------------------------- */
  /* Build the brain-atlas BrainGraph from Olympus graphData.         */
  /* - Applies the Olympus filters (god/skill/instinct/project/etc.). */
  /* - Converts GraphNode -> BrainNode with lobe assignment.          */
  /* - Stores the result in a ref so the renderer's getGraph()        */
  /*   callback always returns the latest graph WITHOUT needing to    */
  /*   restart the renderer on every data change.                     */
  /* ---------------------------------------------------------------- */
  const filteredReal = useMemo(() => {
    if (!graphData) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    const nodeVisible = (n: GraphNode) => {
      // Brain view hard-excludes skill, evolved, and project node types.
      // Only gods, instincts, and knowledge are displayed. These types
      // still exist in the underlying graph data (other panels consume
      // them), but the Brain renderer never displays them.
      if (n.type === 'skill' || n.type === 'evolved' || n.type === 'project') return false;
      // Type-filter toggle (gods / instincts / knowledge).
      if (!filters[n.type as keyof typeof filters]) return false;
      // min-confidence filter — only applies to instinct nodes.
      if (n.type === 'instinct' && (n.confidence || 0) < filters.minConfidence) return false;
      // Scope filters. Gods bypass scope filtering (they must always be
      // visible). For instinct/knowledge nodes, the scope checkboxes act
      // as HIDE filters: unticking a scope hides nodes with that tag.
      if (n.type !== 'god') {
        const scope = (n as any).scope as string | undefined;
        // Nodes with no explicit scope are treated as 'global'.
        const effScope = scope ?? 'global';
        if (effScope === 'global' && !filters.scopeGlobal) return false;
        if (effScope === 'stack'  && !filters.scopeStack)  return false;
        if (effScope === 'project' && !filters.scopeProject) return false;
        // Nodes explicitly bound to a project (projects.length > 0) are
        // considered project-scoped even if their `scope` field says
        // something else — the binding is the stronger signal.
        const projects = (n as any).projects as string[] | undefined;
        if (Array.isArray(projects) && projects.length > 0 && !filters.scopeProject) return false;
        // Cross-stack promoted nodes are hidden unless the user explicitly
        // toggled `showCrossStack` on.
        if ((n as any).crossStack === true && !filters.showCrossStack) return false;
      }
      return true;
    };
    const visibleIds = new Set(graphData.nodes.filter(nodeVisible).map(n => n.id));
    const nodes = graphData.nodes.filter(n => visibleIds.has(n.id));
    const links = graphData.links.filter(l =>
      visibleIds.has(typeof l.source === 'string' ? l.source : (l.source as any)?.id) &&
      visibleIds.has(typeof l.target === 'string' ? l.target : (l.target as any)?.id),
    );
    return { nodes, links };
  }, [graphData, filters]);

  const brainGraph = useMemo(
    () => buildOlympusBrainGraph(filteredReal.nodes, filteredReal.links),
    [filteredReal],
  );

  // Keep graphRef in sync with the latest brainGraph. The renderer reads
  // this ref via its getGraph() callback on every frame.
  useEffect(() => {
    graphRef.current = brainGraph;
    // Refresh lobe stats + overlays whenever the graph changes.
    if (rendererRef.current && startedRef.current) {
      setLobeStats(rendererRef.current.getLobeStats());
    }
  }, [brainGraph]);

  /* ---------------------------------------------------------------- */
  /* Mouse position tracker for the hover tooltip.                    */
  /* ---------------------------------------------------------------- */
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  /* ---------------------------------------------------------------- */
  /* Sync overlays from the renderer. Called via the renderer's        */
  /* onChange callback whenever hover/focus/drag state changes.        */
  /* ---------------------------------------------------------------- */
  const syncOverlays = useCallback(() => {
    const r = rendererRef.current;
    if (!r) return;
    const hover = r.getHoveredNode();
    const focus = r.getFocusedNode();
    setHoverNode(hover);
    setFocusNode(focus);
    setLobeStats(r.getLobeStats());
  }, []);

  /* ---------------------------------------------------------------- */
  /* Refs that mirror the latest state/props so stable callbacks      */
  /* (attached once to the canvas) always see fresh data. These are   */
  /* updated in a useEffect below, NOT during render, to comply with  */
  /* the react-hooks/refs rule.                                       */
  /* ---------------------------------------------------------------- */
  const graphDataRef = useRef(graphData);
  const optsRef = useRef({ showLobeLabels, enabledLobes, perfPreset });
  const onCanvasClickRef = useRef<(e: MouseEvent) => void>(() => {});
  // Mirror viewingDocNode setter into a ref so the stable click callback
  // (registered once on the canvas) always sees the latest setter without
  // re-registering the listener.
  const setViewingDocNodeRef = useRef(setViewingDocNode);
  useEffect(() => { setViewingDocNodeRef.current = setViewingDocNode; }, [setViewingDocNode]);

  useEffect(() => {
    graphDataRef.current = graphData;
    optsRef.current = { showLobeLabels, enabledLobes, perfPreset };
    onCanvasClickRef.current = (e: MouseEvent) => {
      const r = rendererRef.current;
      const canvas = canvasRef.current;
      if (!r || !canvas) return;
      // Suppress click after a drag (matches brain-atlas view.ts behavior).
      if (r.consumeSuppressedClick()) return;
      const rect = canvas.getBoundingClientRect();
      const hit = r.hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (!hit) return;
      // Map the brain-atlas BrainNode back to the Olympus GraphNode shape
      // so the existing node-detail panel can read the familiar fields
      // (type, god, color, etc.).
      const olympusNode = graphDataRef.current?.nodes.find(n => n.id === hit.id) ?? hit;
      setSelectedNode(olympusNode);
      // Brain view shows only Gods / Instincts / Knowledge. Only instinct
      // and knowledge nodes have a backing document file for the
      // DocumentViewerModal. Gods use NodeDetailPanel via setSelectedNode.
      // Skill/evolved/project nodes are excluded from the Brain.
      const t = (olympusNode as any)?.type;
      if (t === 'instinct' || t === 'knowledge') {
        setViewingDocNodeRef.current(olympusNode as GraphNode);
      }
    };
    // onCanvasContextMenuRef removed entirely. The brain self-evolves
    // and no longer has a right-click context menu.
  });

  /* ---------------------------------------------------------------- */
  /* Attach click listener to a canvas + capture-phase contextmenu     */
  /* preventDefault.                                                    */
  /*                                                                   */
  /* The capture-phase listener runs BEFORE the brain-atlas renderer's  */
  /* own contextmenu listener (which is registered in RenderCore.start */
  /* and resets the camera on right-click of empty space). By calling  */
  /* preventDefault() in the capture phase, we suppress BOTH:          */
  /*   - the browser's native context menu                            */
  /*   - the renderer's camera-reset behavior                         */
  /*                                                                   */
  /* We do NOT call stopPropagation — that would block the renderer's  */
  /* other listeners. preventDefault alone is enough to kill the       */
  /* native menu + the renderer's reset (the renderer checks           */
  /* e.defaultPrevented in its own handler before resetting).          */
  /* ---------------------------------------------------------------- */
  function attachCanvasListeners(canvas: HTMLCanvasElement) {
    canvas.addEventListener('click', (e: MouseEvent) => onCanvasClickRef.current(e));
    // capture-phase preventDefault kills right-click entirely.
    canvas.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
    }, true);
    // Restored grab/grabbing/pointer cursor switching. The brain atlas is
    // a 3D draggable surface: 'grab' (idle), 'grabbing' (dragging),
    // 'pointer' (over a clickable node). Matches VS Code / three.js.
    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const r = rendererRef.current;
      if (!r) return;
      const rect = canvas.getBoundingClientRect();
      const hit = r.hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) {
        // Over a clickable node — show the pointer (link) cursor.
        canvas.style.cursor = 'pointer';
      } else {
        // Background — grab when idle, grabbing while dragging.
        canvas.style.cursor = (e.buttons & 1) ? 'grabbing' : 'grab';
      }
    });
    // Reset to grab on pointer leave (so the cursor doesn't stay 'pointer'
    // when the mouse leaves the canvas while over a node).
    canvas.addEventListener('pointerleave', () => {
      canvas.style.cursor = 'grab';
    });
  }

  /* ---------------------------------------------------------------- */
  /* Recreate the canvas element (used when the WebGL context is      */
  /* tainted and we need to fall back to Canvas2D). Returns the new   */
  /* canvas or null on failure.                                       */
  /* ---------------------------------------------------------------- */
  function recreateCanvas(): HTMLCanvasElement | null {
    const container = containerRef.current;
    const old = canvasRef.current;
    if (!container || !old) return null;
    const fresh = document.createElement('canvas');
    fresh.className = 'brain-atlas-canvas';
    fresh.style.position = 'absolute';
    fresh.style.inset = '0';
    fresh.style.width = '100%';
    fresh.style.height = '100%';
    fresh.style.cursor = 'default';
    fresh.style.touchAction = 'none';
    // Attach the same listeners as the original canvas.
    attachCanvasListeners(fresh);
    container.insertBefore(fresh, old);
    old.remove();
    canvasRef.current = fresh;
    return fresh;
  }

  /* ---------------------------------------------------------------- */
  /* Start / restart the renderer.                                    */
  /* - Picks WebGL2 if available, else Canvas2D.                       */
  /* - Calls renderer.start(canvas, getGraph, options).               */
  /* - Falls back to Canvas2D if the WebGL renderer signals            */
  /*   onRendererUnavailable (permanent context loss).                 */
  /*                                                                    */
  /* Reads option state from optsRef so the initial-start closure     */
  /* (used by the mount effect) always sees the latest values.        */
  /* ---------------------------------------------------------------- */
  function startRenderer() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Stop any existing renderer first.
    if (rendererRef.current) {
      try { rendererRef.current.stop(); } catch { /* swallow */ }
      rendererRef.current = null;
    }
    startedRef.current = false;

    const getGraph = (): BrainGraph => graphRef.current;
    const opts = optsRef.current;

    const options: BrainRendererOptions = {
      idleAutoRotate: true,
      showLobeLabels: opts.showLobeLabels,
      enabledLobes: opts.enabledLobes,
      performancePreset: opts.perfPreset,
      mobileMode: false,
      onChange: syncOverlays,
      onPinNode: (_node, _position) => {
        // Olympus doesn't persist pinned positions yet — could write to
        // localStorage in a future iteration. The node's _3dLobe is
        // already mutated in-memory by RenderCore.moveNodeTo().
      },
      onRendererUnavailable: () => {
        // WebGL2 context permanently lost — fall back to Canvas2D.
        // Guarded against re-entrancy by the renderer's unavailableCalled flag.
        const fallback = new BrainRenderer();
        try {
          if (rendererRef.current) {
            try { rendererRef.current.stop(); } catch { /* swallow */ }
            rendererRef.current = null;
          }
          // The WebGL canvas's context is tainted — replace the canvas
          // so Canvas2D gets a clean surface.
          const fresh = recreateCanvas();
          if (!fresh) return;
          fallback.start(fresh, getGraph, {
            ...options,
            onRendererUnavailable: undefined, // Canvas2D has no fallback
          });
          rendererRef.current = fallback;
          startedRef.current = true;
          setRendererKind('canvas2d');
        } catch {
          setBootError('Brain Atlas could not start a renderer (WebGL2 and Canvas2D both unavailable).');
        }
      },
    };

    // Try WebGL2 first. If acquireSurface() returns false (no WebGL2),
    // BrainGLRenderer.start() throws — we catch and fall back to Canvas2D.
    try {
      const gl = new BrainGLRenderer();
      gl.start(canvas, getGraph, options);
      rendererRef.current = gl;
      startedRef.current = true;
      setRendererKind('webgl2');
      setBootError(null);
    } catch {
      // WebGL2 unavailable — fall back to Canvas2D. The canvas may be
      // tainted from the failed WebGL2 getContext() attempt, so recreate
      // it to give Canvas2D a clean surface.
      let surface: HTMLCanvasElement | null = canvas;
      try {
        // Test if the canvas can still acquire a 2D context. If not, recreate.
        const test = canvas.getContext('2d');
        if (!test) surface = recreateCanvas();
      } catch {
        surface = recreateCanvas();
      }
      if (!surface) {
        setBootError('Brain Atlas could not start a renderer.');
        return;
      }
      try {
        const fallback = new BrainRenderer();
        fallback.start(surface, getGraph, { ...options, onRendererUnavailable: undefined });
        rendererRef.current = fallback;
        startedRef.current = true;
        setRendererKind('canvas2d');
        setBootError(null);
      } catch {
        setBootError('Brain Atlas could not start a renderer (WebGL2 and Canvas2D both unavailable).');
      }
    }

    // ----------------------------------------------------------------
    // DISABLE NODE DRAGGING (read-only brain).
    //
    // The user requested that nodes cannot be modified -- only zoom,
    // rotate, read, and click-to-open should work. The brain-atlas
    // RenderCore.enterNodeDragMode() calls moveNodeTo() on every
    // pointermove during a node drag. By overriding moveNodeTo to a
    // no-op, the node's _3dLobe position never changes, so the node
    // stays where it was. The drag state is still entered/exited
    // normally (so focus/hover/click all still work), but no visual
    // movement occurs and onPinNode (already a no-op) is harmless.
    //
    // Click-to-open still works: onPointerUp with !moved sets focus
    // and our click listener fires setSelectedNode(). Right-click for
    // the context menu also still works (our contextmenu listener).
    // ----------------------------------------------------------------
    if (rendererRef.current) {
      const r = rendererRef.current as any;
      if (typeof r.moveNodeTo === 'function') {
        r.moveNodeTo = function (_nodeId: string, _position: any) {
          // no-op -- nodes are read-only in Olympus
        };
      }
    }

    // ----------------------------------------------------------------
    // DISABLE COMPASS PASS (remove the L/S/A axis widget).
    //
    // The brain-atlas renderer draws a compass gizmo (L=Left, S=Superior,
    // A=Anterior axes + circle) in the bottom-right corner of the
    // overlay canvas. The user requested it be removed. We use the
    // renderer's pass-gating test seam (setEnabledPassesForTest) to
    // exclude the "compass" pass. All other passes (background, haze,
    // cloud, edges, nodes, signals, labels) are explicitly enabled.
    // ----------------------------------------------------------------
    if (rendererRef.current) {
      const r = rendererRef.current as any;
      if (typeof r.setEnabledPassesForTest === 'function') {
        r.setEnabledPassesForTest(new Set([
          'background', 'haze', 'cloud', 'edges', 'nodes', 'signals', 'labels',
        ]));
      }
    }

    // ----------------------------------------------------------------
    // FIX RESIZE FLICKERING (fluid panel expand/contract).
    //
    // The brain-atlas renderer's resize() flow:
    //   1. ResizeObserver fires
    //   2. resize() calls resizeSurface() which sets canvas.width/height
    //      (this CLEARS the canvas to transparent black)
    //   3. resize() calls requestImmediateFrame() which schedules a RAF
    //   4. On the NEXT frame (16ms later), draw() -> drawScene() paints
    //
    // Between steps 2 and 4, the canvas is blank. During continuous
    // resizing (e.g., dragging the panel divider), this causes visible
    // flickering -- every resize callback clears the canvas and waits a
    // full frame before repainting.
    //
    // FIX: Override resize() to paint SYNCHRONOUSLY after resizeSurface().
    // We cancel the RAF that origResize() scheduled, then call draw()
    // directly so the canvas is repainted in the same JS tick -- no blank
    // frame. draw() then schedules the next frame normally, so the render
    // loop (including auto-rotate) continues uninterrupted.
    // ----------------------------------------------------------------
    if (rendererRef.current) {
      const r = rendererRef.current as any;
      if (typeof r.resize === 'function') {
        const origResize = r.resize.bind(r);
        r.resize = function () {
          origResize();
          // Cancel the RAF that origResize scheduled
          if (r.raf != null) {
            window.cancelAnimationFrame(r.raf);
            r.raf = null;
          }
          // Paint synchronously -- eliminates the 1-frame blank gap
          if (r.canvas && typeof r.isReady === 'function' && r.isReady()) {
            try { r.draw(performance.now()); } catch { /* swallow */ }
          }
        };
      }
    }

    // Recompute lobe stats after start.
    if (rendererRef.current) {
      setLobeStats(rendererRef.current.getLobeStats());
    }
  }

  /* ---------------------------------------------------------------- */
  /* Mount: start the renderer. Unmount: stop + null out refs.        */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!canvasRef.current) return;
    // Attach click + contextmenu listeners (the renderer attaches its
    // own pointerdown/move/up/wheel listeners in start()).
    attachCanvasListeners(canvasRef.current);
    startRenderer();
    return () => {
      // CRITICAL: stop the renderer on unmount. This:
      //   - cancels the RAF,
      //   - clears pending frame timeouts,
      //   - disconnects the ResizeObserver,
      //   - removes pointer/wheel/contextmenu listeners (the renderer's
      //     own listeners, attached in RenderCore.start()),
      //   - calls releaseSurface() which deletes all GL programs/buffers
      //     and removes the overlay canvas from the DOM.
      // Our own click/contextmenu listeners (added via
      // attachCanvasListeners) are GC'd along with the canvas when
      // React removes it from the DOM — no manual removal needed.
      const r = rendererRef.current;
      if (r) {
        try { r.stop(); } catch { /* swallow — unmounting anyway */ }
      }
      rendererRef.current = null;
      startedRef.current = false;
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* When options change (labels, lobes, perf preset), push them to   */
  /* the renderer via setOptions() instead of restarting.             */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !startedRef.current) return;
    r.setOptions({
      showLobeLabels,
      enabledLobes,
      performancePreset: perfPreset,
    });
  }, [showLobeLabels, enabledLobes, perfPreset]);

  /* ---------------------------------------------------------------- */
  /* Highlight lobe — push to renderer.                               */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !startedRef.current) return;
    r.setHighlightLobe(highlightLobe);
  }, [highlightLobe]);

  /* ---------------------------------------------------------------- */
  /* Toggle handlers.                                                  */
  /* ---------------------------------------------------------------- */
  const toggleLobe = useCallback((lobe: LobeName) => {
    setEnabledLobes(prev => setLobeEnabled(prev, lobe, !prev[lobe]));
  }, []);
  const toggleAllLobes = useCallback((enabled: boolean) => {
    setEnabledLobes(setAllLobes(enabled));
  }, []);
  const toggleLabels = useCallback(() => setShowLobeLabels(v => !v), []);

  /* ---------------------------------------------------------------- */
  /* Derived display values.                                           */
  /* ---------------------------------------------------------------- */
  const nodeCount = brainGraph.nodes.length;
  const edgeCount = brainGraph.edges.length;

  /* ---------------------------------------------------------------- */
  /* Render.                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div
      ref={containerRef}
      suppressHydrationWarning
      className="relative w-full h-full overflow-hidden bg-olympus-bg select-none"
      style={{
        backgroundColor: OLYMPUS_PALETTE.bg,
        backgroundImage: `
          radial-gradient(ellipse at center, ${OLYMPUS_PALETTE.bg} 0%, ${OLYMPUS_PALETTE.bgFar} 80%, #03050A 100%),
          radial-gradient(circle at 50% 50%, ${hexA(OLYMPUS_PALETTE.hud, 0.03)} 0%, transparent 60%)
        `,
      }}
      onMouseMove={onMouseMove}
    >
      {/* The renderer's canvas. The WebGL renderer also appends an
          overlay Canvas2D (class .brain-atlas-gl-overlay) on top of
          this for text labels — styled via globals.css. */}
      <canvas
        ref={canvasRef}
        className="brain-atlas-canvas"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          // Restored grab cursor. The brain is a 3D draggable surface;
          // grab/grabbing afford 'drag to rotate' (standard for 3D
          // viewers like VS Code / three.js). The pointermove handler
          // toggles between 'grab', 'grabbing', and 'pointer'.
          cursor: 'grab',
          touchAction: 'none',
        }}
      />

      {/* Boot error fallback */}
      {bootError && (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <X size={28} className="mx-auto mb-3 text-olympus-red" />
            <p className="text-xs font-mono text-olympus-text-dim leading-relaxed">{bootError}</p>
          </div>
        </div>
      )}

      {/* Hover tooltip — P4.2 enriched with god owner, confidence, scope, stacks, projects */}
      {hoverNode && !bootError && (
        <div
          className="fixed z-90 bg-olympus-card/95 backdrop-blur border border-olympus-gold/25 rounded-lg px-3 py-2 text-[10px] font-mono pointer-events-none shadow-2xl shadow-olympus-gold/10 max-w-64"
          style={{ left: mousePos.x + 14, top: mousePos.y + 14 }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: hoverNode.color, boxShadow: `0 0 6px ${hoverNode.color}` }}
            />
            <span className="text-olympus-gold font-semibold truncate">{hoverNode.name}</span>
            <span className="text-olympus-text-dim uppercase text-[8px] px-1 rounded bg-olympus-bg/50">
              {hoverNode.kindLabel}
            </span>
            {hoverNode._lobeName && (
              <span className="text-[8px] font-mono text-olympus-purple px-1 py-0.5 rounded ring-1 ring-olympus-purple/30 bg-olympus-purple/10 uppercase">
                {hoverNode._lobeName}
              </span>
            )}
          </div>
          {/* P4.2 — enriched fields */}
          <div className="space-y-0.5">
            {(hoverNode as any)._god && (
              <div className="text-olympus-text-dim">
                owner: <span className="text-olympus-gold capitalize">{(hoverNode as any)._god}</span>
              </div>
            )}
            {typeof (hoverNode as any)._confidence === 'number' && (
              <div className="text-olympus-text-dim flex items-center gap-1">
                conf:
                <span className="text-olympus-green">{Math.round((hoverNode as any)._confidence * 100)}%</span>
                <span className="inline-block w-12 h-1.5 bg-olympus-bg rounded-full overflow-hidden">
                  <span
                    className="block h-full bg-olympus-green"
                    style={{ width: `${(hoverNode as any)._confidence * 100}%` }}
                  />
                </span>
              </div>
            )}
            {(hoverNode as any)._scope && (
              <div className="text-olympus-text-dim">
                scope:{' '}
                <span className={
                  (hoverNode as any)._scope === 'global' ? 'text-olympus-green' :
                  (hoverNode as any)._scope === 'stack' ? 'text-olympus-cyan' :
                  (hoverNode as any)._scope === 'project' ? 'text-olympus-purple' :
                  'text-olympus-text'
                }>
                  {(hoverNode as any)._scope}
                </span>
                {(hoverNode as any)._crossStack && (
                  <span className="ml-1 text-[8px] px-1 rounded bg-olympus-amber-soft/20 text-olympus-amber-soft uppercase">cross-stack</span>
                )}
              </div>
            )}
            {(hoverNode as any)._stacks && (hoverNode as any)._stacks.length > 0 && (
              <div className="text-olympus-text-dim">
                stacks: <span className="text-olympus-text">{(hoverNode as any)._stacks.join(', ')}</span>
              </div>
            )}
            {(hoverNode as any)._projects && (hoverNode as any)._projects.length > 0 && (
              <div className="text-olympus-text-dim">
                projects: <span className="text-olympus-text">{(hoverNode as any)._projects.join(', ')}</span>
              </div>
            )}
            <div className="text-olympus-text-dim">
              degree: <span className="text-olympus-text">{hoverNode.degree}</span>
            </div>
          </div>
          <div className="text-[#5A5A5A] mt-1">click to open</div>
        </div>
      )}

      {/* Focus card (bottom-left) — shows the focused/clicked node.
          Responsive: narrower on small screens to avoid covering the brain.
          Lifted from `bottom-3` to `bottom-9` so it never collides with
          the bottom-center rotation hint when the Brain is zoomed out. */}
      {focusNode && !bootError && (
        <div className="absolute bottom-9 left-3 bg-olympus-card/85 backdrop-blur border border-olympus-gold/15 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] text-olympus-text font-mono pointer-events-none max-w-44 sm:max-w-72 z-10">
          <div className="text-[8px] text-olympus-text-dim uppercase tracking-wide mb-0.5">
            {focusNode.kindLabel} · {focusNode._lobeName ?? 'parietal'}
          </div>
          <div className="text-olympus-gold font-semibold text-[12px] truncate">{focusNode.name}</div>
          <div className="text-olympus-text-dim mt-0.5">{focusNode.degree} links</div>
        </div>
      )}

      {/* HUD (top-left) — renderer kind + active god.
          Responsive: god indicator hidden on very small screens to leave
          room for the centered SearchBar (which sits at top-1/2). */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 sm:gap-2 text-[10px] font-mono pointer-events-none z-10">
        <span className="flex items-center gap-1 sm:gap-1.5 bg-olympus-card/85 backdrop-blur border border-olympus-gold/15 rounded-full px-2 sm:px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-olympus-green animate-pulse shrink-0" />
          <span className="text-olympus-text-dim uppercase tracking-wide hidden xs:inline sm:inline">
            {rendererKind === 'webgl2' ? 'WebGL2' : rendererKind === 'canvas2d' ? 'Canvas2D' : '…'}
          </span>
        </span>
        {activeGod && (
          <span className="hidden sm:flex items-center gap-1.5 bg-olympus-gold/10 border border-olympus-gold/30 rounded-full px-2.5 py-1 text-olympus-gold">
            <span className="w-1.5 h-1.5 rounded-full bg-olympus-gold animate-pulse" />
            {GOD_NAMES[activeGod] || activeGod}
          </span>
        )}
      </div>

      {/* Controls (top-right) — labels toggle + perf preset.
          Responsive: text labels hidden on small screens (icon-only) so the
          controls never overlap the centered SearchBar. The "Names" toggle
          was removed — lobe labels are enough.

          z-index raised from z-10 to z-20 so the performance dropdown
          (Smooth / Balanced / Battery saver / Mobile) appears above the
          lobe toggle cluster (z-10). Previously the dropdown was clipped
          behind the lobe toggle buttons. */}
      <div className="absolute top-3 right-3 flex items-center gap-1 sm:gap-1.5 text-[10px] font-mono z-20">
        <button
          onClick={toggleLabels}
          aria-label="Toggle lobe labels"
          className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded border transition-colors ${
            showLobeLabels
              ? 'border-olympus-gold/40 bg-olympus-gold/15 text-olympus-gold'
              : 'border-olympus-gold/15 bg-olympus-card/85 text-olympus-text-dim hover:text-olympus-text'
          }`}
        >
          {showLobeLabels ? <Eye size={11} /> : <EyeOff size={11} />}
          <span className="hidden sm:inline">Labels</span>
        </button>

        <div className="relative">
          <button
            onClick={() => setShowPerfMenu(v => !v)}
            aria-label="Performance preset"
            aria-expanded={showPerfMenu}
            className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded border border-olympus-gold/15 bg-olympus-card/85 text-olympus-text-dim hover:text-olympus-text transition-colors"
          >
            <Gauge size={11} />
            <span className="hidden sm:inline">{PERFORMANCE_PRESETS.find(p => p.id === perfPreset)?.label ?? 'Smooth'}</span>
          </button>
          {/* v0.0.2 — Smooth menu open/close.
              The dropdown now fades + scales in (origin: top-right) over
              120ms with an ease-out curve, and fades out over 80ms. The
              keyframes live in globals.css (.brain-atlas-menu-enter /
              .brain-atlas-menu-exit) so they can be reused. */}
          {showPerfMenu && (
            <div
              className="absolute right-0 top-full mt-1 bg-olympus-card border border-olympus-gold/20 rounded-md py-1 min-w-40 shadow-md z-50 brain-atlas-menu-enter"
              role="menu"
            >
              {PERFORMANCE_PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPerfPreset(p.id); setShowPerfMenu(false); }}
                  className={`block w-full text-left px-3 py-1.5 hover:bg-olympus-gold/10 transition-colors ${
                    perfPreset === p.id ? 'text-olympus-gold' : 'text-olympus-text-dim'
                  }`}
                  role="menuitem"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lobe toggles (right side, below controls).
          Responsive: narrower max-width on small screens; All/None buttons
          stay visible (they're the most-used). */}
      <div className="absolute top-12 right-3 flex flex-col items-end gap-1 text-[9px] font-mono z-10">
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleAllLobes(true)}
            className="px-1.5 py-0.5 rounded border border-olympus-gold/15 bg-olympus-card/85 text-olympus-text-dim hover:text-olympus-text transition-colors"
          >All</button>
          <button
            onClick={() => toggleAllLobes(false)}
            className="px-1.5 py-0.5 rounded border border-olympus-gold/15 bg-olympus-card/85 text-olympus-text-dim hover:text-olympus-text transition-colors"
          >None</button>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-1 max-w-[120px] sm:max-w-[180px]">
          {(Object.keys(LOBE_CENTERS) as LobeName[]).map(lobe => {
            const enabled = enabledLobes[lobe];
            const color = LOBE_TINTS[lobe] ?? OLYMPUS_PALETTE.hud;
            return (
              <button
                key={lobe}
                onClick={() => toggleLobe(lobe)}
                onMouseEnter={() => { setHighlightLobe(lobe); setHoveredLobe(lobe); }}
                onMouseLeave={() => { setHighlightLobe(null); setHoveredLobe(null); }}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ${
                  enabled
                    ? 'border-olympus-gold/30 bg-olympus-gold/10 text-olympus-text'
                    : 'border-olympus-gold/10 bg-olympus-card/60 text-[#5A5A5A]'
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: color, opacity: enabled ? 1 : 0.4 }}
                />
                <span>{LOBE_SHORT[lobe]}</span>
                <span className="text-[#5A5A5A]">{lobeStats[lobe] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lobe hover tooltip (Olympus-styled, replaces native title) */}
      {hoveredLobe && (
        <div
          className="fixed z-90 bg-olympus-card/95 backdrop-blur border border-olympus-gold/25 rounded-lg px-3 py-2 text-[10px] font-mono pointer-events-none shadow-2xl shadow-olympus-gold/10 max-w-56"
          style={{ left: mousePos.x + 14, top: mousePos.y + 14 }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: LOBE_TINTS[hoveredLobe] ?? OLYMPUS_PALETTE.hud,
                boxShadow: `0 0 6px ${LOBE_TINTS[hoveredLobe] ?? OLYMPUS_PALETTE.hud}`,
              }}
            />
            <span className="text-olympus-gold font-semibold">{LOBE_CENTERS[hoveredLobe].label}</span>
            <span className="text-olympus-text-dim text-[8px] px-1 rounded bg-olympus-bg/50">
              {lobeStats[hoveredLobe] ?? 0} nodes
            </span>
          </div>
          <div className="text-olympus-text-dim text-[9px]">{LOBE_DESC[hoveredLobe].role}</div>
          <div className="text-[#5A5A5A] mt-0.5 text-[8px]">click to toggle visibility</div>
        </div>
      )}

      {/* Node count + status (bottom-right).
          Lifted from `bottom-3` to `bottom-9` so it never collides with
          the bottom-center rotation hint. */}
      <div className="absolute bottom-9 right-3 bg-olympus-card/85 backdrop-blur border border-olympus-gold/15 rounded-lg px-2 sm:px-2.5 py-1 text-[10px] text-olympus-text-dim font-mono pointer-events-none flex items-center gap-1.5 sm:gap-2 z-10">
        {nodeCount} nodes · {edgeCount} edges
        {rendererKind === 'canvas2d' && <span className="text-olympus-amber-soft ml-1 hidden sm:inline">· Canvas2D</span>}
      </div>

      {/* Brain atlas attribution (bottom-center, subtle).
          Responsive: hidden on very small screens to avoid overlapping the
          focus card (bottom-left) and node count (bottom-right). */}
      <div className="hidden md:block absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-[#5A5A5A] pointer-events-none whitespace-nowrap z-10">
        drag to rotate · scroll to zoom · click a node to open ·{' '}
        <a
          href="https://github.com/colorpulse6/brain-atlas"
          target="_blank"
          rel="noopener noreferrer"
          className="text-olympus-gold hover:underline"
        >
          brain-atlas (MIT)
        </a>
      </div>

      {/* DocumentViewerModal — opens when clicking a skill/instinct/knowledge
          node. Shows the source file with full scrolling + rendered markdown. */}
      {viewingDocNode && (
        <DocumentViewerModal
          node={viewingDocNode}
          onClose={() => setViewingDocNode(null)}
        />
      )}
    </div>
  );
}

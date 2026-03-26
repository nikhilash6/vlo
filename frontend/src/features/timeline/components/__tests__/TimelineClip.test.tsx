import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TimelineClipItem } from "../TimelineClip";
import { useTimelineStore } from "../../useTimelineStore";
import { useInteractionStore } from "../../hooks/useInteractionStore";
import type {
  TimelineClip as TimelineClipType,
  TimelineTrack,
} from "../../../../types/TimelineTypes";
import type { TimelineClipOverlayDefinition } from "../../clipOverlayApi";
import {
  createEndpointOverlayItem,
  createLayerTimeOverlayItem,
  createSourceTimeOverlayItem,
} from "../../clipOverlayApi";
import {
  PIXELS_PER_SECOND,
  TICKS_PER_SECOND,
  TRACK_HEADER_WIDTH,
} from "../../constants";

// --- MOCKS ---

const viewStoreState = vi.hoisted(() => ({
  zoomScale: 1,
}));

// Mock dnd-kit hooks to prevent errors during render
vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
    transform: null,
  }),
}));

// Mock the canvas component to avoid canvas context errors
vi.mock("../ThumbnailCanvas", () => ({
  ThumbnailCanvas: () => <div data-testid="thumbnail-canvas" />,
}));

// Mock View Store for zoom/pixel conversion
vi.mock("../../hooks/useTimelineViewStore", () => ({
  useTimelineViewStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        zoomScale: viewStoreState.zoomScale,
        ticksToPx: (ticks: number) =>
          (ticks / TICKS_PER_SECOND) * PIXELS_PER_SECOND * viewStoreState.zoomScale,
        pxToTicks: (pixels: number) =>
          Math.round(
            (pixels / (PIXELS_PER_SECOND * Math.max(0.001, viewStoreState.zoomScale))) *
              TICKS_PER_SECOND,
          ),
        setZoomScale: vi.fn(),
        setScrollContainer: vi.fn(),
        scrollContainer: null,
      }),
    {
      getState: () => ({
        zoomScale: viewStoreState.zoomScale,
        ticksToPx: (ticks: number) =>
          (ticks / TICKS_PER_SECOND) * PIXELS_PER_SECOND * viewStoreState.zoomScale,
        pxToTicks: (pixels: number) =>
          Math.round(
            (pixels / (PIXELS_PER_SECOND * Math.max(0.001, viewStoreState.zoomScale))) *
              TICKS_PER_SECOND,
          ),
        setZoomScale: vi.fn(),
        setScrollContainer: vi.fn(),
        scrollContainer: null,
      }),
      subscribe: vi.fn(() => vi.fn()),
    },
  ),
}));

describe("TimelineClip Visual Geometry", () => {
  const mockClip: TimelineClipType = {
    id: "clip_1",
    trackId: "track_1",
    start: 100,
    timelineDuration: 200,
    type: "video",
    name: "Test Clip",
    transformations: [],
    offset: 0,
    sourceDuration: 200,
    transformedDuration: 200,
    transformedOffset: 0,
    croppedSourceDuration: 200,
  };

  function createOverlay(
    definitionId: string,
    items: ReturnType<TimelineClipOverlayDefinition["useItems"]>,
  ): TimelineClipOverlayDefinition {
    return {
      id: definitionId,
      useItems: () => items,
    };
  }

  beforeEach(() => {
    // Reset stores
    viewStoreState.zoomScale = 1;
    useTimelineStore.setState({
      selectedClipIds: [],
      tracks: [{ id: "track_1", label: "Track 1" } as unknown as TimelineTrack],
    });
    useInteractionStore.setState({ activeId: null, operation: null });

    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = vi.fn();
    }
  });

  it("REGRESSION: Renders with strict 0px offset when in Overlay mode", () => {
    // This guards against the 'Ghost Offset' bug where the header width
    // was accidentally applied to the drag overlay.

    render(<TimelineClipItem clip={mockClip} isOverlay={true} />);

    const clipElement = screen.getByTestId("timeline-clip");

    // 1. Must NOT rely on calculation
    expect(clipElement.style.left).toBe("0px");

    // 2. Must NOT contain the header width variable or constant
    expect(clipElement.style.left).not.toContain(`${TRACK_HEADER_WIDTH}px`);
  });

  it("REGRESSION: Renders with robust calc() formula in Standard mode", () => {
    // This guards against the 'Resize Flush Left' bug.
    // We ensure the clip is anchored to the Header Width and Zoom.

    render(<TimelineClipItem clip={mockClip} isOverlay={false} />);

    const clipElement = screen.getByTestId("timeline-clip");

    // The raw inline style should contain our robust formula
    const inlineLeft = clipElement.style.left;

    // 1. Must anchor to Header Width
    expect(inlineLeft).toContain(`${TRACK_HEADER_WIDTH}px`);

    // 2. Must scale with Zoom
    expect(inlineLeft).toContain("var(--timeline-zoom, 1)");

    // 3. Must include the delta variable for hardware-accelerated resizing
    expect(inlineLeft).toContain("var(--drag-delta-x, 0px)");
  });

  it("applies resize deltas via CSS variables", () => {
    // Simulate a resize operation active on this clip
    useInteractionStore.setState({
      activeId: `resize_left_${mockClip.id}`,
      operation: "resize_left",
      currentDeltaX: 50,
      constraints: { minPx: -100, maxPx: 100 },
    });

    render(<TimelineClipItem clip={mockClip} isOverlay={false} />);
    const clipElement = screen.getByTestId("timeline-clip");

    // We can check if the style property was set on the element
    // Note: In JSDOM, style properties set via JS are reflected in the style object
    expect(clipElement.style.getPropertyValue("--drag-delta-x")).toBe("50px");
    expect(clipElement.style.getPropertyValue("--drag-delta-w")).toBe("-50px");
  });

  it("renders always-on overlay items while hiding selected-only items for unselected clips", () => {
    const overlays = [
      createOverlay("overlay-visibility", [
        createEndpointOverlayItem({
          id: "always-item",
          edge: "start",
          content: <div>Always</div>,
        }),
        createEndpointOverlayItem({
          id: "selected-item",
          edge: "end",
          visibility: "selected",
          content: <div>Selected</div>,
        }),
      ]),
    ];

    render(
      <TimelineClipItem
        clip={{ ...mockClip, timelineDuration: TICKS_PER_SECOND }}
        clipOverlays={overlays}
      />,
    );

    expect(screen.getByText("Always")).toBeInTheDocument();
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
  });

  it("pins endpoint overlay items to the visible clip edge and hides width-sensitive items when the clip is too narrow", () => {
    const endpointItem = createEndpointOverlayItem({
      id: "edge-item",
      edge: "start",
      insetPx: 12,
      minClipWidthPx: 60,
      content: <div>Edge</div>,
    });
    const overlays = [createOverlay("overlay-edge", [endpointItem])];

    viewStoreState.zoomScale = 0.5;
    const { rerender, queryByText } = render(
      <TimelineClipItem
        clip={{ ...mockClip, timelineDuration: TICKS_PER_SECOND }}
        clipOverlays={overlays}
      />,
    );

    expect(queryByText("Edge")).not.toBeInTheDocument();

    viewStoreState.zoomScale = 1;
    rerender(
      <TimelineClipItem
        clip={{ ...mockClip, timelineDuration: TICKS_PER_SECOND }}
        clipOverlays={overlays}
      />,
    );

    const edgeItem = screen.getByText("Edge").parentElement as HTMLElement;
    expect(edgeItem.style.marginLeft).toBe("12px");
    expect(edgeItem.style.left).toBe("");
  });

  it("positions source-time and layer-time overlay items using transformed visual time", () => {
    const speedClip: TimelineClipType = {
      ...mockClip,
      start: 0,
      timelineDuration: 2 * TICKS_PER_SECOND,
      sourceDuration: 2 * TICKS_PER_SECOND,
      transformedDuration: TICKS_PER_SECOND,
      croppedSourceDuration: 2 * TICKS_PER_SECOND,
      transformations: [
        {
          id: "speed_1",
          type: "speed",
          isEnabled: true,
          parameters: { factor: 2 },
        },
      ],
    };

    const overlays = [
      createOverlay("overlay-time-mapping", [
        createSourceTimeOverlayItem({
          id: "source-item",
          sourceTimeTicks: TICKS_PER_SECOND,
          content: <div>Source</div>,
        }),
        createLayerTimeOverlayItem({
          id: "layer-item",
          transformId: "speed_1",
          layerInputTicks: TICKS_PER_SECOND,
          content: <div>Layer</div>,
        }),
      ]),
    ];

    render(<TimelineClipItem clip={speedClip} clipOverlays={overlays} />);

    const expectedBaseLeft = `${
      (TICKS_PER_SECOND / 2 / TICKS_PER_SECOND) * PIXELS_PER_SECOND
    }px`;
    const sourceItem = screen.getByText("Source").parentElement as HTMLElement;
    const layerItem = screen.getByText("Layer").parentElement as HTMLElement;

    expect(sourceItem.style.left).toContain(expectedBaseLeft);
    expect(layerItem.style.left).toContain(expectedBaseLeft);
  });

  it("emits pointer-drag callbacks with clip-local and time-mapped positions without firing click handlers", () => {
    const onClick = vi.fn();
    const onDragStart = vi.fn();
    const onDrag = vi.fn();
    const onDragEnd = vi.fn();

    const overlays = [
      createOverlay("overlay-drag", [
        createEndpointOverlayItem({
          id: "drag-item",
          edge: "start",
          content: <div>Drag</div>,
          onClick,
          drag: {
            onDragStart,
            onDrag,
            onDragEnd,
          },
        }),
      ]),
    ];

    render(
      <TimelineClipItem
        clip={{ ...mockClip, start: 0, timelineDuration: 2 * TICKS_PER_SECOND }}
        clipOverlays={overlays}
      />,
    );

    const clipElement = screen.getByTestId("timeline-clip");
    Object.defineProperty(clipElement, "getBoundingClientRect", {
      value: () => ({
        left: 10,
        top: 0,
        width: 200,
        height: 40,
        right: 210,
        bottom: 40,
        x: 10,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const dragItem = screen.getByText("Drag").parentElement as HTMLElement;

    fireEvent.pointerDown(dragItem, { pointerId: 1, clientX: 60 });
    fireEvent.pointerMove(dragItem, { pointerId: 1, clientX: 110 });
    fireEvent.pointerUp(dragItem, { pointerId: 1, clientX: 130 });
    fireEvent.click(dragItem);

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDrag).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();

    expect(onDragStart.mock.calls[0][0]).toMatchObject({
      clipLocalX: 50,
      visualTimeTicks: 0.5 * TICKS_PER_SECOND,
      sourceTimeTicks: 0.5 * TICKS_PER_SECOND,
    });
    expect(onDrag.mock.calls[0][0]).toMatchObject({
      clipLocalX: 100,
      deltaClipX: 50,
    });
    expect(onDragEnd.mock.calls[0][0]).toMatchObject({
      clipLocalX: 120,
      deltaClipX: 70,
    });
  });
});
